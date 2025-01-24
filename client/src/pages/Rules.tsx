import { useState } from 'react';
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
import { Shield, ArrowLeft, Plus } from 'lucide-react';
import RuleForm from '@/components/RuleForm';
import { Dialog } from '@/components/ui/dialog';
import type { SecurityRule } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export default function Rules() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<SecurityRule | null>(null);
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
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Rule
          </Button>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <RuleForm
            onSubmit={(data) => createRule.mutate(data)}
            onCancel={() => setIsDialogOpen(false)}
          />
        </Dialog>
      </main>
    </div>
  );
}
