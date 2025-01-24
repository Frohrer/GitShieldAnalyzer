import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload } from 'lucide-react';
import type { AnalysisReport, TreeNode } from '@/lib/types';

interface Props {
  onAnalysisComplete: (report: AnalysisReport, tree: TreeNode) => void;
}

export default function RepoUpload({ onAnalysisComplete }: Props) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a zip file containing a Git repository',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append('repo', file);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Failed to analyze repository');

      const data = await res.json();
      onAnalysisComplete(data.report, data.tree);
      toast({ title: 'Analysis complete' });
    } catch (error) {
      toast({
        title: 'Analysis failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Upload Repository</h2>
      
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
            Drag and drop a zip file or click to browse
          </p>
        </label>
      </div>

      {isUploading && (
        <div className="space-y-2">
          <Progress value={progress} />
          <p className="text-sm text-muted-foreground text-center">
            Analyzing repository...
          </p>
        </div>
      )}
    </div>
  );
}
