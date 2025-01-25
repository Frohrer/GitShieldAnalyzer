import type { Express, Request } from "express";
import express from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import fs from 'fs/promises';
import path from 'path';
import download from 'download-git-repo';
import { promisify } from 'util';
import { db } from "@db";
import { securityRules, analysisResults } from "@db/schema";
import { analyzeRepository } from "./services/repoAnalyzer";
import { generatePDF } from "./services/pdfService";
import { eq } from "drizzle-orm";
import type { SecurityRule } from "@/lib/types";

// Add multer request type
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Configure multer with increased file size limit
const upload = multer({ 
  dest: "/tmp/uploads/",
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  }
});

// Promisify download-git-repo
const downloadRepo = promisify(download);

export function registerRoutes(app: Express): Server {
  // Configure express to handle larger payloads
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Handle multer errors
  const handleUpload = upload.single('repo');

  // GitHub repository analysis endpoint
  app.post("/api/analyze/github", async (req, res) => {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ message: "GitHub URL is required" });
    }

    // Extract owner/repo from GitHub URL
    const urlMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (!urlMatch) {
      return res.status(400).json({ message: "Invalid GitHub repository URL" });
    }

    const [, owner, repoName] = urlMatch;
    const downloadPath = path.join("/tmp/uploads", `${owner}-${repoName}-${Date.now()}`);

    try {
      // Create download directory
      await fs.mkdir(downloadPath, { recursive: true });

      console.log(`Downloading repository: ${owner}/${repoName} to ${downloadPath}`);

      try {
        // Download repository using direct HTTPS URL without depth limitation
        await downloadRepo(`direct:https://github.com/${owner}/${repoName}`, downloadPath, { 
          clone: false
        });
      } catch (downloadError) {
        console.error('Download error:', downloadError);
        return res.status(400).json({ 
          message: "Failed to download repository. Please make sure the repository exists and is public."
        });
      }

      // Get security rules
      const rules = await db.query.securityRules.findMany();

      if (!rules || rules.length === 0) {
        return res.status(400).json({ 
          message: "No security rules found. Please create at least one rule before analyzing a repository." 
        });
      }

      const typedRules = rules.map(rule => ({
        ...rule,
        severity: rule.severity as SecurityRule['severity']
      }));

      // Pass repository metadata to analyzer
      const { report, tree } = await analyzeRepository(downloadPath, typedRules, {
        owner,
        repoName,
        url
      });

      // Save analysis results
      await db.insert(analysisResults).values({
        repositoryName: report.repositoryName,
        findings: report.findings,
        severity: report.severity,
      });

      res.json({ report, tree });
    } catch (error) {
      console.error('GitHub repository analysis failed:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to analyze GitHub repository",
        details: error instanceof Error ? error.stack : undefined
      });
    } finally {
      // Clean up downloaded repository
      try {
        await fs.rm(downloadPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // Security Rules CRUD endpoints
  app.get("/api/rules", async (_req, res) => {
    try {
      const rules = await db.query.securityRules.findMany();
      res.json(rules.map(rule => ({
        ...rule,
        severity: rule.severity as SecurityRule['severity']
      })));
    } catch (error) {
      console.error('Failed to fetch rules:', error);
      res.status(500).json({ message: "Failed to fetch rules" });
    }
  });

  app.post("/api/rules", async (req, res) => {
    try {
      const rule = await db.insert(securityRules).values(req.body).returning();
      res.json(rule[0]);
    } catch (error) {
      console.error('Failed to create rule:', error);
      res.status(500).json({ message: "Failed to create rule" });
    }
  });

  app.put("/api/rules/:id", async (req, res) => {
    try {
      const rule = await db
        .update(securityRules)
        .set(req.body)
        .where(eq(securityRules.id, parseInt(req.params.id)))
        .returning();
      res.json(rule[0]);
    } catch (error) {
      console.error('Failed to update rule:', error);
      res.status(500).json({ message: "Failed to update rule" });
    }
  });

  app.delete("/api/rules/:id", async (req, res) => {
    try {
      await db
        .delete(securityRules)
        .where(eq(securityRules.id, parseInt(req.params.id)));
      res.status(204).send();
    } catch (error) {
      console.error('Failed to delete rule:', error);
      res.status(500).json({ message: "Failed to delete rule" });
    }
  });

  // New endpoint to export rules
  app.get("/api/rules/export", async (_req, res) => {
    try {
      const rules = await db.query.securityRules.findMany();

      // Convert to SecurityRule type and remove id/timestamps
      const exportableRules = rules.map(({ id, createdAt, updatedAt, ...rule }) => ({
        ...rule,
        severity: rule.severity as SecurityRule['severity']
      }));

      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=security-rules.json'
      );
      res.json(exportableRules);
    } catch (error) {
      console.error('Failed to export rules:', error);
      res.status(500).json({ message: "Failed to export rules" });
    }
  });

  // New endpoint to import rules
  const rulesUpload = upload.single('rules');
  app.post("/api/rules/import", (req, res) => {
    rulesUpload(req as MulterRequest, res, async (err) => {
      if (err) {
        return res.status(400).json({
          message: `Upload error: ${err.message}`
        });
      }

      const multerReq = req as MulterRequest;
      if (!multerReq.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      try {
        const fileContent = await fs.readFile(multerReq.file.path, 'utf-8');
        const rules = JSON.parse(fileContent);

        if (!Array.isArray(rules)) {
          throw new Error('Invalid rules file format. Expected an array of rules.');
        }

        // Insert all rules, ignoring any existing ids
        const insertedRules = await db.insert(securityRules)
          .values(rules.map(({ id, createdAt, updatedAt, ...rule }) => rule))
          .returning();

        res.json(insertedRules);
      } catch (error) {
        console.error('Failed to import rules:', error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Failed to import rules"
        });
      } finally {
        // Clean up uploaded file
        try {
          await fs.unlink(multerReq.file.path);
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  });

  // Repository analysis endpoint with custom error handling
  app.post("/api/analyze", (req, res) => {
    handleUpload(req as MulterRequest, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            message: "Repository file is too large. Maximum size is 100MB."
          });
        }
        return res.status(400).json({
          message: `Upload error: ${err.message}`
        });
      } else if (err) {
        return res.status(500).json({
          message: `Unexpected error during upload: ${err.message}`
        });
      }

      const multerReq = req as MulterRequest;
      if (!multerReq.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      try {
        console.log('Starting repository analysis:', multerReq.file.path);
        const rules = await db.query.securityRules.findMany();

        if (!rules || rules.length === 0) {
          return res.status(400).json({ 
            message: "No security rules found. Please create at least one rule before analyzing a repository." 
          });
        }

        const typedRules = rules.map(rule => ({
          ...rule,
          severity: rule.severity as SecurityRule['severity']
        }));

        const { report, tree } = await analyzeRepository(multerReq.file.path, typedRules);

        // Save analysis results
        await db.insert(analysisResults).values({
          repositoryName: report.repositoryName,
          findings: report.findings,
          severity: report.severity,
        });

        res.json({ report, tree });
      } catch (error) {
        console.error('Repository analysis failed:', error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Analysis failed",
          details: error instanceof Error ? error.stack : undefined
        });
      }
    });
  });

  // New endpoint to generate PDF report
  app.get("/api/report/:repositoryName/pdf", async (req, res) => {
    try {
      const result = await db.query.analysisResults.findFirst({
        where: eq(analysisResults.repositoryName, req.params.repositoryName),
      });

      if (!result) {
        return res.status(404).json({ message: "Analysis report not found" });
      }

      // Convert the result to expected AnalysisReport format
      const report = {
        ...result,
        timestamp: result.createdAt.toISOString(),
        severity: result.severity as SecurityRule['severity'],
        findings: result.findings as any[], // Assuming findings is an array.  Needs better typing.
      };

      const pdfBuffer = await generatePDF(report);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=${result.repositoryName}-security-report.pdf`
      );
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      res.status(500).json({ message: "Failed to generate PDF report" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}