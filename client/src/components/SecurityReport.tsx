import { useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { AnalysisReport, SecurityFinding } from '@/lib/types';

interface Props {
  report: AnalysisReport;
}

export default function SecurityReport({ report }: Props) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Security Analysis Report</h2>
        <Badge
          variant={report.severity === 'high' ? 'destructive' : 'secondary'}
          className="text-xs"
        >
          {report.severity.toUpperCase()} RISK
        </Badge>
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
                    <p className="text-sm font-medium">Location: {finding.location}</p>
                    <p className="text-sm text-muted-foreground">
                      {finding.description}
                    </p>
                    <p className="text-sm text-primary">
                      Recommendation: {finding.recommendation}
                    </p>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>
    </div>
  );
}
