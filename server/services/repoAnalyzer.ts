import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { SecurityRule, SecurityFinding, TreeNode, AnalysisReport } from '@/lib/types';
import { analyzeCode } from './llmService';
import { calculateFileHash, hasBeenAnalyzed, recordAnalysis } from './fileHashService';

const execAsync = promisify(exec);

export async function analyzeRepository(
  zipPath: string,
  rules: SecurityRule[]
): Promise<{ report: AnalysisReport; tree: TreeNode }> {
  const extractPath = path.join(path.dirname(zipPath), 'extracted');

  try {
    console.log('Starting repository analysis');
    // Create extraction directory with proper permissions
    await fs.mkdir(extractPath, { recursive: true, mode: 0o777 });

    // Ensure proper permissions for the zip file
    await fs.chmod(zipPath, 0o666);

    // Extract zip file with error handling
    try {
      console.log('Extracting repository...');
      await execAsync(`unzip -o -q "${zipPath}" -d "${extractPath}"`);
      // Set permissions for extracted files
      await execAsync(`chmod -R 777 "${extractPath}"`);
    } catch (error) {
      throw new Error('Failed to extract repository. Please ensure the file is a valid zip archive.');
    }

    // Build repository tree
    console.log('Building repository tree...');
    const tree = await buildDirectoryTree(extractPath);
    if (!tree.children || tree.children.length === 0) {
      throw new Error('The uploaded zip file appears to be empty or invalid.');
    }

    console.log('Starting security analysis...');
    // Analyze files
    const findings: SecurityFinding[] = [];
    await analyzeFiles(extractPath, rules, findings);
    console.log(`Analysis complete. Found ${findings.length} security issues.`);

    // Calculate overall severity
    const severity = calculateOverallSeverity(findings);

    // Create report
    const report: AnalysisReport = {
      repositoryName: path.basename(zipPath, '.zip'),
      findings,
      severity,
      timestamp: new Date().toISOString(),
    };

    return { report, tree };
  } catch (error) {
    console.error('Repository analysis failed:', error);
    // Make sure to clean up even if there's an error
    try {
      await fs.rm(extractPath, { recursive: true, force: true });
      await fs.unlink(zipPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  } finally {
    // Clean up in success case
    try {
      await fs.rm(extractPath, { recursive: true, force: true });
      await fs.unlink(zipPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function buildDirectoryTree(dir: string): Promise<TreeNode> {
  try {
    const name = path.basename(dir);
    const stats = await fs.stat(dir);

    if (!stats.isDirectory()) {
      return {
        name,
        path: dir,
        type: 'file',
      };
    }

    const children = await Promise.all(
      (await fs.readdir(dir))
        .filter(item => !item.startsWith('.') && item !== 'node_modules')
        .map(async (item) => {
          try {
            return await buildDirectoryTree(path.join(dir, item));
          } catch (error) {
            console.error(`Error processing ${item}:`, error);
            return null;
          }
        })
    );

    return {
      name,
      path: dir,
      type: 'directory',
      children: children.filter((child): child is TreeNode => child !== null)
        .sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'directory' ? -1 : 1;
        }),
    };
  } catch (error) {
    console.error(`Error building directory tree for ${dir}:`, error);
    throw error;
  }
}

async function analyzeFiles(
  dir: string,
  rules: SecurityRule[],
  findings: SecurityFinding[]
): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    console.log(`Analyzing directory: ${dir}`);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await analyzeFiles(fullPath, rules, findings);
        continue;
      }

      if (!entry.isFile() || !shouldAnalyzeFile(entry.name)) continue;

      try {
        console.log(`Analyzing file: ${fullPath}`);
        const content = await fs.readFile(fullPath, 'utf-8');
        const fileHash = await calculateFileHash(content);
        const repoName = path.basename(dir);
        const relativePath = path.relative(dir, fullPath);

        for (const rule of rules) {
          console.log(`Checking if ${entry.name} needs analysis for rule "${rule.name}"`);

          // Check if this file has already been analyzed with this rule
          if (await hasBeenAnalyzed(relativePath, fileHash, repoName, rule.id)) {
            console.log(`Skipping analysis of ${entry.name} for rule "${rule.name}" - already analyzed`);
            continue;
          }

          console.log(`Applying rule "${rule.name}" to ${entry.name}`);
          try {
            const analysis = await analyzeCode(content, rule);

            // Record that we analyzed this file with this rule
            await recordAnalysis(relativePath, fileHash, repoName, rule.id);

            if (analysis) {
              console.log(`Found vulnerability in ${entry.name} using rule "${rule.name}"`);
              findings.push({
                ruleId: rule.id,
                ruleName: rule.name,
                severity: rule.severity,
                location: relativePath,
                description: analysis.description,
                recommendation: analysis.recommendation,
                lineNumber: analysis.lineNumber,
                codeSnippet: analysis.codeSnippet,
                fileContent: content, // Include full file content for Monaco editor
              });
            }
          } catch (error) {
            console.error(`Error analyzing ${fullPath} with rule ${rule.name}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error reading file ${fullPath}:`, error);
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dir}:`, error);
  }
}

function shouldAnalyzeFile(filename: string): boolean {
  const extensions = [
    '.js', '.jsx', '.ts', '.tsx',
    '.py', '.rb', '.php', '.java',
    '.go', '.cs', '.cpp', '.c',
  ];
  return extensions.some(ext => filename.endsWith(ext));
}

function calculateOverallSeverity(findings: SecurityFinding[]): 'low' | 'medium' | 'high' {
  if (findings.some(f => f.severity === 'high')) return 'high';
  if (findings.some(f => f.severity === 'medium')) return 'medium';
  return 'low';
}