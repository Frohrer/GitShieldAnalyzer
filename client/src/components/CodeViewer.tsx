import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh]">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            {fileName} (line {lineNumber})
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-[500px] border rounded-md overflow-hidden">
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
            }}
            onMount={(editor) => {
              // Go to the relevant line
              setTimeout(() => {
                editor.revealLineInCenter(lineNumber);
                editor.setPosition({ lineNumber, column: 1 });
              }, 100);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
