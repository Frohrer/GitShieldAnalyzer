import { Router } from 'express';
import { db } from '@db';
import { scanStatus, analysisResults } from '@db/schema';
import { desc, eq } from 'drizzle-orm';

const router = Router();

// Get all scans (in-progress and completed)
router.get('/status', async (req, res) => {
  try {
    // Ensure the query is working by logging
    console.log('Fetching scan status...');
    
    // Get scans with their latest analysis results
    const scans = await db
      .select({
        id: scanStatus.id,
        repositoryName: scanStatus.repositoryName,
        status: scanStatus.status,
        progress: scanStatus.progress,
        currentFile: scanStatus.currentFile,
        totalFiles: scanStatus.totalFiles,
        startedAt: scanStatus.startedAt,
        completedAt: scanStatus.completedAt,
        error: scanStatus.error,
        severity: analysisResults.severity,
      })
      .from(scanStatus)
      .leftJoin(
        analysisResults,
        eq(scanStatus.id, analysisResults.scanId)
      )
      .orderBy(desc(scanStatus.startedAt))
      .limit(50);
    
    // Log the response for debugging
    console.log('Scan status response:', scans);
    
    // Ensure we're sending a valid JSON array
    if (!Array.isArray(scans)) {
      console.error('Expected scans to be an array, got:', typeof scans);
      return res.status(500).json({ 
        message: 'Invalid scan data format' 
      });
    }
    
    // Send the response with proper content type
    res.setHeader('Content-Type', 'application/json');
    res.json(scans.map(scan => ({
      ...scan,
      // Default to 'low' severity if not found
      severity: scan.severity || (scan.status === 'completed' ? 'low' : undefined)
    })));
  } catch (error) {
    console.error('Error fetching scan status:', error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : 'Failed to fetch scan status',
      details: error instanceof Error ? error.stack : undefined
    });
  }
});

// Get analysis results for a completed scan
router.get('/results/:scanId', async (req, res) => {
  try {
    const scanId = req.params.scanId;
    console.log('Fetching results for scan:', scanId);

    // Check if scan exists and is completed
    const scan = await db
      .select()
      .from(scanStatus)
      .where(eq(scanStatus.id, scanId))
      .limit(1);

    console.log('Found scan:', scan);

    if (!scan || scan.length === 0) {
      return res.status(404).json({ message: 'Scan not found' });
    }

    if (scan[0].status !== 'completed') {
      return res.status(400).json({ message: 'Scan is not completed yet' });
    }

    // Get analysis results
    console.log('Looking for analysis results for scan:', scanId);
    
    const result = await db
      .select()
      .from(analysisResults)
      .where(eq(analysisResults.scanId, scanId))
      .orderBy(desc(analysisResults.createdAt))
      .limit(1);

    console.log('Found analysis result:', result);

    if (!result || result.length === 0) {
      return res.status(404).json({ 
        message: 'Analysis results not found',
        debug: {
          requestedScanId: scanId,
          scan: scan[0]
        }
      });
    }

    // Format response to match expected AnalysisReport type
    const response = {
      report: {
        repositoryName: result[0].repositoryName,
        findings: result[0].findings,
        severity: result[0].severity,
        timestamp: result[0].createdAt.toISOString(),
      },
      tree: null, // TODO: We need to store and retrieve the tree structure
    };

    // Log the response for debugging
    console.log('Sending analysis results:', response);

    res.json(response);
  } catch (error) {
    console.error('Error fetching analysis results:', error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : 'Failed to fetch analysis results',
      details: error instanceof Error ? error.stack : undefined
    });
  }
});

export default router; 