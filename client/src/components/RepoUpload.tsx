import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, Github } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { AnalysisReport, TreeNode } from '@/lib/types';

interface Props {
  onAnalysisComplete: (report: AnalysisReport, tree: TreeNode) => void;
}

export default function RepoUpload({ onAnalysisComplete }: Props) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [githubUrl, setGithubUrl] = useState('');
  const { toast } = useToast();

  const setupWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/analysis-progress`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'progress') {
          setProgress((data.current / data.total) * 100);
          if (data.file) {
            setCurrentFile(data.file);
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    return ws;
  };

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a zip file containing a Git repository',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Maximum file size is 100MB',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setCurrentFile(null);

    const ws = setupWebSocket();
    const formData = new FormData();
    formData.append('repo', file);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ 
          message: 'Failed to analyze repository' 
        }));
        throw new Error(errorData.message || 'Failed to analyze repository');
      }

      const data = await res.json();
      onAnalysisComplete(data.report, data.tree);
      toast({ title: 'Analysis complete' });
    } catch (error) {
      console.error('Repository analysis error:', error);
      toast({
        title: 'Analysis failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setProgress(0);
      setCurrentFile(null);
      ws.close();
    }
  };

  const handleGithubAnalysis = async () => {
    if (!githubUrl.trim()) {
      toast({
        title: 'Invalid URL',
        description: 'Please enter a GitHub repository URL',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setCurrentFile(null);

    const ws = setupWebSocket();

    try {
      const res = await fetch('/api/analyze/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: githubUrl.trim() }),
      });

      let errorData;
      try {
        errorData = await res.json();
      } catch (e) {
        throw new Error('Failed to parse server response');
      }

      if (!res.ok) {
        throw new Error(errorData.message || 'Failed to analyze repository');
      }

      onAnalysisComplete(errorData.report, errorData.tree);
      toast({ title: 'Analysis complete' });
    } catch (error) {
      console.error('GitHub repository analysis error:', error);
      toast({
        title: 'Analysis failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setProgress(0);
      setCurrentFile(null);
      ws.close();
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Upload Repository</h2>

      {/* GitHub URL input */}
      <div className="flex gap-2">
        <Input
          placeholder="Enter GitHub repository URL"
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
          disabled={isUploading}
        />
        <Button
          onClick={handleGithubAnalysis}
          disabled={isUploading || !githubUrl.trim()}
        >
          <Github className="mr-2 h-4 w-4" />
          Analyze
        </Button>
      </div>

      <div className="text-center text-sm text-muted-foreground">or</div>

      {/* File upload area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center ${
          isUploading ? 'border-primary/50' : 'border-border hover:border-primary/50'
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleUpload(file);
        }}
      >
        <input
          type="file"
          accept=".zip"
          className="hidden"
          id="repo-upload"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />

        <label
          htmlFor="repo-upload"
          className="cursor-pointer flex flex-col items-center gap-2"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isUploading 
              ? 'Analyzing repository...'
              : 'Drag and drop a zip file or click to browse'}
          </p>
          <p className="text-xs text-muted-foreground">
            Maximum file size: 100MB
          </p>
        </label>
      </div>

      {isUploading && (
        <div className="space-y-2">
          <Progress value={progress} />
          <p className="text-sm text-muted-foreground text-center">
            {currentFile 
              ? `Analyzing ${currentFile}...`
              : 'Analyzing repository...'}
          </p>
          <p className="text-xs text-muted-foreground text-center">
            {Math.round(progress)}% complete
          </p>
        </div>
      )}
    </div>
  );
}