import { useState, useRef } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Shield,
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Download,
  Upload,
} from 'lucide-react';
import RuleForm from '@/components/RuleForm';
import { Dialog } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SecurityRule } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export default function Rules() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<SecurityRule | null>(null);
  const [deleteRuleId, setDeleteRuleId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rules = [] } = useQuery<SecurityRule[]>({
    queryKey: ['/api/rules'],
  });

  const createRule = useMutation({
    mutationFn: async (rule: Omit<SecurityRule, 'id'>) => {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      if (!res.ok) throw new Error('Failed to create rule');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rules'] });
      toast({ title: 'Rule created successfully' });
      setIsDialogOpen(false);
    },
  });

  const updateRule = useMutation({
    mutationFn: async ({ id, ...rule }: SecurityRule) => {
      const res = await fetch(`/api/rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      if (!res.ok) throw new Error('Failed to update rule');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rules'] });
      toast({ title: 'Rule updated successfully' });
      setIsDialogOpen(false);
      setSelectedRule(null);
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/rules/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to delete rule');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rules'] });
      toast({ title: 'Rule deleted successfully' });
      setDeleteRuleId(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete rule',
        description: error.message,
        variant: 'destructive',
      });
      setDeleteRuleId(null);
    },
  });

  const importRules = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('rules', file);

      const res = await fetch('/api/rules/import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to import rules');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rules'] });
      toast({ title: 'Rules imported successfully' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to import rules',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleExportRules = async () => {
    try {
      const response = await fetch('/api/rules/export');
      if (!response.ok) throw new Error('Failed to export rules');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'security-rules.json';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Rules export error:', error);
      toast({
        title: 'Failed to export rules',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleImportRules = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a JSON file',
        variant: 'destructive',
      });
      return;
    }

    importRules.mutate(file);
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Security Rules</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".json"
              onChange={handleImportRules}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Import Rules
            </Button>
            <Button
              variant="outline"
              onClick={handleExportRules}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export Rules
            </Button>
            <Button onClick={() => {
              setSelectedRule(null);
              setIsDialogOpen(true);
            }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Rule
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>{rule.name}</TableCell>
                  <TableCell>{rule.category}</TableCell>
                  <TableCell>
                    <Badge variant={rule.severity === 'high' ? 'destructive' : 'secondary'}>
                      {rule.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>{rule.description}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedRule(rule);
                          setIsDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteRuleId(rule.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          {isDialogOpen && (
            <RuleForm
              initialData={selectedRule ?? undefined}
              onSubmit={(data) => {
                if (selectedRule) {
                  updateRule.mutate({ ...data, id: selectedRule.id });
                } else {
                  createRule.mutate(data);
                }
              }}
              onCancel={() => {
                setIsDialogOpen(false);
                setSelectedRule(null);
              }}
            />
          )}
        </Dialog>

        <AlertDialog open={deleteRuleId !== null} onOpenChange={(open) => !open && setDeleteRuleId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to delete this rule?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the security rule.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteRuleId && deleteRule.mutate(deleteRuleId)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}