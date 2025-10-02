
// src/app/school/dashboard/[schoolId]/reports/finance/expense-ledger/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services';
import type { School, SchoolExpense } from '@/types/school';
import { firestore } from '@/config/firebase';
import { Timestamp, query, where, orderBy } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Library, CalendarDays, Filter } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ExpenseLedgerPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [expenseEntries, setExpenseEntries] = useState<SchoolExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const fetchExpenseData = useCallback(async () => {
    if (!user || !schoolId || !dateRange?.from || !dateRange?.to) {
      if (!dateRange?.from || !dateRange?.to) setExpenseEntries([]);
      return;
    }
    setIsLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" });
        router.push(`/school/dashboard/${schoolId}`); return;
      }
      setSchool(fetchedSchool);

      const fromTimestamp = Timestamp.fromDate(dateRange.from);
      const toTimestamp = Timestamp.fromDate(dateRange.to);
      
      const qConstraints = [
        where("date", ">=", fromTimestamp),
        where("date", "<=", toTimestamp),
        orderBy("date", "desc")
      ];
      const fetchedExpenses = await getSchoolSubcollectionItems<SchoolExpense>(schoolId, 'expenses', qConstraints);
      setExpenseEntries(fetchedExpenses);
    } catch (error) {
      console.error("Error loading expense ledger data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load expense data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router, dateRange]);

  useEffect(() => {
    fetchExpenseData();
  }, [fetchExpenseData]);

  const totalExpensesForPeriod = expenseEntries.reduce((sum, item) => sum + item.amount, 0);
  
  const presetDateRanges = [
    { label: "This Month", range: { from: startOfMonth(new Date()), to: endOfMonth(new Date()) } },
    { label: "Last Month", range: { from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) } },
    { label: "This Year", range: { from: startOfYear(new Date()), to: endOfYear(new Date()) } },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center"><Library className="mr-3 h-6 w-6 text-primary"/>Expense Ledger</CardTitle>
              <CardDescription>Detailed list of all recorded expenses for {school?.name || 'the school'}.</CardDescription>
            </div>
             <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                <div className="flex gap-1 sm:gap-2 flex-wrap">
                    {presetDateRanges.map(preset => (
                        <Button key={preset.label} variant="outline" size="xs" onClick={() => setDateRange(preset.range)}
                                className={dateRange?.from?.getTime() === preset.range.from.getTime() && dateRange?.to?.getTime() === preset.range.to.getTime() ? "bg-primary/10 text-primary border-primary" : ""}>
                            {preset.label}
                        </Button>
                    ))}
                </div>
                <DatePickerWithRange date={dateRange} onDateChange={setDateRange} className="w-full sm:w-auto" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
          ) : !dateRange?.from || !dateRange?.to ? (
             <div className="text-center py-10 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-3"/>
                <p>Please select a date range to view the expense ledger.</p>
            </div>
          ) : expenseEntries.length === 0 ? (
             <div className="text-center py-10 text-muted-foreground">
                <Library className="h-12 w-12 mx-auto mb-3"/>
                <p>No expense transactions found for the selected period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs">Payment Method</TableHead>
                    <TableHead className="text-xs">Reference</TableHead>
                    <TableHead className="text-right text-xs">Amount (UGX)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseEntries.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs">{format((item.date as Timestamp).toDate(), "PP")}</TableCell>
                      <TableCell className="text-xs font-medium">{item.category}</TableCell>
                      <TableCell className="text-xs truncate max-w-sm">{item.description}</TableCell>
                      <TableCell className="text-xs">{item.paymentMethod || 'N/A'}</TableCell>
                      <TableCell className="text-xs">{item.reference || 'N/A'}</TableCell>
                      <TableCell className="text-right text-xs font-semibold">{item.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-right font-bold mt-4 text-md">Total Expenses for Period: UGX {totalExpensesForPeriod.toFixed(2)}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
