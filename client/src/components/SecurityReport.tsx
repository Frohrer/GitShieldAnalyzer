import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, XCircle, Code, FileDown } from 'lucide-react';
import type { AnalysisReport, SecurityFinding } from '@/lib/types';
import CodeViewer from './CodeViewer';
import { useToast } from '@/hooks/use-toast';

interface Props {
  report: AnalysisReport;
}

export default function SecurityReport({ report }: Props) {
  const [selectedFinding, setSelectedFinding] = useState<SecurityFinding | null>(null);
  const { toast } = useToast();

  const severityIcon = useMemo(() => ({
    high: <XCircle className="h-4 w-4 text-destructive" />,
    medium: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
    low: <CheckCircle className="h-4 w-4 text-green-500" />,
  }), []);

  const findingsByRule = useMemo(() => {
    return report.findings.reduce((acc, finding) => {
      const key = finding.ruleName;
      if (!acc[key]) acc[key] = [];
      acc[key].push(finding);
      return acc;
    }, {} as Record<string, SecurityFinding[]>);
  }, [report.findings]);

  const handleDownloadPDF = async () => {
    try {
      const response = await fetch(`/api/report/${report.repositoryName}/pdf`);
      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.repositoryName}-security-report.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('PDF download error:', error);
      toast({
        title: 'Failed to download PDF',
        description: 'Could not generate the security report PDF.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Security Analysis Report</h2>
        <div className="flex items-center gap-2">
          <Badge
            variant={report.severity === 'high' ? 'destructive' : 'secondary'}
            className="text-xs"
          >
            {report.severity.toUpperCase()} RISK
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPDF}
            className="gap-2"
          >
            <FileDown className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <Alert>
        <AlertTitle className="flex items-center gap-2">
          {severityIcon[report.severity]}
          Repository: {report.repositoryName}
        </AlertTitle>
        <AlertDescription>
          Analysis completed on {new Date(report.timestamp).toLocaleString()}
        </AlertDescription>
      </Alert>

      <Card className="p-4">
        <Accordion type="single" collapsible className="w-full">
          {Object.entries(findingsByRule).map(([ruleName, findings]) => (
            <AccordionItem key={ruleName} value={ruleName}>
              <AccordionTrigger className="px-4">
                <div className="flex items-center gap-4">
                  <span>{ruleName}</span>
                  <Badge variant="outline" className="text-xs">
                    {findings.length} {findings.length === 1 ? 'finding' : 'findings'}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 px-4">
                {findings.map((finding, index) => (
                  <div key={index} className="space-y-2 border-l-2 pl-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        Location: {finding.location} (line {finding.lineNumber})
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary"
                        onClick={() => setSelectedFinding(finding)}
                      >
                        <Code className="mr-2 h-4 w-4" />
                        View Code
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {finding.description}
                    </p>
                    <p className="text-sm text-primary">
                      Recommendation: {finding.recommendation}
                    </p>
                    {finding.codeSnippet && (
                      <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto">
                        <code>{finding.codeSnippet}</code>
                      </pre>
                    )}
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>

      {selectedFinding && selectedFinding.fileContent && (
        <CodeViewer
          open={!!selectedFinding}
          onOpenChange={() => setSelectedFinding(null)}
          fileName={selectedFinding.location}
          content={selectedFinding.fileContent}
          lineNumber={selectedFinding.lineNumber}
        />
      )}
    </div>
  );
}