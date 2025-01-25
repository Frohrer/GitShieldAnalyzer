import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { SecurityRule, SecurityFinding, TreeNode, AnalysisReport } from '@/lib/types';
import { analyzeCode } from './llmService';
import { calculateFileHash, hasBeenAnalyzed, recordAnalysis } from './fileHashService';
import { WebSocketServer } from 'ws';
import type { Server } from 'http';

const execAsync = promisify(exec);

interface RepoMetadata {
  owner?: string;
  repoName?: string;
  url?: string;
}

interface ProgressUpdate {
  type: 'progress';
  current: number;
  total: number;
  file?: string;
}

let wss: WebSocketServer | null = null;

export function initWebSocket(server: Server) {
  try {
    wss = new WebSocketServer({ server, path: '/api/analysis-progress' });
    console.log('WebSocket server initialized for analysis progress updates');

    wss.on('connection', (ws) => {
      console.log('New WebSocket client connected');

      ws.on('error', (error) => {
        console.error('WebSocket client error:', error);
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
      });
    });
  } catch (error) {
    console.error('Failed to initialize WebSocket server:', error);
  }
}

async function broadcastProgress(update: ProgressUpdate) {
  if (!wss) {
    console.log('No WebSocket server available');
    return;
  }

  const message = JSON.stringify(update);
  console.log('Broadcasting progress update:', message);

  let clientCount = 0;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocketServer.OPEN) {
      client.send(message);
      clientCount++;
    }
  });
  console.log(`Progress update sent to ${clientCount} clients`);
}

async function countAnalyzableFiles(dir: string): Promise<number> {
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', '.git'].includes(entry.name)) {
      count += await countAnalyzableFiles(fullPath);
    } else if (entry.isFile() && shouldAnalyzeFile(entry.name)) {
      count++;
    }
  }

  return count;
}

export async function analyzeRepository(
  sourcePath: string,
  rules: SecurityRule[],
  metadata?: RepoMetadata
): Promise<{ report: AnalysisReport; tree: TreeNode }> {
  let extractPath = sourcePath;
  let needsCleanup = false;
  let totalFiles = 0;
  let analyzedFiles = 0;

  try {
    console.log('Starting repository analysis', { sourcePath, isZip: sourcePath.endsWith('.zip') });

    // If the source is a zip file, extract it
    if (sourcePath.endsWith('.zip')) {
      console.log('Zip file detected, extracting...');
      extractPath = path.join(path.dirname(sourcePath), 'extracted-' + path.basename(sourcePath, '.zip'));
      needsCleanup = true;

      try {
        await fs.mkdir(extractPath, { recursive: true, mode: 0o777 });
        console.log(`Created extraction directory: ${extractPath}`);
        await fs.chmod(sourcePath, 0o666);
        console.log('Set permissions on zip file');
        await execAsync(`unzip -o -q "${sourcePath}" -d "${extractPath}"`);
        await execAsync(`chmod -R 777 "${extractPath}"`);
        console.log('Extraction complete');
      } catch (error) {
        console.error('Extraction error:', error);
        throw new Error('Failed to extract repository. Please ensure the file is a valid zip archive.');
      }
    }

    // Get repository name
    const repositoryName = await getRepositoryName(extractPath, metadata);
    console.log('Repository name:', repositoryName);

    // Build repository tree
    console.log('Building repository tree...');
    const tree = await buildDirectoryTree(extractPath);

    // Count total analyzable files
    totalFiles = await countAnalyzableFiles(extractPath);
    console.log(`Total analyzable files: ${totalFiles}`);

    // Send initial progress
    await broadcastProgress({ type: 'progress', current: 0, total: totalFiles });

    // Check if the repository has any analyzable content
    if (totalFiles === 0) {
      throw new Error('No analyzable files found in the repository. Please ensure it contains supported source code files.');
    }

    console.log('Starting security analysis...');
    const findings: SecurityFinding[] = [];

    // Analyze files
    await analyzeFiles(extractPath, rules, findings, async (file) => {
      analyzedFiles++;
      console.log(`Progress: ${analyzedFiles}/${totalFiles} files (${Math.round((analyzedFiles/totalFiles) * 100)}%) - Current: ${file}`);
      await broadcastProgress({
        type: 'progress',
        current: analyzedFiles,
        total: totalFiles,
        file
      });
    });

    console.log(`Analysis complete. Found ${findings.length} security issues.`);
    const severity = calculateOverallSeverity(findings);

    const report: AnalysisReport = {
      repositoryName,
      findings,
      severity,
      timestamp: new Date().toISOString(),
    };

    return { report, tree };
  } catch (error) {
    console.error('Repository analysis failed:', error);
    throw error;
  } finally {
    if (needsCleanup) {
      try {
        await fs.rm(extractPath, { recursive: true, force: true });
        if (sourcePath.endsWith('.zip')) {
          await fs.unlink(sourcePath);
        }
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }
  }
}

async function hasAnalyzableFiles(dir: string): Promise<boolean> {
  try {
    console.log(`Scanning directory for analyzable files: ${dir}`);
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip .git and node_modules directories
      if (entry.isDirectory() && !['node_modules', '.git'].includes(entry.name)) {
        console.log(`Checking subdirectory: ${entry.name}`);
        // Recursively check subdirectories
        const hasFiles = await hasAnalyzableFiles(fullPath);
        if (hasFiles) return true;
      } else if (entry.isFile()) {
        console.log(`Checking file: ${entry.name}`);
        if (shouldAnalyzeFile(entry.name)) {
          console.log(`Found analyzable file: ${entry.name}`);
          return true;
        }
      }
    }
  } catch (error) {
    console.error(`Error checking directory ${dir}:`, error);
  }

  return false;
}

async function getRepositoryName(extractPath: string, metadata?: RepoMetadata): Promise<string> {
  // If we have metadata from GitHub, use that first
  if (metadata?.repoName) {
    return metadata.repoName;
  }

  try {
    // Try to get the name from git config if it exists
    const gitConfigPath = path.join(extractPath, '.git', 'config');
    try {
      const gitConfig = await fs.readFile(gitConfigPath, 'utf-8');
      const urlMatch = gitConfig.match(/url\s*=\s*.*?([^/]+?)(?:\.git)?$/m);
      if (urlMatch) {
        return urlMatch[1];
      }
    } catch {
      // Git config doesn't exist or can't be read, continue to fallback methods
    }

    // Try to find a package.json and use its name
    try {
      const packageJsonPath = path.join(extractPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      if (packageJson.name) {
        return packageJson.name;
      }
    } catch {
      // package.json doesn't exist or can't be parsed
    }

    // Fallback: use the name of the root directory
    const dirName = path.basename(extractPath);
    // If the directory is named 'extracted', try its parent
    if (dirName === 'extracted') {
      return path.basename(path.dirname(extractPath));
    }
    return dirName;
  } catch (error) {
    console.error('Error getting repository name:', error);
    return 'unnamed-repository';
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
        // Only filter node_modules and .git, allow other directories
        .filter(item => !['node_modules', '.git'].includes(item))
        .map(async (item) => {
          try {
            return await buildDirectoryTree(path.join(dir, item));
          } catch (error) {
            console.error(`Error processing ${item}:`, error);
            return null;
          }
        })
    );

    // Only consider the repository empty if there are no visible files/directories
    const filteredChildren = children.filter((child): child is TreeNode => child !== null);

    return {
      name,
      path: dir,
      type: 'directory',
      children: filteredChildren.sort((a, b) => {
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
  findings: SecurityFinding[],
  onProgress: (file: string) => void
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      await analyzeFiles(fullPath, rules, findings, onProgress);
      continue;
    }

    if (!entry.isFile() || !shouldAnalyzeFile(entry.name)) continue;

    try {
      console.log(`Analyzing file: ${fullPath}`);
      onProgress(entry.name);
      const content = await fs.readFile(fullPath, 'utf-8');
      const fileHash = await calculateFileHash(content);
      const repoName = path.basename(dir);
      const relativePath = path.relative(dir, fullPath);

      for (const rule of rules) {
        console.log(`Checking if ${entry.name} needs analysis for rule "${rule.name}"`);

        // Check if this file has already been analyzed with this rule
        const { analyzed, findings: existingFindings } = await hasBeenAnalyzed(
          relativePath,
          fileHash,
          repoName,
          rule.id
        );

        if (analyzed) {
          console.log(`Using cached analysis for ${entry.name} with rule "${rule.name}"`);
          if (existingFindings && existingFindings.length > 0) {
            findings.push(...existingFindings);
          }
          continue;
        }

        console.log(`Applying rule "${rule.name}" to ${entry.name}`);
        try {
          const analysis = await analyzeCode(content, rule);

          let fileFindings: SecurityFinding[] = [];
          if (analysis) {
            console.log(`Found vulnerability in ${entry.name} using rule "${rule.name}"`);
            const finding: SecurityFinding = {
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              location: relativePath,
              description: analysis.description,
              recommendation: analysis.recommendation,
              lineNumber: analysis.lineNumber,
              codeSnippet: analysis.codeSnippet,
              fileContent: content,
            };
            fileFindings.push(finding);
            findings.push(finding);
          }

          // Record analysis result with any findings
          await recordAnalysis(relativePath, fileHash, repoName, rule.id, fileFindings);
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
  const isAnalyzable = extensions.some(ext => filename.toLowerCase().endsWith(ext));
  console.log(`File ${filename} is ${isAnalyzable ? '' : 'not '}analyzable`);
  return isAnalyzable;
}

function calculateOverallSeverity(findings: SecurityFinding[]): 'low' | 'medium' | 'high' {
  if (findings.some(f => f.severity === 'high')) return 'high';
  if (findings.some(f => f.severity === 'medium')) return 'medium';
  return 'low';
}