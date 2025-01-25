import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from 'drizzle-orm';

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

export const analysisResults = pgTable("analysis_results", {
  id: serial("id").primaryKey(),
  repositoryName: text("repository_name").notNull(),
  findings: jsonb("findings").notNull(),
  severity: text("severity").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// New table for analyzed files
export const analyzedFiles = pgTable("analyzed_files", {
  id: serial("id").primaryKey(),
  filePath: text("file_path").notNull(),
  fileHash: text("file_hash").notNull(),
  repositoryName: text("repository_name").notNull(),
  lastAnalyzed: timestamp("last_analyzed").defaultNow().notNull(),
});

// New table for tracking which rules were applied to which files
export const fileRuleAnalyses = pgTable("file_rule_analyses", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id")
    .notNull()
    .references(() => analyzedFiles.id, { onDelete: 'cascade' }),
  ruleId: integer("rule_id")
    .notNull()
    .references(() => securityRules.id, { onDelete: 'cascade' }),
  findings: jsonb("findings").$type<SecurityFinding[]>(),
  analyzedAt: timestamp("analyzed_at").defaultNow().notNull(),
});

// Relations
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

export type SecurityRule = typeof securityRules.$inferSelect;
export type NewSecurityRule = typeof securityRules.$inferInsert;
export type AnalysisResult = typeof analysisResults.$inferSelect;
export type NewAnalysisResult = typeof analysisResults.$inferInsert;
export type AnalyzedFile = typeof analyzedFiles.$inferSelect;
export type FileRuleAnalysis = typeof fileRuleAnalyses.$inferSelect;

export const insertSecurityRuleSchema = createInsertSchema(securityRules);
export const selectSecurityRuleSchema = createSelectSchema(securityRules);