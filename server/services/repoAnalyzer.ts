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
  wss = new WebSocketServer({ server, path: '/api/analysis-progress' });
  console.log('WebSocket server initialized');
}

function broadcastProgress(update: ProgressUpdate) {
  if (!wss) return;

  const message = JSON.stringify(update);
  console.log('Progress update:', update);

  wss.clients.forEach(client => {
    try {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    } catch (error) {
      console.error('Failed to send progress update:', error);
    }
  });
}

function shouldAnalyzeFile(filename: string): boolean {
  const extensions = [
    '.js', '.jsx', '.ts', '.tsx',
    '.py', '.rb', '.php', '.java',
    '.go', '.cs', '.cpp', '.c',
  ];
  return extensions.some(ext => filename.toLowerCase().endsWith(ext));
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

async function analyzeFiles(
  dir: string,
  rules: SecurityRule[],
  findings: SecurityFinding[],
  totalFiles: number,
  processedFiles: { count: number },
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && !['node_modules', '.git'].includes(entry.name)) {
      await analyzeFiles(fullPath, rules, findings, totalFiles, processedFiles);
      continue;
    }

    if (!entry.isFile() || !shouldAnalyzeFile(entry.name)) continue;

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      processedFiles.count++;

      // Send progress update
      broadcastProgress({
        type: 'progress',
        current: processedFiles.count,
        total: totalFiles,
        file: entry.name
      });

      const fileHash = await calculateFileHash(content);
      const repoName = path.basename(dir);
      const relativePath = path.relative(dir, fullPath);

      for (const rule of rules) {
        const { analyzed, findings: existingFindings } = await hasBeenAnalyzed(
          relativePath,
          fileHash,
          repoName,
          rule.id
        );

        if (analyzed) {
          if (existingFindings && existingFindings.length > 0) {
            findings.push(...existingFindings);
          }
          continue;
        }

        const analysis = await analyzeCode(content, rule);
        if (analysis) {
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
          findings.push(finding);
          await recordAnalysis(relativePath, fileHash, repoName, rule.id, [finding]);
        } else {
          await recordAnalysis(relativePath, fileHash, repoName, rule.id, []);
        }
      }
    } catch (error) {
      console.error(`Error analyzing file ${fullPath}:`, error);
    }
  }
}

export async function analyzeRepository(
  sourcePath: string,
  rules: SecurityRule[],
  metadata?: RepoMetadata
): Promise<{ report: AnalysisReport; tree: TreeNode }> {
  let extractPath = sourcePath;
  let needsCleanup = false;

  try {
    // Handle zip file extraction
    if (sourcePath.endsWith('.zip')) {
      extractPath = path.join(path.dirname(sourcePath), 'extracted-' + path.basename(sourcePath, '.zip'));
      needsCleanup = true;

      await fs.mkdir(extractPath, { recursive: true });
      await execAsync(`unzip -o -q "${sourcePath}" -d "${extractPath}"`);
    }

    // Count total files before starting analysis
    const totalFiles = await countAnalyzableFiles(extractPath);
    console.log(`Total analyzable files: ${totalFiles}`);

    if (totalFiles === 0) {
      throw new Error('No analyzable files found in the repository');
    }

    // Initialize progress tracking
    const processedFiles = { count: 0 };
    broadcastProgress({ type: 'progress', current: 0, total: totalFiles });

    // Build repository tree
    const tree = await buildDirectoryTree(extractPath);
    const findings: SecurityFinding[] = [];

    // Analyze files
    await analyzeFiles(extractPath, rules, findings, totalFiles, processedFiles);

    // Calculate overall severity
    const severity = findings.some(f => f.severity === 'high') ? 'high' :
                    findings.some(f => f.severity === 'medium') ? 'medium' : 'low';

    const report: AnalysisReport = {
      repositoryName: metadata?.repoName || path.basename(extractPath),
      findings,
      severity,
      timestamp: new Date().toISOString(),
    };

    return { report, tree };
  } finally {
    if (needsCleanup) {
      try {
        await fs.rm(extractPath, { recursive: true, force: true });
        await fs.unlink(sourcePath);
      } catch (error) {
        console.error('Cleanup error:', error);
      }
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

  const entries = await fs.readdir(dir);
  const children = await Promise.all(
    entries
      .filter(item => !['node_modules', '.git'].includes(item))
      .map(async (item) => {
        try {
          return await buildDirectoryTree(path.join(dir, item));
        } catch {
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
}