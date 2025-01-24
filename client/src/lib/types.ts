export interface SecurityFinding {
  ruleId: number;
  ruleName: string;
  severity: 'low' | 'medium' | 'high';
  location: string;
  description: string;
  recommendation: string;
}

export interface AnalysisReport {
  repositoryName: string;
  findings: SecurityFinding[];
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

export interface SecurityRule {
  id: number;
  name: string;
  description: string;
  category: string;
  severity: 'low' | 'medium' | 'high';
  llmPrompt: string;
}