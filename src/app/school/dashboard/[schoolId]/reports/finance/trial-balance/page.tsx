// src/app/school/dashboard/[schoolId]/reports/finance/trial-balance/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services';
import type { School, JournalEntry, ChartOfAccountItem, AppTimestamp } from '@/types/school';
import { Timestamp, collection as firestoreCollection, query as firestoreQuery, where, orderBy, getDocs as getFirestoreDocs, doc, getDoc } from 'firebase/firestore';
import { firestore } from '@/config/firebase';
import { format, parseISO, endOfDay, startOfYear } from 'date-fns';
import * as XLSX from 'xlsx';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Scale, CalendarDays, Download } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Separator } from '@/components/ui/separator';

interface AccountBalanceForTrial {
  accountId: string;
  accountCode?: string | null;
  accountName: string;
  debitBalance: number;
  creditBalance: number;
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

const exportToExcel = (filename: string, rows: (string | number)[][]) => {
  const ws = XLSX.utils.aoa_to_sheet(rows as any[][]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Trial_Balance");
  XLSX.writeFile(wb, `${filename}.xlsx`);
};


export default function TrialBalancePage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState<Date | undefined>(endOfDay(new Date())); 

  const [trialBalanceData, setTrialBalanceData] = useState<AccountBalanceForTrial[]>([]);
  const [totalDebits, setTotalDebits] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccountItem[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);


  const fetchReportData = useCallback(async () => {
    if (!user || !schoolId || !asOfDate) {
      if (!asOfDate) {
        setTrialBalanceData([]); setTotalDebits(0); setTotalCredits(0);
      }
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

      const [fetchedCoA, fetchedJournalEntries] = await Promise.all([
        getSchoolSubcollectionItems<ChartOfAccountItem>(schoolId, 'chartOfAccounts'),
        getSchoolSubcollectionItems<JournalEntry>(schoolId, 'journalEntries', [
          firestoreQuery(firestoreCollection(firestore, `schools/${schoolId}/journalEntries`), where("date", "<=", Timestamp.fromDate(endOfDay(asOfDate)))) 
        ])
      ]);
      setChartOfAccounts(fetchedCoA);
      setJournalEntries(fetchedJournalEntries);
      
      const balances: Record<string, { debit: number, credit: number }> = {};

      fetchedCoA.forEach(acc => {
        balances[acc.id] = { debit: 0, credit: 0 };
      });
      
      fetchedJournalEntries.forEach(entry => {
        entry.lines.forEach(line => {
          if (balances[line.accountId]) {
            balances[line.accountId].debit += line.debit || 0;
            balances[line.accountId].credit += line.credit || 0;
          }
        });
      });

      let currentTotalDebits = 0;
      let currentTotalCredits = 0;

      const tbData = fetchedCoA.map(acc => {
        const accBalance = balances[acc.id] || { debit: 0, credit: 0 };
        const netBalance = accBalance.debit - accBalance.credit;
        let debitBalance = 0;
        let creditBalance = 0;

        
        if (acc.accountType === 'Asset' || acc.accountType === 'Expense') {
          if (netBalance > 0.001) debitBalance = netBalance;
          else if (netBalance < -0.001) creditBalance = Math.abs(netBalance);
        } else if (acc.accountType === 'Liability' || acc.accountType === 'Equity' || acc.accountType === 'Revenue') {
          if (netBalance < -0.001) creditBalance = Math.abs(netBalance);
          else if (netBalance > 0.001) debitBalance = netBalance; 
        }
        currentTotalDebits += debitBalance;
        currentTotalCredits += creditBalance;
        return { accountId: acc.id, accountCode: acc.accountCode, accountName: acc.accountName, debitBalance, creditBalance };
      }).sort((a,b) => (a.accountCode || a.accountName).localeCompare(b.accountCode || b.accountName));
      
      setTrialBalanceData(tbData);
      setTotalDebits(currentTotalDebits);
      setTotalCredits(currentTotalCredits);

    } catch (error: any) {
      console.error("Error loading trial balance data:", error);
      toast({ variant: "destructive", title: "Error", description: `Could not load report data. ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router, asOfDate]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const handleExport = () => {
    if (!school || !asOfDate || trialBalanceData.length === 0) {
      toast({ title: "No data to export" });
      return;
    }
    const schoolName = school.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateStr = format(asOfDate, "yyyyMMdd");
    const filename = `TrialBalance_${schoolName}_AsOf_${dateStr}`;

    const rows: (string|number)[][] = [
      [`Trial Balance for ${school.name}`],
      [`As of: ${format(asOfDate, "PP")}`],
      [], // Spacer
      ["Account Code", "Account Name", "Debit (UGX)", "Credit (UGX)"]
    ];

    trialBalanceData
      .filter(acc => acc.debitBalance > 0.001 || acc.creditBalance > 0.001)
      .forEach(acc => {
        rows.push([
          acc.accountCode || 'N/A',
          acc.accountName,
          acc.debitBalance > 0.001 ? acc.debitBalance : '',
          acc.creditBalance > 0.001 ? acc.creditBalance : ''
        ]);
      });
    
    rows.push(["", "TOTALS", totalDebits, totalCredits]);
    exportToExcel(filename, rows);
    toast({ title: "Export Successful", description: "Trial Balance exported to Excel." });
  };


  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center"><Scale className="mr-3 h-6 w-6 text-primary"/>Trial Balance</CardTitle>
              <CardDescription>List of all accounts and their balances as of a specific date for {school?.name || 'the school'}. Total debits should equal total credits.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
                 <DatePicker
                    date={asOfDate}
                    onDateChange={(date) => setAsOfDate(date ? endOfDay(date) : undefined)} 
                    buttonClassName="w-full sm:w-auto h-9 text-xs"
                    buttonLabel="Select As of Date"
                />
                <Button onClick={handleExport} variant="outline" size="sm" disabled={isLoading || trialBalanceData.length === 0}>
                    <Download className="mr-2 h-4 w-4"/> Export Excel
                </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
          ) : !asOfDate ? (
             <div className="text-center py-10 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-3"/>
                <p>Please select an "As of Date" to generate the Trial Balance.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center mb-2">
                 <h3 className="text-xl font-semibold">{school?.name || 'School Name'}</h3>
                 <p className="text-lg">Trial Balance</p>
                <p className="text-sm text-muted-foreground">As of {format(asOfDate, "MMMM dd, yyyy")}</p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account Code</TableHead>
                      <TableHead>Account Name</TableHead>
                      <TableHead className="text-right">Debit (UGX)</TableHead>
                      <TableHead className="text-right">Credit (UGX)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trialBalanceData.filter(acc => acc.debitBalance > 0.001 || acc.creditBalance > 0.001).map(acc => (
                      <TableRow key={acc.accountId}>
                        <TableCell className="text-xs">{acc.accountCode || 'N/A'}</TableCell>
                        <TableCell className="font-medium text-sm">
                           <Link href={`/school/dashboard/${schoolId}/reports/finance/account-ledger/${acc.accountId}?asOfDate=${asOfDate!.toISOString()}`} 
                                 className="hover:underline text-primary">
                            {acc.accountName}
                           </Link>
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono">{acc.debitBalance > 0.001 ? acc.debitBalance.toFixed(2) : ''}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{acc.creditBalance > 0.001 ? acc.creditBalance.toFixed(2) : ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={2} className="text-right text-md">TOTALS</TableCell>
                      <TableCell className="text-right text-md font-mono">{totalDebits.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-md font-mono">{totalCredits.toFixed(2)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
              {Math.abs(totalDebits - totalCredits) > 0.01 && (
                 <p className="text-center text-destructive font-semibold text-sm mt-4">
                    WARNING: Trial Balance is not balanced! Total Debits (UGX {totalDebits.toFixed(2)}) do not equal Total Credits (UGX {totalCredits.toFixed(2)}). Difference: UGX {(totalDebits - totalCredits).toFixed(2)}
                 </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
