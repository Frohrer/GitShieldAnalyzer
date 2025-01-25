import crypto from 'crypto';
import { db } from '@db';
import { analyzedFiles, fileRuleAnalyses } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import type { SecurityFinding } from '@/lib/types';

export async function calculateFileHash(content: string): Promise<string> {
  return crypto.createHash('sha1').update(content).digest('hex');
}

export async function hasBeenAnalyzed(
  filePath: string, 
  fileHash: string, 
  repositoryName: string,
  ruleId: number
): Promise<{ analyzed: boolean, findings?: SecurityFinding[] }> {
  // Check if file exists and hash matches
  const file = await db.query.analyzedFiles.findFirst({
    where: and(
      eq(analyzedFiles.filePath, filePath),
      eq(analyzedFiles.fileHash, fileHash),
      eq(analyzedFiles.repositoryName, repositoryName)
    ),
  });

  if (!file) return { analyzed: false };

  // Check if this rule has been applied to this file
  const analysis = await db.query.fileRuleAnalyses.findFirst({
    where: and(
      eq(fileRuleAnalyses.fileId, file.id),
      eq(fileRuleAnalyses.ruleId, ruleId)
    ),
  });

  if (!analysis) return { analyzed: false };
  return { analyzed: true, findings: analysis.findings || [] };
}

export async function recordAnalysis(
  filePath: string,
  fileHash: string,
  repositoryName: string,
  ruleId: number,
  findings?: SecurityFinding[]
): Promise<void> {
  // Get or create file record
  let file = await db.query.analyzedFiles.findFirst({
    where: and(
      eq(analyzedFiles.filePath, filePath),
      eq(analyzedFiles.repositoryName, repositoryName)
    ),
  });

  if (!file) {
    const [newFile] = await db.insert(analyzedFiles)
      .values({
        filePath,
        fileHash,
        repositoryName,
      })
      .returning();
    file = newFile;
  } else {
    // Update hash and timestamp if file exists
    await db.update(analyzedFiles)
      .set({ 
        fileHash,
        lastAnalyzed: new Date(),
      })
      .where(eq(analyzedFiles.id, file.id));
  }

  // Record rule analysis with findings
  await db.insert(fileRuleAnalyses)
    .values({
      fileId: file.id,
      ruleId,
      findings: findings || null,
    });
}