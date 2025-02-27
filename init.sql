-- Create tables for Git Security Analyzer

-- Security Rules table
CREATE TABLE IF NOT EXISTS security_rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  llm_prompt TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Analysis Results table
CREATE TABLE IF NOT EXISTS analysis_results (
  id SERIAL PRIMARY KEY,
  scan_id UUID NOT NULL,
  repository_name TEXT NOT NULL,
  findings JSONB NOT NULL,
  severity TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Analyzed Files table for caching
CREATE TABLE IF NOT EXISTS analyzed_files (
  id SERIAL PRIMARY KEY,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  repository_name TEXT NOT NULL,
  last_analyzed TIMESTAMP NOT NULL DEFAULT NOW()
);

-- File Rule Analysis table for tracking
CREATE TABLE IF NOT EXISTS file_rule_analyses (
  id SERIAL PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES analyzed_files(id) ON DELETE CASCADE,
  rule_id INTEGER NOT NULL REFERENCES security_rules(id) ON DELETE CASCADE,
  findings JSONB NOT NULL,
  analyzed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Scan Status table for tracking in-progress and completed scans
CREATE TABLE IF NOT EXISTS scan_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_name TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  current_file TEXT,
  total_files INTEGER,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  error TEXT
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_file_hash ON analyzed_files(file_hash);
CREATE INDEX IF NOT EXISTS idx_repository_name ON analyzed_files(repository_name);
CREATE INDEX IF NOT EXISTS idx_file_rule_analyses_file_id ON file_rule_analyses(file_id);
CREATE INDEX IF NOT EXISTS idx_file_rule_analyses_rule_id ON file_rule_analyses(rule_id);
CREATE INDEX IF NOT EXISTS idx_scan_status_started_at ON scan_status(started_at);
CREATE INDEX IF NOT EXISTS idx_analysis_results_scan_id ON analysis_results(scan_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_repository_name ON analysis_results(repository_name);
