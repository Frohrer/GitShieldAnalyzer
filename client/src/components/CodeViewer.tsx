import { useState, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  content: string;
  lineNumber: number;
}

export default function CodeViewer({
  open,
  onOpenChange,
  fileName,
  content,
  lineNumber,
}: Props) {
  const fileExtension = fileName.split('.').pop() || '';
  const [language, setLanguage] = useState('plaintext');
  const [isEditorReady, setIsEditorReady] = useState(false);

  useEffect(() => {
    // Map file extensions to Monaco language IDs
    const languageMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'cpp',
      cs: 'csharp',
      go: 'go',
      rb: 'ruby',
      php: 'php',
      html: 'html',
      css: 'css',
      json: 'json',
      md: 'markdown',
    };

    setLanguage(languageMap[fileExtension] || 'plaintext');
  }, [fileExtension]);

  const handleEditorDidMount: OnMount = (editor) => {
    setIsEditorReady(true);
    // Scroll to the relevant line after a short delay to ensure the editor is ready
    setTimeout(() => {
      editor.revealLineInCenter(lineNumber);
      editor.setPosition({ lineNumber, column: 1 });
      // Add a decoration to highlight the line
      editor.deltaDecorations([], [{
        range: {
          startLineNumber: lineNumber,
          startColumn: 1,
          endLineNumber: lineNumber,
          endColumn: 1
        },
        options: {
          isWholeLine: true,
          className: 'bg-muted/20'
        }
      }]);
    }, 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            {fileName} (line {lineNumber})
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-[500px] border rounded-md overflow-hidden relative">
          {!isEditorReady && (
            <div className="absolute inset-0 bg-background">
              <Skeleton className="w-full h-full" />
            </div>
          )}
          <Editor
            height="100%"
            language={language}
            value={content}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              highlightActiveIndentGuide: true,
              scrollbar: {
                vertical: 'visible',
                horizontal: 'visible',
              },
              fontSize: 14,
              padding: { top: 8, bottom: 8 },
            }}
            onMount={handleEditorDidMount}
            loading={<Skeleton className="w-full h-full" />}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}