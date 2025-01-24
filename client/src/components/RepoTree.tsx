import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TreeNode } from '@/lib/types';

interface Props {
  tree: TreeNode;
}

export default function RepoTree({ tree }: Props) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleNode = (path: string) => {
    const newExpanded = new Set(expandedNodes);
    if (expandedNodes.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedNodes(newExpanded);
  };

  const renderNode = (node: TreeNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.path);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.path}>
        <div
          className={cn(
            "flex items-center gap-1 py-1 px-2 hover:bg-muted/50 rounded cursor-pointer",
            level > 0 && "ml-4"
          )}
          onClick={() => hasChildren && toggleNode(node.path)}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : (
            <span className="w-4" />
          )}
          {node.type === 'directory' ? (
            <Folder className="h-4 w-4 text-muted-foreground" />
          ) : (
            <File className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm">{node.name}</span>
        </div>
        
        {isExpanded && hasChildren && (
          <div className="border-l border-border ml-3">
            {node.children!.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-h-[500px] overflow-y-auto">
      {renderNode(tree)}
    </div>
  );
}
