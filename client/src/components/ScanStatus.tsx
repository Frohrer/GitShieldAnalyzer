import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import type { AnalysisReport, TreeNode } from '@/lib/types';

interface ScanStatusItem {
  id: string;  // UUID
  repositoryName: string;
  status: 'in_progress' | 'completed' | 'failed';
  progress: number;
  currentFile?: string;
  totalFiles?: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  severity?: 'high' | 'medium' | 'low';
}

interface Props {
  onAnalysisComplete: (report: AnalysisReport, tree: TreeNode) => void;
}

export default function ScanStatus({ onAnalysisComplete }: Props) {
  const [scans, setScans] = useState<ScanStatusItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    const fetchScans = async () => {
      try {
        const response = await fetch('/api/scan/status');
        if (!response.ok) throw new Error('Failed to fetch scan status');
        const data = await response.json();
        setScans(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch scan status');
      }
    };

    // Initial fetch
    fetchScans();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchScans, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleViewResults = async (scan: ScanStatusItem) => {
    if (loading === scan.id || scan.status !== 'completed') return;
    setLoading(scan.id);

    try {
      const response = await fetch(`/api/scan/results/${scan.id}`);
      if (!response.ok) throw new Error('Failed to fetch analysis results');
      const data = await response.json();
      onAnalysisComplete(data.report, data.tree);
    } catch (err) {
      console.error('Error loading results:', err);
      setError(err instanceof Error ? err.message : 'Failed to load analysis results');
    } finally {
      setLoading(null);
    }
  };

  if (error) {
    return (
      <Card className="p-4 text-sm text-destructive">
        Failed to load scan status: {error}
      </Card>
    );
  }

  if (scans.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Recent Scans</h2>
      <div className="space-y-4">
        {scans.map((scan) => (
          <Card 
            key={scan.id} 
            className={`p-4 ${scan.status === 'completed' ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
            onClick={() => handleViewResults(scan)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {scan.status === 'in_progress' && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                {scan.status === 'completed' && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                {scan.status === 'failed' && (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="font-medium">{scan.repositoryName}</span>
              </div>
              <Badge
                variant={
                  scan.status === 'completed'
                    ? 'success'
                    : scan.status === 'failed'
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {scan.status.replace('_', ' ').toUpperCase()}
                {loading === scan.id && '...'}
              </Badge>
            </div>

            {scan.status === 'in_progress' && (
              <>
                <Progress value={scan.progress} className="mb-2" />
                <p className="text-sm text-muted-foreground">
                  {scan.currentFile 
                    ? `Analyzing ${scan.currentFile}...`
                    : 'Preparing analysis...'}
                </p>
              </>
            )}

            {scan.status === 'failed' && scan.error && (
              <p className="text-sm text-destructive mt-2">{scan.error}</p>
            )}

            <div className="mt-2 text-xs text-muted-foreground">
              Started: {new Date(scan.startedAt).toLocaleString()}
              {scan.completedAt && (
                <> • Completed: {new Date(scan.completedAt).toLocaleString()}</>
              )}
              {scan.status === 'completed' && scan.severity && (
                <div className="mt-1">
                  <Badge 
                    variant={
                      scan.severity === 'high' 
                        ? 'destructive' 
                        : scan.severity === 'medium' 
                        ? 'warning' 
                        : 'default'
                    }
                    className="text-xs"
                  >
                    {scan.severity.toUpperCase()} RISK
                  </Badge>
                  {scan.totalFiles && (
                    <span className="ml-2">
                      {scan.totalFiles} files analyzed
                    </span>
                  )}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
} 