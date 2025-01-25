import { pgTable, text, serial, timestamp, integer, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from 'drizzle-orm';
import type { SecurityRule } from "@/lib/types";

// Security Rules table
export const securityRules = pgTable("security_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  llmPrompt: text("llm_prompt").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Analysis Results table
export const analysisResults = pgTable("analysis_results", {
  id: serial("id").primaryKey(),
  repositoryName: text("repository_name").notNull(),
  findings: jsonb("findings").notNull().$type<SecurityRule[]>(),
  severity: text("severity").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Analyzed Files table for caching
export const analyzedFiles = pgTable("analyzed_files", {
  id: serial("id").primaryKey(),
  filePath: text("file_path").notNull(),
  fileHash: text("file_hash").notNull(),
  repositoryName: text("repository_name").notNull(),
  lastAnalyzed: timestamp("last_analyzed").defaultNow().notNull(),
});

// File Rule Analysis table for tracking which rules were applied to which files
export const fileRuleAnalyses = pgTable("file_rule_analyses", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id")
    .notNull()
    .references(() => analyzedFiles.id, { onDelete: 'cascade' }),
  ruleId: integer("rule_id")
    .notNull()
    .references(() => securityRules.id, { onDelete: 'cascade' }),
  findings: jsonb("findings").notNull().$type<SecurityRule[]>(),
  analyzedAt: timestamp("analyzed_at").defaultNow().notNull(),
});

// Define relations
export const fileRuleAnalysesRelations = relations(fileRuleAnalyses, ({ one }) => ({
  file: one(analyzedFiles, {
    fields: [fileRuleAnalyses.fileId],
    references: [analyzedFiles.id],
  }),
  rule: one(securityRules, {
    fields: [fileRuleAnalyses.ruleId],
    references: [securityRules.id],
  }),
}));

// Export types
export type SecurityRuleType = typeof securityRules.$inferSelect;
export type NewSecurityRule = typeof securityRules.$inferInsert;
export type AnalysisResult = typeof analysisResults.$inferSelect;
export type NewAnalysisResult = typeof analysisResults.$inferInsert;
export type AnalyzedFile = typeof analyzedFiles.$inferSelect;
export type FileRuleAnalysis = typeof fileRuleAnalyses.$inferSelect;

// Export schemas for validation
export const insertSecurityRuleSchema = createInsertSchema(securityRules);
export const selectSecurityRuleSchema = createSelectSchema(securityRules);