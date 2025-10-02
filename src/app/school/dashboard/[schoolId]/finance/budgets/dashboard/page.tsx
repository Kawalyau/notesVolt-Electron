// src/app/school/dashboard/[schoolId]/finance/budgets/dashboard/page.tsx
"use client";

import * as React from 'react';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services';
import type { School, JournalEntry, ChartOfAccountItem, Budget, SchoolAcademicYear, SchoolTerm, AppTimestamp } from '@/types/school';
import { Timestamp, collection, query as firestoreQuery, onSnapshot, where, orderBy, limit } from 'firebase/firestore'; 
import { firestore } from '@/config/firebase';
import { parseISO, format as formatDateFns } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Target, CalendarDays, Edit, ArrowRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from 'next/link';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';

interface BudgetReportLine {
  accountId: string;
  accountName: string;
  accountCode?: string | null;
  accountType: 'Revenue' | 'Expense';
  budgetedAmount: number;
  actualAmount: number;
  remainingBalance: number;
  percentageUsed: number;
  isParent: boolean;
}

interface HierarchicalBudget {
    parent: BudgetReportLine;
    children: BudgetReportLine[];
}

export default function BudgetDashboardPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [academicYears, setAcademicYears] = useState<SchoolAcademicYear[]>([]);
  const [schoolTerms, setSchoolTerms] = useState<SchoolTerm[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccountItem[]>([]);

  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  
  const fetchBudgetData = useCallback(async () => {
    if (!user || !schoolId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" }); router.push(`/school/dashboard/${schoolId}`); return;
      }
      setSchool(fetchedSchool);
      
      const [budgetData, yearsData, termsData, coaData] = await Promise.all([
        getSchoolSubcollectionItems<Budget>(schoolId, 'budgets'),
        getSchoolSubcollectionItems<SchoolAcademicYear>(schoolId, 'schoolAcademicYears'),
        getSchoolSubcollectionItems<SchoolTerm>(schoolId, 'schoolTerms'),
        getSchoolSubcollectionItems<ChartOfAccountItem>(schoolId, 'chartOfAccounts'),
      ]);
      
      setBudgets(budgetData);
      setAcademicYears(yearsData.sort((a,b) => (b.year || "").localeCompare(a.year || "")));
      setSchoolTerms(termsData);
      setChartOfAccounts(coaData);

      // Set initial period based on current school settings if available
      const currentYear = yearsData.find(y => y.id === fetchedSchool.currentAcademicYearId);
      const currentTermInfo = termsData.find(t => t.academicYearId === fetchedSchool.currentAcademicYearId && t.name === fetchedSchool.currentTerm);
      if (currentYear && currentTermInfo) {
          setSelectedAcademicYearId(currentYear.id);
          setSelectedTerm(currentTermInfo.name);
          // Here you could also set a default dateRange based on term dates if you store them.
      }


    } catch (error: any) {
      console.error("Error loading initial budget data:", error);
      toast({ variant: "destructive", title: "Error", description: `Could not load initial report data. ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router]);
  
  useEffect(() => {
    fetchBudgetData();
  
    // Listen to all journal entries for real-time updates. Filtering will be done client-side.
    const journalEntriesQuery = firestoreQuery(
      collection(firestore, `schools/${schoolId}/journalEntries`),
      orderBy("date", "desc"),
      limit(1000) // Limit to a reasonable number for performance, e.g., last 1000 entries
    );

    const unsubscribe = onSnapshot(journalEntriesQuery, (querySnapshot) => {
      const entries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JournalEntry));
      setJournalEntries(entries);
    }, (error) => {
      console.error("Error listening to journal entries:", error);
      toast({ variant: "destructive", title: "Real-time Error", description: "Could not listen for financial updates." });
    });
  
    return () => unsubscribe();
  }, [fetchBudgetData, schoolId, toast]);

  const reportData = useMemo(() => {
    if (isLoading || !selectedAcademicYearId || !selectedTerm || budgets.length === 0 || chartOfAccounts.length === 0) {
      return { revenue: { standalone: [], withChildren: [] }, expense: { standalone: [], withChildren: [] } };
    }
  
    const relevantBudgetLines = budgets.filter(b => b.academicYearId === selectedAcademicYearId && b.term === selectedTerm);
  
    // Filter journal entries based on the date range, not academic context
    const periodEntries = journalEntries.filter(entry => {
      if (!dateRange || !dateRange.from || !dateRange.to) return false; // Ensure dateRange is defined
      const entryDate = entry.date ? (entry.date instanceof Timestamp ? entry.date.toDate() : parseISO(entry.date as string)) : null;
      if (!entryDate) return false;
      return entryDate >= dateRange.from && entryDate <= dateRange.to;
    });
  
    const calculatedLines = relevantBudgetLines.map(budgetLine => {
      const accountInfo = chartOfAccounts.find(acc => acc.id === budgetLine.accountId);
      if (!accountInfo) return null;
  
      const actualAmount = periodEntries
        .flatMap(entry => entry.lines)
        .filter(line => line.accountId === budgetLine.accountId)
        .reduce((sum, line) => {
          if (accountInfo.accountType === 'Revenue' || accountInfo.accountType === 'Equity' || accountInfo.accountType === 'Liability') {
            return sum + (line.credit || 0) - (line.debit || 0);
          }
          return sum + (line.debit || 0) - (line.credit || 0);
        }, 0);
  
      const remaining = accountInfo.accountType === 'Revenue' ? budgetLine.budgetedAmount - actualAmount : budgetLine.budgetedAmount - actualAmount;
      const percentageUsed = budgetLine.budgetedAmount > 0 ? (actualAmount / budgetLine.budgetedAmount) * 100 : (actualAmount > 0 ? 100 : 0);
  
      return {
        accountId: budgetLine.accountId,
        accountName: accountInfo.accountName,
        accountCode: accountInfo.accountCode,
        accountType: accountInfo.accountType as 'Revenue' | 'Expense',
        budgetedAmount: budgetLine.budgetedAmount,
        actualAmount: actualAmount,
        remainingBalance: remaining,
        percentageUsed: percentageUsed,
        isParent: chartOfAccounts.some(coa => coa.parentAccountId === budgetLine.accountId)
      };
    }).filter((item): item is BudgetReportLine => item !== null);
  
    const revenueLines: HierarchicalBudget[] = [];
    const expenseLines: HierarchicalBudget[] = [];
    const standaloneRevenue: BudgetReportLine[] = [];
    const standaloneExpense: BudgetReportLine[] = [];
  
    calculatedLines.forEach(line => {
      const accountInfo = chartOfAccounts.find(acc => acc.id === line.accountId);
      if (accountInfo?.parentAccountId) {
        let parentGroup: HierarchicalBudget | undefined;
        if (accountInfo.accountType === 'Revenue') {
          parentGroup = revenueLines.find(g => g.parent.accountId === accountInfo.parentAccountId);
        } else { // Expense
          parentGroup = expenseLines.find(g => g.parent.accountId === accountInfo.parentAccountId);
        }
  
        if (!parentGroup) {
          const parentLineInBudget = calculatedLines.find(l => l.accountId === accountInfo.parentAccountId);
          const parentAccount = chartOfAccounts.find(p => p.id === accountInfo.parentAccountId);
          if (parentAccount) {
            parentGroup = {
              parent: parentLineInBudget || { accountId: parentAccount.id, accountName: parentAccount.accountName, accountType: parentAccount.accountType as 'Revenue' | 'Expense', budgetedAmount: 0, actualAmount: 0, remainingBalance: 0, percentageUsed: 0, isParent: true },
              children: []
            };
            if (parentAccount.accountType === 'Revenue') revenueLines.push(parentGroup);
            else expenseLines.push(parentGroup);
          }
        }
        parentGroup?.children.push(line);
      } else if (!calculatedLines.some(child => chartOfAccounts.find(acc => acc.id === child.accountId)?.parentAccountId === line.accountId)) {
        if (line.accountType === 'Revenue') standaloneRevenue.push(line);
        else if (line.accountType === 'Expense') standaloneExpense.push(line);
      }
    });
  
    // Sum up children totals into parent
    [...revenueLines, ...expenseLines].forEach(group => {
      group.parent.budgetedAmount = group.children.reduce((sum, child) => sum + child.budgetedAmount, group.parent.budgetedAmount > 0 ? group.parent.budgetedAmount : 0);
      group.parent.actualAmount = group.children.reduce((sum, child) => sum + child.actualAmount, 0); // Don't add parent's actual amount as it's not directly transacted.
      group.parent.remainingBalance = group.parent.budgetedAmount - group.parent.actualAmount;
      group.parent.percentageUsed = group.parent.budgetedAmount > 0 ? (group.parent.actualAmount / group.parent.budgetedAmount) * 100 : 0;
    });
  
    return {
      revenue: { standalone: standaloneRevenue, withChildren: revenueLines },
      expense: { standalone: standaloneExpense, withChildren: expenseLines }
    };
  }, [isLoading, budgets, journalEntries, selectedAcademicYearId, selectedTerm, chartOfAccounts, dateRange]);
  
  const availableTerms = schoolTerms.filter(t => t.academicYearId === selectedAcademicYearId);

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  const hasData = reportData.revenue.standalone.length > 0 || reportData.revenue.withChildren.length > 0 || reportData.expense.standalone.length > 0 || reportData.expense.withChildren.length > 0;

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center"><Target className="mr-3 h-6 w-6 text-primary"/>Budget vs. Actuals</CardTitle>
              <CardDescription>Track income and expenditure against your set budget for a selected period.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
                <Select value={selectedAcademicYearId} onValueChange={setSelectedAcademicYearId}><SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue placeholder="Select Year"/></SelectTrigger><SelectContent>{academicYears.map(y => <SelectItem key={y.id} value={y.id}>{y.year}</SelectItem>)}</SelectContent></Select>
                <Select value={selectedTerm} onValueChange={setSelectedTerm}><SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue placeholder="Select Term"/></SelectTrigger><SelectContent>{availableTerms.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent></Select>
                <Button asChild variant="outline" size="sm"><Link href={`/school/dashboard/${schoolId}/finance/budgets/settings`}><Edit className="mr-2 h-4 w-4"/>Edit Budget Setup</Link></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedAcademicYearId || !selectedTerm ? (
            <div className="text-center py-10 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-3"/>
                <p>Please select an Academic Year and Term to view the budget report.</p>
            </div>
          ) : !hasData ? (
            <div className="text-center py-10 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-3"/>
                <p>No budget lines have been defined for the selected period.</p>
            </div>
          ) : (
            <Accordion type="multiple" defaultValue={['revenue', 'expense']} className="w-full space-y-4">
              <BudgetCategorySection title="Revenue" standaloneItems={reportData.revenue.standalone} hierarchicalItems={reportData.revenue.withChildren} schoolId={schoolId} />
              <BudgetCategorySection title="Expense" standaloneItems={reportData.expense.standalone} hierarchicalItems={reportData.expense.withChildren} schoolId={schoolId} />
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const BudgetCategorySection = ({ title, standaloneItems, hierarchicalItems, schoolId }: { title: 'Revenue' | 'Expense', standaloneItems: BudgetReportLine[], hierarchicalItems: HierarchicalBudget[], schoolId: string }) => {
  const allParentLevelItems = [...standaloneItems, ...hierarchicalItems.map(h => h.parent)];
  const totalBudgeted = allParentLevelItems.reduce((sum, item) => sum + item.budgetedAmount, 0);
  const totalActual = allParentLevelItems.reduce((sum, item) => sum + item.actualAmount, 0);
  const totalRemaining = totalBudgeted - totalActual;

  return (
    <AccordionItem value={title.toLowerCase()}>
      <AccordionTrigger className={`text-lg font-semibold ${title === 'Revenue' ? 'text-green-700' : 'text-red-700'} bg-muted/50 px-4 rounded-t-lg`}>
        {title}
      </AccordionTrigger>
      <AccordionContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Budgeted</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right">Remaining</TableHead><TableHead className="w-[200px]">Usage</TableHead></TableRow></TableHeader>
          <TableBody>
            {standaloneItems.map(line => <BudgetRow key={line.accountId} line={line} schoolId={schoolId} />)}
            {hierarchicalItems.map(({ parent, children }) => (
              <React.Fragment key={parent.accountId}>
                <BudgetRow line={parent} schoolId={schoolId} isParent />
                {children.map(child => <BudgetRow key={child.accountId} line={child} schoolId={schoolId} isChild />)}
              </React.Fragment>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="bg-muted/50 font-bold">
              <TableCell colSpan={1}>Total {title}</TableCell>
              <TableCell className="text-right font-mono">{totalBudgeted.toLocaleString()}</TableCell>
              <TableCell className="text-right font-mono">{totalActual.toLocaleString()}</TableCell>
              <TableCell className="text-right font-mono">{totalRemaining.toLocaleString()}</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </AccordionContent>
    </AccordionItem>
  )
}

const BudgetRow = ({ line, schoolId, isParent = false, isChild = false }: { line: BudgetReportLine, schoolId: string, isParent?: boolean, isChild?: boolean }) => {
  const finalPercentageUsed = line.percentageUsed;
  const isOverBudget = finalPercentageUsed > 100 && line.accountType === 'Expense';
  const remainingColor = line.accountType === 'Revenue' ? (line.remainingBalance <= 0 ? 'text-green-600' : 'text-amber-600') : (line.remainingBalance >= 0 ? 'text-green-600' : 'text-red-600');

  return(
     <TableRow className={isParent ? 'bg-muted/30' : ''}>
      <TableCell className={`${isChild ? 'pl-8' : ''}`}>
        <Link href={`/school/dashboard/${schoolId}/reports/finance/account-ledger/${line.accountId}`} className="font-medium hover:underline text-primary flex items-center gap-2">
            {line.accountName} {isParent && <ArrowRight className="h-3 w-3 text-muted-foreground"/>}
        </Link>
        <p className="text-xs text-muted-foreground">{line.accountCode || 'No Code'}</p>
      </TableCell>
      <TableCell className="text-right font-mono">{line.budgetedAmount.toLocaleString()}</TableCell>
      <TableCell className="text-right font-mono">{line.actualAmount.toLocaleString()}</TableCell>
      <TableCell className={`text-right font-mono font-semibold ${remainingColor}`}>{line.remainingBalance.toLocaleString()}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Progress value={Math.min(100, finalPercentageUsed)} className={isOverBudget ? "[&>*]:bg-destructive" : ""} />
          <span className={`text-xs w-12 text-right ${isOverBudget ? 'text-destructive font-semibold' : ''}`}>{finalPercentageUsed.toFixed(0)}%</span>
        </div>
      </TableCell>
    </TableRow>
  );
};
