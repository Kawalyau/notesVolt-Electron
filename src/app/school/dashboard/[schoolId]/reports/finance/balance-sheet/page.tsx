
// src/app/school/dashboard/[schoolId]/reports/finance/balance-sheet/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services';
import type { School, JournalEntry, ChartOfAccountItem, AppTimestamp } from '@/types/school';
import { Timestamp, collection as firestoreCollection, query as firestoreQuery, where, orderBy, getDocs, doc } from 'firebase/firestore';
import { firestore } from '@/config/firebase';
import { format, startOfToday, endOfDay, parseISO, startOfYear } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Scale, AlertTriangle, CalendarDays, Download } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker'; 

interface AccountBalance {
  accountId: string;
  accountName: string;
  accountCode?: string | null;
  accountType: ChartOfAccountItem['accountType'];
  balance: number; // Positive for DR balance, negative for CR balance (DR - CR)
}

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

const exportToCsv = (filename: string, rows: string[][]) => {
  const csvContent = rows.map(row => row.map(escapeCsvValue).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

interface AccountRowProps {
  label: string;
  amount: number | string;
  isBold?: boolean;
  isSubHeader?: boolean;
  isSubItem?: boolean;
  isTotal?: boolean;
  isMainTotal?: boolean;
}

const AccountRow: React.FC<AccountRowProps> = ({ label, amount, isBold = false, isSubHeader = false, isSubItem = false, isTotal = false, isMainTotal = false }) => (
  <div className={`flex justify-between py-1.5 ${isBold ? 'font-semibold' : ''} ${isSubHeader ? 'text-primary font-medium mt-2 text-md' : ''} ${isSubItem ? 'pl-4' : ''} ${isTotal ? 'border-t pt-2' : ''} ${isMainTotal ? 'text-lg border-t-2 border-primary pt-2 text-primary' : ''}`}>
    <span>{label}</span>
    <span>{typeof amount === 'number' ? amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : amount}</span>
  </div>
);


export default function BalanceSheetPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState<Date | undefined>(endOfDay(new Date())); 
  const [journalEntries, setJournalEntries] = useState<JournalEntry[] | null>(null);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccountItem[] | null>(null);

  const fetchReportData = useCallback(async () => {
    if (!user || !schoolId || !asOfDate) {
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

        const [fetchedCoA, fetchedJournalEntries] = await Promise.all([
            getSchoolSubcollectionItems<ChartOfAccountItem>(schoolId, 'chartOfAccounts'),
            getSchoolSubcollectionItems<JournalEntry>(schoolId, 'journalEntries', [
                where("date", "<=", Timestamp.fromDate(endOfDay(asOfDate))) 
            ])
        ]);
        
        setChartOfAccounts(fetchedCoA);
        setJournalEntries(fetchedJournalEntries);

    } catch (error: any) {
        console.error("Error loading balance sheet data:", error);
        toast({ variant: "destructive", title: "Error", description: `Could not load report data. ${error.message}` });
    } finally {
        setIsLoading(false);
    }
  }, [schoolId, user, toast, router, asOfDate]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);
  
  const { assets, liabilities, equity, totalAssets, totalLiabilities, periodNetIncome, finalTotalEquity, totalLiabilitiesAndEquity } = useMemo(() => {
    if (!journalEntries || !chartOfAccounts || !asOfDate) {
        return { assets: [], liabilities: [], equity: [], totalAssets: 0, totalLiabilities: 0, periodNetIncome: 0, finalTotalEquity: 0, totalLiabilitiesAndEquity: 0 };
    }
    
    // All calculations are now safe because they only run when data is available.
    const balances: Record<string, number> = {};
    chartOfAccounts.forEach(acc => balances[acc.id] = 0);
    journalEntries.forEach(entry => entry.lines.forEach(line => {
      if (balances[line.accountId] !== undefined) balances[line.accountId] += (line.debit || 0) - (line.credit || 0);
    }));

    const periodStartDate = startOfYear(asOfDate);
    const revenueData: Record<string, number> = {};
    const expenseData: Record<string, number> = {};
    journalEntries.filter(e => {
        const entryDate = (e.date as Timestamp).toDate();
        return entryDate >= periodStartDate && entryDate <= asOfDate;
    }).forEach(entry => {
        entry.lines.forEach(line => {
            const account = chartOfAccounts.find(acc => acc.id === line.accountId);
            if (account) {
                if (account.accountType === 'Revenue') revenueData[account.id] = (revenueData[account.id] || 0) + (line.credit || 0) - (line.debit || 0);
                if (account.accountType === 'Expense') expenseData[account.id] = (expenseData[account.id] || 0) + (line.debit || 0) - (line.credit || 0);
            }
        });
    });
    const currentTotalRevenue = Object.values(revenueData).reduce((s, i) => s + i, 0);
    const currentTotalExpenses = Object.values(expenseData).reduce((s, i) => s + i, 0);
    const calcPeriodNetIncome = currentTotalRevenue - currentTotalExpenses;

    const filteredAssets = chartOfAccounts.filter(a => a.accountType === 'Asset').map(acc => ({ ...acc, balance: balances[acc.id] || 0 }));
    const filteredLiabilities = chartOfAccounts.filter(a => a.accountType === 'Liability').map(acc => ({ ...acc, balance: balances[acc.id] || 0 }));
    const filteredEquity = chartOfAccounts.filter(a => a.accountType === 'Equity').map(acc => ({ ...acc, balance: balances[acc.id] || 0 }));
    const calcTotalAssets = filteredAssets.reduce((sum, acc) => sum + acc.balance, 0);
    const calcTotalLiabilities = filteredLiabilities.reduce((sum, acc) => sum - acc.balance, 0);
    const totalEquityFromAccounts = filteredEquity.reduce((sum, acc) => sum - acc.balance, 0);
    const calcFinalTotalEquity = totalEquityFromAccounts + calcPeriodNetIncome;

    return {
      assets: filteredAssets,
      liabilities: filteredLiabilities,
      equity: filteredEquity,
      totalAssets: calcTotalAssets,
      totalLiabilities: calcTotalLiabilities,
      periodNetIncome: calcPeriodNetIncome,
      finalTotalEquity: calcFinalTotalEquity,
      totalLiabilitiesAndEquity: calcTotalLiabilities + calcFinalTotalEquity,
    };
  }, [journalEntries, chartOfAccounts, asOfDate]);

  const handleExportToCsv = () => {
    if (!school || !asOfDate || !chartOfAccounts || !journalEntries) {
      toast({ title: "No data to export", variant: "default" }); return;
    }
    const schoolName = school.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateStr = format(asOfDate, "yyyyMMdd");
    const filename = `BalanceSheet_${schoolName}_AsOf_${dateStr}.csv`;

    const rows: string[][] = [
      [`Balance Sheet for ${school.name}`], [`As of: ${format(asOfDate, "PP")}`], [""],
      ["Category", "Account Code", "Account Name", "Balance (UGX)"],
      ["ASSETS", "", "", ""],
      ...assets.filter(acc => Math.abs(acc.balance) > 0.001).map(acc => ["", acc.accountCode || 'N/A', acc.accountName, acc.balance.toFixed(2)]),
      ["Total Assets", "", "", totalAssets.toFixed(2)], [""],
      ["LIABILITIES", "", "", ""],
      ...liabilities.filter(acc => Math.abs(acc.balance) > 0.001).map(acc => ["", acc.accountCode || 'N/A', acc.accountName, (-acc.balance).toFixed(2)]),
      ["Total Liabilities", "", "", totalLiabilities.toFixed(2)], [""],
      ["EQUITY", "", "", ""],
      ...equity.filter(acc => Math.abs(acc.balance) > 0.001).map(acc => ["", acc.accountCode || 'N/A', acc.accountName, (-acc.balance).toFixed(2)]),
      ["Net Income / (Loss) (Current Period)", "", "", periodNetIncome.toFixed(2)],
      ["Total Equity", "", "", finalTotalEquity.toFixed(2)], [""],
      ["TOTAL LIABILITIES & EQUITY", "", "", totalLiabilitiesAndEquity.toFixed(2)],
    ];
    exportToCsv(filename, rows);
    toast({ title: "Exported", description: "Balance Sheet exported to CSV." });
  };


  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center"><Scale className="mr-3 h-6 w-6 text-primary"/>Balance Sheet</CardTitle>
              <CardDescription>Financial position of {school?.name || 'the school'} as of a specific date, derived from Journal Entries.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
                 <DatePicker
                    date={asOfDate}
                    onDateChange={(date) => setAsOfDate(date ? endOfDay(date) : undefined)} 
                    buttonClassName="w-full sm:w-auto h-9 text-xs"
                    buttonLabel="Select As of Date"
                />
                <Button onClick={handleExportToCsv} variant="outline" size="sm" disabled={isLoading || !journalEntries || !chartOfAccounts}>
                    <Download className="mr-2 h-4 w-4"/> Export CSV
                </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
          ) : !asOfDate || !journalEntries || !chartOfAccounts ? (
             <div className="text-center py-10 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-3"/>
                <p>Please select an "As of Date" to generate the Balance Sheet.</p>
            </div>
          ) : (
            <div className="space-y-6">
                <div className="text-center mb-4">
                    <h3 className="text-xl font-semibold">{school?.name || 'School Name'}</h3>
                    <p className="text-lg">Balance Sheet</p>
                    <p className="text-sm text-muted-foreground">As of {format(asOfDate, "MMMM dd, yyyy")}</p>
                </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div className="space-y-1 p-4 border rounded-md bg-muted/20">
                  <AccountRow label="Assets" amount="" isBold isSubHeader />
                  {assets.length === 0 && <p className="text-xs text-muted-foreground pl-4">No asset accounts with balances.</p>}
                  {assets.filter(a => Math.abs(a.balance) > 0.001).map(acc => (
                    <AccountRow
                      key={acc.accountId}
                      label={`${acc.accountCode ? `[${acc.accountCode}] ` : ''}${acc.accountName}`}
                      amount={acc.balance}
                      isSubItem
                    />
                  ))}
                  <AccountRow label="TOTAL ASSETS" amount={totalAssets} isBold isTotal isMainTotal />
                </div>

                <div className="space-y-1 p-4 border rounded-md bg-muted/20">
                  <AccountRow label="Liabilities" amount="" isBold isSubHeader />
                  {liabilities.length === 0 && <p className="text-xs text-muted-foreground pl-4">No liability accounts with balances.</p>}
                  {liabilities.filter(l => Math.abs(l.balance) > 0.001).map(acc => (
                    <AccountRow
                      key={acc.accountId}
                      label={`${acc.accountCode ? `[${acc.accountCode}] ` : ''}${acc.accountName}`}
                      amount={-acc.balance} // Display as positive
                      isSubItem
                    />
                  ))}
                  <AccountRow label="TOTAL LIABILITIES" amount={totalLiabilities} isBold isTotal />
                  
                  <AccountRow label="Equity" amount="" isBold isSubHeader />
                  {equity.length === 0 && Math.abs(periodNetIncome) < 0.001 && <p className="text-xs text-muted-foreground pl-4">No equity accounts or net income/loss for the period.</p>}
                  {equity.filter(e => Math.abs(e.balance) > 0.001).map(acc => (
                    <AccountRow
                      key={acc.accountId}
                      label={`${acc.accountCode ? `[${acc.accountCode}] ` : ''}${acc.accountName}`}
                      amount={-acc.balance} // Display as positive
                      isSubItem
                    />
                  ))}
                  {(Math.abs(periodNetIncome) > 0.001) && (
                    <AccountRow
                      key="net-income"
                      label={periodNetIncome >= 0 ? "Net Income (Current Period)" : "Net Loss (Current Period)"}
                      amount={periodNetIncome}
                      isSubItem
                      isBold 
                    />
                  )}
                  <AccountRow label="TOTAL EQUITY" amount={finalTotalEquity} isBold isTotal />
                  
                  <hr className="my-2 border-primary/50"/>
                  <AccountRow label="TOTAL LIABILITIES & EQUITY" amount={totalLiabilitiesAndEquity} isBold isTotal isMainTotal />
                </div>
              </div>
               {Math.abs(totalAssets - totalLiabilitiesAndEquity) > 0.01 && ( 
                <div className="p-3 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 rounded-md text-sm mt-4">
                    <AlertTriangle className="inline h-4 w-4 mr-1" /> 
                    <strong>Balance Check:</strong> Total Assets (UGX {totalAssets.toFixed(2)}) and Total Liabilities & Equity (UGX {totalLiabilitiesAndEquity.toFixed(2)}) do not balance. Difference: UGX {(totalAssets - totalLiabilitiesAndEquity).toFixed(2)}. This indicates a potential issue in the journal entries or chart of accounts setup.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

