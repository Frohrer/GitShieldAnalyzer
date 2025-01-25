import PDFDocument from 'pdfkit';
import type { AnalysisReport, SecurityFinding } from '@/lib/types';
import { Writable } from 'stream';

export async function generatePDF(report: AnalysisReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50 });
    
    // Collect PDF chunks
    const stream = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });

    // Handle stream events
    stream.on('finish', () => {
      const result = Buffer.concat(chunks);
      resolve(result);
    });
    stream.on('error', reject);

    // Pipe the PDF to our stream
    doc.pipe(stream);

    // Start generating PDF content
    generatePDFContent(doc, report);

    // Finalize the PDF
    doc.end();
  });
}

function generatePDFContent(doc: PDFKit.PDFDocument, report: AnalysisReport): void {
  // Header
  doc.fontSize(24)
    .text('Security Analysis Report', { align: 'center' })
    .moveDown();

  // Repository info
  doc.fontSize(14)
    .text(`Repository: ${report.repositoryName}`)
    .text(`Overall Severity: ${report.severity.toUpperCase()}`)
    .text(`Analysis Date: ${new Date(report.timestamp).toLocaleString()}`)
    .moveDown();

  // Group findings by rule
  const findingsByRule = report.findings.reduce((acc, finding) => {
    const key = finding.ruleName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(finding);
    return acc;
  }, {} as Record<string, SecurityFinding[]>);

  // Render findings
  Object.entries(findingsByRule).forEach(([ruleName, findings]) => {
    doc.fontSize(16)
      .text(ruleName)
      .moveDown(0.5);

    findings.forEach((finding, index) => {
      doc.fontSize(12)
        .text(`Finding ${index + 1}:`)
        .fontSize(10)
        .text(`Location: ${finding.location} (line ${finding.lineNumber})`)
        .text(`Severity: ${finding.severity}`)
        .text('Description:', { continued: true })
        .text(finding.description)
        .text('Recommendation:', { continued: true })
        .text(finding.recommendation);

      if (finding.codeSnippet) {
        doc.moveDown(0.5)
          .fontSize(8)
          .font('Courier')
          .text(finding.codeSnippet)
          .font('Helvetica');
      }

      doc.moveDown();
    });

    doc.moveDown();
  });
}
