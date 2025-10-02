
// src/app/school/dashboard/[schoolId]/finance/budgets/settings/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, addSchoolSubcollectionItem, deleteSchoolSubcollectionItem, updateSchoolSubcollectionItem } from '@/services';
import type { School, ChartOfAccountItem, Budget, SchoolAcademicYear, SchoolTerm } from '@/types/school';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Settings, PlusCircle, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

export default function BudgetSettingsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [allBudgets, setAllBudgets] = useState<Budget[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccountItem[]>([]);
  const [academicYears, setAcademicYears] = useState<SchoolAcademicYear[]>([]);
  const [schoolTerms, setSchoolTerms] = useState<SchoolTerm[]>([]);

  // Form state for new budget line
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [budgetedAmount, setBudgetedAmount] = useState<string>('');

  const fetchInitialData = useCallback(async () => {
    if (!user || !schoolId) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const schoolData = await getSchoolById(schoolId);
      if (!schoolData || !schoolData.adminUids.includes(user.uid)) {
        toast({ variant: 'destructive', title: 'Access Denied' });
        router.push('/school/auth');
        return;
      }
      setSelectedAcademicYearId(schoolData.currentAcademicYearId || '');
      setSelectedTerm(schoolData.currentTerm || '');

      const [budgetsData, coaData, yearsData, termsData] = await Promise.all([
        getSchoolSubcollectionItems<Budget>(schoolId, 'budgets'),
        getSchoolSubcollectionItems<ChartOfAccountItem>(schoolId, 'chartOfAccounts'),
        getSchoolSubcollectionItems<SchoolAcademicYear>(schoolId, 'schoolAcademicYears'),
        getSchoolSubcollectionItems<SchoolTerm>(schoolId, 'schoolTerms'),
      ]);
      setAllBudgets(budgetsData);
      setChartOfAccounts(coaData);
      setAcademicYears(yearsData.sort((a,b) => (b.year || "").localeCompare(a.year || "")));
      setSchoolTerms(termsData);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error loading data' });
      console.error("Error on budget settings page:", error);
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleAddBudget = async () => {
    const amount = parseFloat(budgetedAmount);
    const account = chartOfAccounts.find(acc => acc.id === selectedAccountId);

    if (!selectedAcademicYearId || !selectedTerm || !selectedAccountId || !account || isNaN(amount) || amount < 0) {
      toast({ variant: "destructive", title: "Invalid Input", description: "Please select a valid period, account, and enter a non-negative amount." });
      return;
    }
    
    // Check for duplicates
    const existing = allBudgets.find(b => b.academicYearId === selectedAcademicYearId && b.term === selectedTerm && b.accountId === selectedAccountId);
    if(existing) {
       toast({ variant: "destructive", title: "Duplicate Budget", description: "A budget for this account already exists for the selected period. You can delete it first if you wish to change the amount." });
       return;
    }

    setIsSubmitting(true);
    try {
      const budgetData: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'> = {
        academicYearId: selectedAcademicYearId,
        term: selectedTerm,
        accountId: selectedAccountId,
        accountName: account.accountName,
        accountType: account.accountType as 'Revenue' | 'Expense',
        budgetedAmount: amount,
      };
      const newId = await addSchoolSubcollectionItem(schoolId, 'budgets', budgetData);
      toast({ title: "Budget Added", description: `Budget for ${account.accountName} created.` });
      setAllBudgets(prev => [...prev, { ...budgetData, id: newId }]);
      // Reset form
      setSelectedAccountId('');
      setBudgetedAmount('');

    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to Add Budget", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBudget = async (budgetId: string) => {
    if (!window.confirm("Are you sure you want to delete this budget line? This action cannot be undone.")) return;
    try {
      await deleteSchoolSubcollectionItem(schoolId, 'budgets', budgetId);
      toast({ title: "Budget Deleted" });
      setAllBudgets(prev => prev.filter(b => b.id !== budgetId));
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to Delete", description: error.message });
    }
  };
  
  const availableTerms = schoolTerms.filter(t => t.academicYearId === selectedAcademicYearId);
  const availableAccounts = chartOfAccounts.filter(acc => acc.accountType === 'Revenue' || acc.accountType === 'Expense');

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><Settings className="mr-3 h-6 w-6 text-primary"/>Budget Setup</CardTitle>
          <CardDescription>Create and manage budget allocations for different accounts and academic periods.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 border rounded-lg bg-muted/30 space-y-3 mb-6">
            <h4 className="font-semibold text-lg">Add New Budget Line</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div><Label>Academic Year*</Label><Select value={selectedAcademicYearId} onValueChange={setSelectedAcademicYearId}><SelectTrigger><SelectValue placeholder="Select Year"/></SelectTrigger><SelectContent>{academicYears.map(y => <SelectItem key={y.id} value={y.id}>{y.year}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Term*</Label><Select value={selectedTerm} onValueChange={setSelectedTerm}><SelectTrigger><SelectValue placeholder="Select Term"/></SelectTrigger><SelectContent>{availableTerms.map(t => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="lg:col-span-2"><Label>Account*</Label><Select value={selectedAccountId} onValueChange={setSelectedAccountId}><SelectTrigger><SelectValue placeholder="Select an income or expense account"/></SelectTrigger><SelectContent>{availableAccounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.accountName} ({acc.accountType})</SelectItem>)}</SelectContent></Select></div>
              <div className="lg:col-span-3"><Label>Budgeted Amount (UGX)*</Label><Input type="number" value={budgetedAmount} onChange={e => setBudgetedAmount(e.target.value)} placeholder="e.g., 5000000"/></div>
              <Button onClick={handleAddBudget} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <PlusCircle className="mr-2 h-4 w-4"/>} Add Budget Line
              </Button>
            </div>
          </div>
          <Separator className="my-6"/>
          <h4 className="font-semibold text-lg mb-2">Existing Budget Lines</h4>
           {allBudgets.length === 0 ? <p className="text-sm text-muted-foreground">No budget lines created yet.</p> : (
            <Table>
                <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Academic Year</TableHead><TableHead>Term</TableHead><TableHead className="text-right">Budgeted Amount (UGX)</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                {allBudgets.map(budget => (
                    <TableRow key={budget.id}>
                        <TableCell className="font-medium">{budget.accountName} <Badge variant="outline">{budget.accountType}</Badge></TableCell>
                        <TableCell>{academicYears.find(y => y.id === budget.academicYearId)?.year || 'N/A'}</TableCell>
                        <TableCell>{budget.term}</TableCell>
                        <TableCell className="text-right font-mono">{budget.budgetedAmount.toLocaleString()}</TableCell>
                        <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => handleDeleteBudget(budget.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
           )}
        </CardContent>
      </Card>
    </div>
  );
}
