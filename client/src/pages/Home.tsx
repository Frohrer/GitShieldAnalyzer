import { useState } from 'react';
import { Link } from 'wouter';
import RepoUpload from '@/components/RepoUpload';
import SecurityReport from '@/components/SecurityReport';
import RepoTree from '@/components/RepoTree';
import ScanStatus from '@/components/ScanStatus';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FileCode2, Shield } from 'lucide-react';
import type { AnalysisReport, TreeNode } from '@/lib/types';

export default function Home() {
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);
  const [repoTree, setRepoTree] = useState<TreeNode | null>(null);

  const handleAnalysisComplete = (report: AnalysisReport, tree: TreeNode) => {
    setAnalysisReport(report);
    setRepoTree(tree);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Git Security Analyzer</h1>
          </div>
          <Link href="/rules">
            <Button variant="outline">
              <FileCode2 className="mr-2 h-4 w-4" />
              Security Rules
            </Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card className="p-6">
              <RepoUpload onAnalysisComplete={handleAnalysisComplete} />
            </Card>

            <ScanStatus onAnalysisComplete={handleAnalysisComplete} />

            {repoTree && (
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Repository Structure</h2>
                <RepoTree tree={repoTree} />
              </Card>
            )}
          </div>
          
          <div>
            {analysisReport && (
              <Card className="p-6">
                <SecurityReport report={analysisReport} />
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
