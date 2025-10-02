
// src/app/school/dashboard/[schoolId]/reports/finance/financial-ratios/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services';
import type { School, SchoolIncome, SchoolExpense, Student, FeeTransaction } from '@/types/school';
import { Timestamp, query, where } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';
import { explainFinancialRatio, type ExplainFinancialRatioInput } from '@/ai/flows/explain-financial-ratio-flow';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Percent, BookOpen, Info, Scale, Lightbulb, TrendingUp, TrendingDown } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DatePicker } from '@/components/ui/date-picker';
import type { DateRange } from 'react-day-picker';

interface CalculatedRatio {
  name: string;
  value: number | string;
  unit: '%' | '' | 'ratio';
  explanation?: string;
  isLoadingExplanation?: boolean;
  requiresPeriod: boolean; // True if based on income/expense period
  requiresAsOfDate: boolean; // True if based on balance sheet items as of a date
}

export default function FinancialRatiosPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingData, setIsFetchingData] = useState(false);

  // Dates for fetching data
  const [incomeExpensePeriod, setIncomeExpensePeriod] = useState<DateRange | undefined>({
    from: startOfYear(new Date()),
    to: endOfYear(new Date()),
  });
  const [balanceSheetAsOfDate, setBalanceSheetAsOfDate] = useState<Date | undefined>(endOfMonth(subMonths(new Date(), 1)));

  // Fetched data states
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [accountsReceivable, setAccountsReceivable] = useState(0);
  const [feesPaidInAdvance, setFeesPaidInAdvance] = useState(0);

  const [ratios, setRatios] = useState<CalculatedRatio[]>([]);

  const fetchDataForRatios = useCallback(async () => {
    if (!user || !schoolId || !incomeExpensePeriod?.from || !incomeExpensePeriod?.to || !balanceSheetAsOfDate) {
      // Reset data if dates are not set
      setTotalIncome(0); setTotalExpenses(0); setAccountsReceivable(0); setFeesPaidInAdvance(0);
      return;
    }
    setIsFetchingData(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" });
        router.push(`/school/dashboard/${schoolId}`); return;
      }
      setSchool(fetchedSchool);

      // Fetch Income & Expenses for the period
      const fromTimestamp = Timestamp.fromDate(incomeExpensePeriod.from);
      const toTimestamp = Timestamp.fromDate(incomeExpensePeriod.to);

      const [incomeEntries, expenseEntries, students] = await Promise.all([
        getSchoolSubcollectionItems<SchoolIncome>(schoolId, 'income', [where("date", ">=", fromTimestamp), where("date", "<=", toTimestamp)]),
        getSchoolSubcollectionItems<SchoolExpense>(schoolId, 'expenses', [where("date", ">=", fromTimestamp), where("date", "<=", toTimestamp)]),
        getSchoolSubcollectionItems<Student>(schoolId, 'students') // For balance sheet items
      ]);
      setTotalIncome(incomeEntries.reduce((sum, item) => sum + item.amount, 0));
      setTotalExpenses(expenseEntries.reduce((sum, item) => sum + item.amount, 0));
      
      // Calculate Accounts Receivable and Fees Paid in Advance as of balanceSheetAsOfDate
      let totalReceivables = 0;
      let totalAdvance = 0;
      const asOfMillis = balanceSheetAsOfDate.getTime();

      for (const student of students) {
          const transactions = await getSchoolSubcollectionItems<FeeTransaction>(schoolId, `students/${student.id}/feeTransactions`, [where("transactionDate", "<=", Timestamp.fromDate(balanceSheetAsOfDate))]);
          let studentBalance = 0;
          transactions.forEach(tx => {
              if (tx.type === 'debit') studentBalance += tx.amount;
              else if (tx.type === 'credit') studentBalance -= tx.amount;
          });
          if (studentBalance > 0) totalReceivables += studentBalance;
          else if (studentBalance < 0) totalAdvance += Math.abs(studentBalance);
      }
      setAccountsReceivable(totalReceivables);
      setFeesPaidInAdvance(totalAdvance);

    } catch (error) {
      console.error("Error loading data for financial ratios:", error);
      toast({ variant: "destructive", title: "Data Load Error", description: "Could not load financial data." });
    } finally {
      setIsFetchingData(false);
      setIsLoading(false); // Initial overall loading
    }
  }, [schoolId, user, toast, router, incomeExpensePeriod, balanceSheetAsOfDate]);

  useEffect(() => {
    if (user && schoolId) {
        fetchDataForRatios();
    } else if (!user && !isLoading) {
      router.push('/school/auth');
    }
  }, [user, schoolId, fetchDataForRatios, isLoading, router]); // Added isLoading and router


  useEffect(() => {
    // Calculate ratios whenever fetched data changes
    const netIncome = totalIncome - totalExpenses;
    const profitMargin = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;
    const expenseToIncomeRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;
    // Simplified Current Ratio (conceptual, as we lack full current assets/liabilities)
    const studentDuesCoverageRatio = feesPaidInAdvance > 0 ? accountsReceivable / feesPaidInAdvance : (accountsReceivable > 0 ? Infinity : 0);


    setRatios([
      { name: "Profit Margin", value: profitMargin, unit: '%', requiresPeriod: true, requiresAsOfDate: false },
      { name: "Operating Expense Ratio", value: expenseToIncomeRatio, unit: '%', requiresPeriod: true, requiresAsOfDate: false },
      { name: "Student Dues Coverage Ratio", value: studentDuesCoverageRatio === Infinity ? "High (Positive AR, No Advances)" : studentDuesCoverageRatio, unit: 'ratio', requiresPeriod: false, requiresAsOfDate: true,
        explanation: studentDuesCoverageRatio === Infinity ? "Indicates the school has outstanding student fees (accounts receivable) but no recorded student fees paid in advance. This suggests good collection or all fees are due." : undefined
      },
      // Placeholder for future ratios if more data becomes available
      // { name: "Current Ratio (Simplified)", value: "N/A (Needs Cash/Bank Data)", unit: 'ratio', requiresPeriod: false, requiresAsOfDate: true },
    ]);
  }, [totalIncome, totalExpenses, accountsReceivable, feesPaidInAdvance]);

  const handleExplainRatio = async (index: number) => {
    const ratio = ratios[index];
    if (ratio.explanation && !ratio.isLoadingExplanation) return; // Already have it or loading

    setRatios(prev => prev.map((r, i) => i === index ? { ...r, isLoadingExplanation: true } : r));
    try {
      const input: ExplainFinancialRatioInput = {
        ratioName: ratio.name,
        ratioValue: typeof ratio.value === 'number' ? ratio.value.toFixed(2) : ratio.value,
        context: `for the school named "${school?.name || 'this school'}"`,
      };
      const result = await explainFinancialRatio(input);
      setRatios(prev => prev.map((r, i) => i === index ? { ...r, explanation: result.explanation, isLoadingExplanation: false } : r));
    } catch (error) {
      console.error(`Error explaining ratio ${ratio.name}:`, error);
      toast({ variant: "destructive", title: "AI Error", description: `Could not generate explanation for ${ratio.name}.` });
      setRatios(prev => prev.map((r, i) => i === index ? { ...r, isLoadingExplanation: false, explanation: "Could not load explanation." } : r));
    }
  };
  
  const presetDateRanges = [
    { label: "This Year", range: { from: startOfYear(new Date()), to: endOfYear(new Date()) } },
    { label: "Last Year", range: { from: startOfYear(subMonths(new Date(), 12)), to: endOfYear(subMonths(new Date(), 12)) } },
    { label: "This Month", range: { from: startOfMonth(new Date()), to: endOfMonth(new Date()) } },
    { label: "Last Month", range: { from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) } },
  ];


  if (isLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center"><Percent className="mr-3 h-6 w-6 text-primary"/>Financial Ratios Analysis</CardTitle>
              <CardDescription>Key performance indicators based on your school's financial data for {school?.name || 'the school'}.</CardDescription>
            </div>
             <Button onClick={() => fetchDataForRatios()} variant="outline" size="sm" disabled={isFetchingData || !incomeExpensePeriod?.from || !incomeExpensePeriod?.to || !balanceSheetAsOfDate}>
                {isFetchingData ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Info className="h-4 w-4 mr-2"/>}
                Refresh Data
            </Button>
          </div>
           <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-end border-t pt-4">
            <div>
                <Label className="text-xs text-muted-foreground">Period for Income Statement Ratios</Label>
                <div className="flex gap-1 sm:gap-2 flex-wrap mt-1 mb-2">
                    {presetDateRanges.map(preset => (
                        <Button key={preset.label} variant="outline" size="xs" onClick={() => setIncomeExpensePeriod(preset.range)}
                                className={incomeExpensePeriod?.from?.getTime() === preset.range.from.getTime() && incomeExpensePeriod?.to?.getTime() === preset.range.to.getTime() ? "bg-primary/10 text-primary border-primary" : ""}>
                            {preset.label}
                        </Button>
                    ))}
                </div>
                <DatePickerWithRange date={incomeExpensePeriod} onDateChange={setIncomeExpensePeriod} className="w-full" />
            </div>
            <div>
                <Label className="text-xs text-muted-foreground">As of Date for Balance Sheet Ratios</Label>
                <DatePicker date={balanceSheetAsOfDate} onDateChange={setBalanceSheetAsOfDate} buttonClassName="w-full mt-1" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isFetchingData ? (
             <div className="flex justify-center items-center py-10"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
          ): (
            <div className="space-y-6">
              {ratios.map((ratio, index) => (
                <Card key={ratio.name} className="bg-muted/30">
                  <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold text-primary flex items-center">
                        {ratio.requiresPeriod ? <TrendingUp className="mr-2 h-5 w-5" /> : <Scale className="mr-2 h-5 w-5" />}
                        {ratio.name}
                      </h3>
                      <p className="text-2xl font-bold text-primary">
                        {typeof ratio.value === 'number' ? ratio.value.toFixed(2) : ratio.value}
                        {ratio.unit === '%' && '%'}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {ratio.isLoadingExplanation ? (
                      <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2"/> Generating explanation...</div>
                    ): ratio.explanation ? (
                      <Alert variant="default" className="bg-background">
                        <Lightbulb className="h-4 w-4" />
                        <AlertTitle className="font-semibold text-sm">AI Explanation</AlertTitle>
                        <AlertDescription className="text-xs">{ratio.explanation}</AlertDescription>
                      </Alert>
                    ) : (
                      <Button variant="link" size="sm" onClick={() => handleExplainRatio(index)} className="p-0 h-auto text-primary text-xs">
                        <Lightbulb className="h-3 w-3 mr-1"/> Explain this ratio
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
              <Alert className="mt-6">
                <BookOpen className="h-4 w-4" />
                <AlertTitle>Note on Ratio Interpretation</AlertTitle>
                <AlertDescription className="text-xs">
                  These ratios provide a snapshot based on available data. For "Student Dues Coverage Ratio," a high value or "Infinity" can be positive if it means all dues are collected relative to advances. Balance Sheet items like Cash, Fixed Assets, and other Liabilities are placeholders and require manual input or integration with a full accounting system for accurate standard ratios like Current Ratio or Debt-to-Equity. Always consider ratios in context and alongside other financial information.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
