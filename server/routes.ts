import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { db } from "@db";
import { securityRules, analysisResults } from "@db/schema";
import { analyzeRepository } from "./services/repoAnalyzer";
import { eq } from "drizzle-orm";

const upload = multer({ dest: "/tmp/uploads/" });

export function registerRoutes(app: Express): Server {
  // Security Rules CRUD endpoints
  app.get("/api/rules", async (_req, res) => {
    try {
      const rules = await db.query.securityRules.findMany();
      res.json(rules);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rules" });
    }
  });

  app.post("/api/rules", async (req, res) => {
    try {
      const rule = await db.insert(securityRules).values(req.body).returning();
      res.json(rule[0]);
    } catch (error) {
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
      res.status(500).json({ message: "Failed to delete rule" });
    }
  });

  // Repository analysis endpoint
  app.post("/api/analyze", upload.single("repo"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    try {
      const rules = await db.query.securityRules.findMany();
      const { report, tree } = await analyzeRepository(req.file.path, rules);

      // Save analysis results
      await db.insert(analysisResults).values({
        repositoryName: report.repositoryName,
        findings: report.findings,
        severity: report.severity,
      });

      res.json({ report, tree });
    } catch (error) {
      res.status(500).json({
        message: error instanceof Error ? error.message : "Analysis failed",
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
