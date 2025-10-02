
// src/app/school/dashboard/[schoolId]/reports/finance/consolidated-report/page.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services';
import type { School, JournalEntry, ChartOfAccountItem, FeeTransaction, SchoolIncome, SchoolExpense } from '@/types/school';
import { Timestamp, query, where, orderBy, collectionGroup, getDocs } from 'firebase/firestore';
import { firestore } from '@/config/firebase';
import { format, startOfYear, endOfYear, parseISO } from 'date-fns';
import ReactToPrint from 'react-to-print';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, FileSpreadsheet, CalendarDays, Printer } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';


const endOfDayForRange = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(23, 59, 59, 999);
  return newDate;
};

interface ReportData {
  incomeStatement: {
    revenueAccounts: any[];
    expenseAccounts: any[];
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  };
  balanceSheet: {
    assets: any[];
    liabilities: any[];
    equity: any[];
    totalAssets: number;
    totalLiabilities: number;
    periodNetIncome: number;
    finalTotalEquity: number;
    totalLiabilitiesAndEquity: number;
  };
  collections: {
    total: number;
    byMethod: Record<string, number>;
  };
}

export default function ConsolidatedFinancialReportPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [school, setSchool] = useState<School | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfYear(new Date()),
    to: endOfYear(new Date()),
  });
  const [reportData, setReportData] = useState<ReportData | null>(null);

  const generateReport = useCallback(async () => {
    if (!user || !schoolId || !dateRange?.from || !dateRange?.to) {
      toast({ variant: "destructive", title: "Missing Information", description: "Please select a valid date range." });
      return;
    }
    setIsGenerating(true);
    setReportData(null);

    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" });
        router.push(`/school/dashboard/${schoolId}`);
        return;
      }
      setSchool(fetchedSchool);

      const fromTimestamp = Timestamp.fromDate(dateRange.from);
      const toTimestamp = Timestamp.fromDate(endOfDayForRange(dateRange.to));

      const [journalEntries, chartOfAccounts, feeTransactions, incomeEntries, expenseEntries] = await Promise.all([
        getSchoolSubcollectionItems<JournalEntry>(schoolId, 'journalEntries', [where("date", "<=", toTimestamp)]),
        getSchoolSubcollectionItems<ChartOfAccountItem>(schoolId, 'chartOfAccounts'),
        getDocs(query(collectionGroup(firestore, 'feeTransactions'), where('schoolId', '==', schoolId), where('type', '==', 'credit'), where('transactionDate', '>=', fromTimestamp), where('transactionDate', '<=', toTimestamp))).then(snap => snap.docs.map(d => d.data() as FeeTransaction)),
        getSchoolSubcollectionItems<SchoolIncome>(schoolId, 'income', [where("date", ">=", fromTimestamp), where("date", "<=", toTimestamp)]),
        getSchoolSubcollectionItems<SchoolExpense>(schoolId, 'expenses', [where("date", ">=", fromTimestamp), where("date", "<=", toTimestamp)])
      ]);

      // --- Calculations ---
      const periodEntries = journalEntries.filter(entry => {
        const entryDate = (entry.date as Timestamp).toDate();
        return entryDate >= dateRange.from! && entryDate <= dateRange.to!;
      });

      // Income Statement
      const revenueData: Record<string, number> = {};
      const expenseData: Record<string, number> = {};
      periodEntries.forEach(entry => {
        entry.lines.forEach(line => {
          const account = chartOfAccounts.find(acc => acc.id === line.accountId);
          if (account) {
            if (account.accountType === 'Revenue') revenueData[account.id] = (revenueData[account.id] || 0) + (line.credit || 0) - (line.debit || 0);
            if (account.accountType === 'Expense') expenseData[account.id] = (expenseData[account.id] || 0) + (line.debit || 0) - (line.credit || 0);
          }
        });
      });
      const revenueAccounts = Object.entries(revenueData).map(([id, total]) => ({ ...chartOfAccounts.find(a => a.id === id)!, totalAmount: total }));
      const expenseAccounts = Object.entries(expenseData).map(([id, total]) => ({ ...chartOfAccounts.find(a => a.id === id)!, totalAmount: total }));
      const totalRevenue = revenueAccounts.reduce((s, i) => s + i.totalAmount, 0);
      const totalExpenses = expenseAccounts.reduce((s, i) => s + i.totalAmount, 0);

      // Balance Sheet
      const balances: Record<string, number> = {};
      chartOfAccounts.forEach(acc => balances[acc.id] = 0);
      journalEntries.forEach(entry => entry.lines.forEach(line => {
          if (balances[line.accountId] !== undefined) balances[line.accountId] += (line.debit || 0) - (line.credit || 0);
      }));
      const assets = chartOfAccounts.filter(a => a.accountType === 'Asset').map(acc => ({ ...acc, balance: balances[acc.id] || 0 }));
      const liabilities = chartOfAccounts.filter(a => a.accountType === 'Liability').map(acc => ({ ...acc, balance: balances[acc.id] || 0 }));
      const equity = chartOfAccounts.filter(a => a.accountType === 'Equity').map(acc => ({ ...acc, balance: balances[acc.id] || 0 }));
      const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
      const totalLiabilities = liabilities.reduce((s, a) => s - a.balance, 0);
      const totalEquityFromAccounts = equity.reduce((s, a) => s - a.balance, 0);
      const periodNetIncomeForBS = totalRevenue - totalExpenses;
      const finalTotalEquity = totalEquityFromAccounts + periodNetIncomeForBS;

      // Collections
      const collectionsByMethod: Record<string, number> = {};
      feeTransactions.forEach(tx => {
          if (tx.paymentMethod) collectionsByMethod[tx.paymentMethod] = (collectionsByMethod[tx.paymentMethod] || 0) + tx.amount;
          else collectionsByMethod['Other'] = (collectionsByMethod['Other'] || 0) + tx.amount;
      });
      
      setReportData({
        incomeStatement: { revenueAccounts, expenseAccounts, totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses },
        balanceSheet: { assets, liabilities, equity, totalAssets, totalLiabilities, periodNetIncome: periodNetIncomeForBS, finalTotalEquity, totalLiabilitiesAndEquity: totalLiabilities + finalTotalEquity },
        collections: { total: feeTransactions.reduce((s, tx) => s + tx.amount, 0), byMethod: collectionsByMethod },
      });

    } catch (error: any) {
      console.error("Error generating report:", error);
      toast({ variant: "destructive", title: "Report Generation Failed", description: error.message });
    } finally {
      setIsGenerating(false);
    }
  }, [schoolId, user, dateRange, toast, router]);

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center"><FileSpreadsheet className="mr-3 h-6 w-6 text-primary"/>Consolidated Financial Report</CardTitle>
              <CardDescription>Generate a complete financial report package for a specific period.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <DatePickerWithRange date={dateRange} onDateChange={setDateRange} className="w-full sm:w-auto" />
              <Button onClick={generateReport} disabled={isGenerating || !dateRange?.from || !dateRange?.to}>
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CalendarDays className="mr-2 h-4 w-4"/>}
                Generate Report
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isGenerating && <div className="flex justify-center p-12"><Loader2 className="h-12 w-12 animate-spin text-primary"/></div>}
          {!isGenerating && !reportData && <p className="text-center text-muted-foreground py-10">Select a date range and click "Generate Report" to view the consolidated financial statements.</p>}
          {reportData && (
            <div>
              <div className="flex justify-end mb-4">
                <ReactToPrint
                    trigger={() => (
                        <Button><Printer className="mr-2 h-4 w-4"/> Print Report</Button>
                    )}
                    content={() => printRef.current}
                />
              </div>
              <div ref={printRef} className="p-4 border rounded-md bg-white text-black">
                {/* Cover Page */}
                <div className="h-[29.7cm] w-[21cm] mx-auto p-12 flex flex-col justify-center items-center text-center border-b-2">
                    <h1 className="text-4xl font-bold text-primary">{school?.name}</h1>
                    <p className="text-2xl mt-4">Consolidated Financial Report</p>
                    <p className="text-lg text-muted-foreground mt-2">For the period</p>
                    <p className="text-xl font-semibold">{format(dateRange!.from!, 'PP')} to {format(dateRange!.to!, 'PP')}</p>
                    <p className="text-sm text-muted-foreground mt-12">Generated on: {format(new Date(), 'PPpp')}</p>
                </div>

                {/* Income Statement */}
                <div className="h-[29.7cm] w-[21cm] mx-auto p-12 flex flex-col border-b-2">
                    <h2 className="text-2xl font-bold text-center mb-6">Income Statement</h2>
                    <h3 className="text-lg font-semibold mb-2">Revenue</h3>
                    {reportData.incomeStatement.revenueAccounts.map(acc => <div key={acc.accountId} className="flex justify-between"><span>{acc.accountName}</span><span>{acc.totalAmount.toLocaleString()}</span></div>)}
                    <div className="flex justify-between font-bold border-t mt-2 pt-2"><p>Total Revenue</p><p>{reportData.incomeStatement.totalRevenue.toLocaleString()}</p></div>
                    <h3 className="text-lg font-semibold mt-6 mb-2">Expenses</h3>
                    {reportData.incomeStatement.expenseAccounts.map(acc => <div key={acc.id} className="flex justify-between"><span>{acc.accountName}</span><span>({acc.totalAmount.toLocaleString()})</span></div>)}
                    <div className="flex justify-between font-bold border-t mt-2 pt-2"><p>Total Operating Expenses</p><p>({reportData.incomeStatement.totalExpenses.toLocaleString()})</p></div>
                    <Separator className="my-6"/>
                    <div className={`flex justify-between font-bold text-xl ${reportData.incomeStatement.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}><p>Net Income / (Loss)</p><p>{reportData.incomeStatement.netIncome.toLocaleString()}</p></div>
                </div>
                
                 {/* Balance Sheet */}
                 <div className="h-[29.7cm] w-[21cm] mx-auto p-12 flex flex-col border-b-2">
                    <h2 className="text-2xl font-bold text-center mb-6">Balance Sheet as of {format(dateRange!.to!, 'PP')}</h2>
                    <h3 className="text-lg font-semibold mb-2">Assets</h3>
                     {reportData.balanceSheet.assets.map(acc => <div key={acc.id} className="flex justify-between"><span>{acc.accountName}</span><span>{acc.balance.toLocaleString()}</span></div>)}
                    <div className="flex justify-between font-bold border-t mt-2 pt-2"><p>Total Assets</p><p>{reportData.balanceSheet.totalAssets.toLocaleString()}</p></div>
                    <h3 className="text-lg font-semibold mt-6 mb-2">Liabilities</h3>
                     {reportData.balanceSheet.liabilities.map(acc => <div key={acc.id} className="flex justify-between"><span>{acc.accountName}</span><span>{(-acc.balance).toLocaleString()}</span></div>)}
                    <div className="flex justify-between font-bold border-t mt-2 pt-2"><p>Total Liabilities</p><p>{reportData.balanceSheet.totalLiabilities.toLocaleString()}</p></div>
                    <h3 className="text-lg font-semibold mt-6 mb-2">Equity</h3>
                     {reportData.balanceSheet.equity.map(acc => <div key={acc.id} className="flex justify-between"><span>{acc.accountName}</span><span>{(-acc.balance).toLocaleString()}</span></div>)}
                     <div key="net-income" className="flex justify-between"><span>Net Income</span><span>{reportData.balanceSheet.periodNetIncome.toLocaleString()}</span></div>
                    <div className="flex justify-between font-bold border-t mt-2 pt-2"><p>Total Equity</p><p>{reportData.balanceSheet.finalTotalEquity.toLocaleString()}</p></div>
                    <Separator className="my-6"/>
                    <div className="flex justify-between font-bold text-xl"><p>Total Liabilities & Equity</p><p>{reportData.balanceSheet.totalLiabilitiesAndEquity.toLocaleString()}</p></div>
                 </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
