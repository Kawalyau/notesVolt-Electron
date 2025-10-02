// src/app/school/dashboard/[schoolId]/reports/finance/income-statement/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services';
import type { School, JournalEntry, ChartOfAccountItem, AppTimestamp } from '@/types/school';
import { Timestamp, collection as firestoreCollection, query as firestoreQuery, where, orderBy, getDocs, doc } from 'firebase/firestore';
import { firestore } from '@/config/firebase';
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, BookText, TrendingUp, TrendingDown, AlertTriangle, CalendarDays, Download } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Separator } from '@/components/ui/separator';

interface AggregatedAccountData {
  accountId: string;
  accountName: string;
  accountCode?: string | null;
  totalAmount: number;
}

const endOfDayForRange = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(23, 59, 59, 999);
  return newDate;
};

const escapeCsvValue = (value: any): string => {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const exportToExcel = (filename: string, reportData: any) => {
    const { school, asOfDate, revenueAccounts, expenseAccounts, totalRevenue, totalExpenses, netIncome } = reportData;

    const wb = XLSX.utils.book_new();
    const ws_data: any[][] = [
      [school?.name || 'School Name'],
      ['Income Statement'],
      [`For the period ending ${format(asOfDate, "MMMM dd, yyyy")}`],
      [],
      ["Revenue"],
    ];

    revenueAccounts.forEach((item: any) => {
        ws_data.push([`  ${item.accountName}`, item.totalAmount]);
    });
    ws_data.push(["Total Revenue", totalRevenue]);
    ws_data.push([]);

    ws_data.push(["Operating Expenses"]);
    expenseAccounts.forEach((item: any) => {
        ws_data.push([`  ${item.accountName}`, item.totalAmount]);
    });
    ws_data.push(["Total Operating Expenses", totalExpenses]);
    ws_data.push([]);
    ws_data.push(["Net Income / (Loss)", netIncome]);
    
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    
    // Formatting can be added here if needed
    // e.g., ws['A1'].s = { font: { bold: true, sz: 16 } };
    
    XLSX.utils.book_append_sheet(wb, ws, "Income_Statement");
    XLSX.writeFile(wb, `${filename}.xlsx`);
};

export default function IncomeStatementPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccountItem[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfYear(new Date()),
    to: endOfYear(new Date()),
  });

  const fetchReportData = useCallback(async () => {
    if (!user || !schoolId || !dateRange?.from || !dateRange?.to ) {
      setIsLoading(false);
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
      const toTimestamp = Timestamp.fromDate(endOfDayForRange(dateRange.to));

      const [fetchedJournalEntries, fetchedCoA] = await Promise.all([
        getSchoolSubcollectionItems<JournalEntry>(schoolId, 'journalEntries', [
            firestoreQuery(firestoreCollection(firestore, `schools/${schoolId}/journalEntries`), where("date", ">=", fromTimestamp), where("date", "<=", toTimestamp)) // Use imported functions
        ]),
        getSchoolSubcollectionItems<ChartOfAccountItem>(schoolId, 'chartOfAccounts')
      ]);
      setJournalEntries(fetchedJournalEntries);
      setChartOfAccounts(fetchedCoA);

    } catch (error: any) {
      console.error("Error loading income statement data:", error);
      toast({ variant: "destructive", title: "Error", description: `Could not load report data. ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router, dateRange]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const { revenueAccounts, expenseAccounts, totalRevenue, totalExpenses, netIncome } = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to || !journalEntries.length || !chartOfAccounts.length) {
      return { revenueAccounts: [], expenseAccounts: [], totalRevenue: 0, totalExpenses: 0, netIncome: 0 };
    }

    const periodEntries = journalEntries; // Already filtered by date in fetchReportData

    const revenueData: Record<string, number> = {};
    const expenseData: Record<string, number> = {};

    periodEntries.forEach(entry => {
      entry.lines.forEach(line => {
        const account = chartOfAccounts.find(acc => acc.id === line.accountId);
        if (account) {
          if (account.accountType === 'Revenue') {
            revenueData[account.id] = (revenueData[account.id] || 0) + (line.credit || 0) - (line.debit || 0);
          } else if (account.accountType === 'Expense') {
            expenseData[account.id] = (expenseData[account.id] || 0) + (line.debit || 0) - (line.credit || 0);
          }
        }
      });
    });

    const aggregatedRevenue = Object.entries(revenueData)
      .map(([accountId, totalAmount]) => {
        const account = chartOfAccounts.find(acc => acc.id === accountId)!;
        return { accountId, accountName: account.accountName, accountCode: account.accountCode, totalAmount };
      })
      .filter(item => Math.abs(item.totalAmount) > 0.001) 
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const aggregatedExpenses = Object.entries(expenseData)
      .map(([accountId, totalAmount]) => {
        const account = chartOfAccounts.find(acc => acc.id === accountId)!;
        return { accountId, accountName: account.accountName, accountCode: account.accountCode, totalAmount };
      })
      .filter(item => Math.abs(item.totalAmount) > 0.001)
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const currentTotalRevenue = aggregatedRevenue.reduce((sum, item) => sum + item.totalAmount, 0);
    const currentTotalExpenses = aggregatedExpenses.reduce((sum, item) => sum + item.totalAmount, 0);
    
    return {
      revenueAccounts: aggregatedRevenue,
      expenseAccounts: aggregatedExpenses,
      totalRevenue: currentTotalRevenue,
      totalExpenses: currentTotalExpenses,
      netIncome: currentTotalRevenue - currentTotalExpenses,
    };
  }, [dateRange, journalEntries, chartOfAccounts]);

  const presetDateRanges = [
    { label: "This Month", range: { from: startOfMonth(new Date()), to: endOfMonth(new Date()) } },
    { label: "Last Month", range: { from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) } },
    { label: "This Year", range: { from: startOfYear(new Date()), to: endOfYear(new Date()) } },
  ];

  const handleExport = () => {
    if (!school || !dateRange?.to) {
        toast({ title: "No data to export" });
        return;
    }
    const reportData = {
        school,
        asOfDate: dateRange.to,
        revenueAccounts,
        expenseAccounts,
        totalRevenue,
        totalExpenses,
        netIncome,
    };
    const filename = `Income_Statement_${school.name.replace(/\s/g, '_')}_${format(dateRange.to, 'yyyy-MM-dd')}`;
    exportToExcel(filename, reportData);
};


  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center"><BookText className="mr-3 h-6 w-6 text-primary"/>Income Statement (Profit & Loss)</CardTitle>
              <CardDescription>Financial performance of {school?.name || 'the school'} for the selected period, derived from Journal Entries.</CardDescription>
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
                <DatePickerWithRange
                    date={dateRange}
                    onDateChange={setDateRange}
                    className="w-full sm:w-auto"
                />
                <Button onClick={handleExport} variant="outline" size="sm" disabled={isLoading || (revenueAccounts.length === 0 && expenseAccounts.length === 0)}>
                    <Download className="mr-2 h-4 w-4"/> Export Excel
                </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
          ) : !dateRange?.from || !dateRange?.to ? (
             <div className="text-center py-10 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-3"/>
                <p>Please select a date range to generate the Income Statement.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center mb-4">
                 <h3 className="text-xl font-semibold">{school?.name || 'School Name'}</h3>
                 <p className="text-lg">Income Statement</p>
                <p className="text-sm text-muted-foreground">
                  For the period: {dateRange?.from ? format(dateRange.from, "PP") : "N/A"} - {dateRange?.to ? format(dateRange.to, "PP") : "N/A"}
                </p>
              </div>

              <section>
                <h3 className="text-xl font-semibold mb-2 flex items-center text-green-700"><TrendingUp className="mr-2 h-5 w-5"/>Revenue</h3>
                <Table>
                  <TableHeader><TableRow><TableHead>Account Code</TableHead><TableHead>Revenue Account</TableHead><TableHead className="text-right">Amount (UGX)</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {revenueAccounts.length === 0 &&
                        <TableRow><TableCell colSpan={3} className="text-sm text-muted-foreground text-center py-3">No revenue recorded for this period.</TableCell></TableRow>
                    }
                    {revenueAccounts.map(item => (
                      <TableRow key={item.accountId}><TableCell className="text-xs">{item.accountCode || 'N/A'}</TableCell><TableCell>{item.accountName}</TableCell><TableCell className="text-right">{item.totalAmount.toFixed(2)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                   <TableFooter>
                    <TableRow className="font-bold text-md bg-muted/30">
                        <TableCell colSpan={2} className="text-right">Total Revenue</TableCell>
                        <TableCell className="text-right">{totalRevenue.toFixed(2)}</TableCell>
                    </TableRow>
                   </TableFooter>
                </Table>
              </section>

              <Separator className="my-4"/>

              <section>
                <h3 className="text-xl font-semibold mb-2 flex items-center text-red-700"><TrendingDown className="mr-2 h-5 w-5"/>Operating Expenses</h3>
                 {expenseAccounts.length === 0 ? <p className="text-sm text-muted-foreground pl-2 py-3">No expenses recorded for this period.</p> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Account Code</TableHead><TableHead>Expense Account</TableHead><TableHead className="text-right">Amount (UGX)</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {expenseAccounts.map(item => (
                        <TableRow key={item.accountId}><TableCell className="text-xs">{item.accountCode || 'N/A'}</TableCell><TableCell>{item.accountName}</TableCell><TableCell className="text-right">{item.totalAmount.toFixed(2)}</TableCell></TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="font-bold text-md bg-muted/30">
                            <TableCell colSpan={2} className="text-right">Total Operating Expenses</TableCell>
                            <TableCell className="text-right">{totalExpenses.toFixed(2)}</TableCell>
                        </TableRow>
                    </TableFooter>
                  </Table>
                )}
              </section>

              <Separator className="my-6 border-2 border-primary/50"/>

              <section className="text-center">
                <h3 className={`text-2xl font-bold ${netIncome >= 0 ? "text-green-700" : "text-red-700"}`}>
                  Net {netIncome >= 0 ? "Income" : "Loss"}
                </h3>
                <p className={`text-3xl font-extrabold ${netIncome >= 0 ? "text-green-700" : "text-red-700"}`}>
                  UGX {netIncome.toFixed(2)}
                </p>
              </section>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

    
