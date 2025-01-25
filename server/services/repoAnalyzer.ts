import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { SecurityRule, SecurityFinding, TreeNode, AnalysisReport } from '@/lib/types';
import { analyzeCode } from './llmService';

const execAsync = promisify(exec);

export async function analyzeRepository(
  zipPath: string,
  rules: SecurityRule[]
): Promise<{ report: AnalysisReport; tree: TreeNode }> {
  const extractPath = path.join(path.dirname(zipPath), 'extracted');

  try {
    // Create extraction directory
    await fs.mkdir(extractPath, { recursive: true });

    // Extract zip file with error handling
    try {
      await execAsync(`unzip -q "${zipPath}" -d "${extractPath}"`);
    } catch (error) {
      throw new Error('Failed to extract repository. Please ensure the file is a valid zip archive.');
    }

    // Build repository tree
    const tree = await buildDirectoryTree(extractPath);
    if (!tree.children || tree.children.length === 0) {
      throw new Error('The uploaded zip file appears to be empty or invalid.');
    }

    // Analyze files
    const findings: SecurityFinding[] = [];
    await analyzeFiles(extractPath, rules, findings);

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
      .map(item => buildDirectoryTree(path.join(dir, item)))
  );

  return {
    name,
    path: dir,
    type: 'directory',
    children: children.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'directory' ? -1 : 1;
    }),
  };
}

async function analyzeFiles(
  dir: string,
  rules: SecurityRule[],
  findings: SecurityFinding[]
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      await analyzeFiles(fullPath, rules, findings);
      continue;
    }

    if (!entry.isFile() || !shouldAnalyzeFile(entry.name)) continue;

    try {
      const content = await fs.readFile(fullPath, 'utf-8');

      for (const rule of rules) {
        try {
          const analysis = await analyzeCode(content, rule);
          if (analysis) {
            findings.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              location: path.relative(dir, fullPath),
              ...analysis,
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