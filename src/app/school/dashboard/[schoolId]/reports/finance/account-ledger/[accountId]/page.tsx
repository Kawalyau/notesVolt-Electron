// src/app/school/dashboard/[schoolId]/reports/finance/account-ledger/[accountId]/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams as useNextSearchParams } from 'next/navigation'; 
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, getChartOfAccountItemById } from '@/services';
import type { School, JournalEntry, JournalEntryLine, ChartOfAccountItem, AppTimestamp } from '@/types/school';
import { Timestamp, collection as firestoreCollection, query as firestoreQuery, where, orderBy, getDocs as getFirestoreDocs, doc } from 'firebase/firestore';
import { firestore } from '@/config/firebase';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Briefcase, AlertTriangle, CalendarDays, ArrowLeft, Download } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = 'force-dynamic';

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


export default function AccountLedgerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useNextSearchParams(); 
  const { user } = useAuth();
  const { toast } = useToast();

  const schoolId = params.schoolId as string;
  const accountId = params.accountId as string;

  const [school, setSchool] = useState<School | null>(null);
  const [account, setAccount] = useState<ChartOfAccountItem | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<Array<JournalEntryLine & { entryDate: AppTimestamp; entryDescription: string; entryId: string; runningBalance: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const initialFromDateStr = searchParams.get('fromDate');
  const initialToDateStr = searchParams.get('toDate');
  const initialAsOfDateStr = searchParams.get('asOfDate');

  let defaultFromDate = startOfYear(new Date());
  let defaultToDate = endOfDayForRange(new Date());

  if(initialFromDateStr) {
    try { defaultFromDate = parseISO(initialFromDateStr); } catch(e) { console.warn("Invalid fromDate in URL")}
  }
  if(initialToDateStr) {
     try { defaultToDate = endOfDayForRange(parseISO(initialToDateStr)); } catch(e) { console.warn("Invalid toDate in URL")}
  } else if (initialAsOfDateStr) {
     try { 
        const asOf = parseISO(initialAsOfDateStr);
        defaultFromDate = startOfYear(asOf); 
        defaultToDate = endOfDayForRange(asOf);
     } catch(e) { console.warn("Invalid asOfDate in URL")}
  }


  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: defaultFromDate, 
    to: defaultToDate,
  });

  const fetchReportData = useCallback(async () => {
    if (!user || !schoolId || !accountId || !dateRange?.from || !dateRange?.to) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [fetchedSchool, fetchedAccount, fetchedJournalEntries] = await Promise.all([
        getSchoolById(schoolId),
        getChartOfAccountItemById(schoolId, accountId),
        getSchoolSubcollectionItems<JournalEntry>(schoolId, 'journalEntries', [
            firestoreQuery(firestoreCollection(firestore, `schools/${schoolId}/journalEntries`), orderBy("date", "asc"), orderBy("createdAt", "asc"))
        ]) 
      ]);

      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" }); router.push(`/school/dashboard/${schoolId}`); return;
      }
      setSchool(fetchedSchool);

      if (!fetchedAccount) {
        toast({ variant: "destructive", title: "Account Not Found" }); 
        setAccount(null); 
        setLedgerEntries([]); 
        setIsLoading(false); return;
      }
      setAccount(fetchedAccount);
      
      const fromDate = dateRange.from;
      const toDate = endOfDayForRange(dateRange.to);

      const relevantEntries: Array<JournalEntryLine & { entryDate: AppTimestamp; entryDescription: string; entryId: string; runningBalance: number }> = [];
      let runningBalance = 0;

      // Calculate opening balance
      fetchedJournalEntries
        .filter(entry => {
          const entryDateVal = typeof entry.date === 'string' ? parseISO(entry.date) : (entry.date as Timestamp).toDate();
          return entryDateVal < fromDate;
        })
        .forEach(entry => {
          entry.lines.forEach(line => {
            if (line.accountId === accountId) {
              runningBalance += (line.debit || 0) - (line.credit || 0);
            }
          });
        });
      
      
      if (runningBalance !== 0 && fromDate > startOfYear(new Date(2000))) { 
        relevantEntries.push({
          entryId: "OPENING_BALANCE",
          entryDate: fromDate.toISOString(), 
          entryDescription: "Opening Balance",
          accountId: accountId,
          accountName: fetchedAccount.accountName,
          debit: (fetchedAccount.accountType === 'Asset' || fetchedAccount.accountType === 'Expense') ? (runningBalance > 0 ? runningBalance : null) : (runningBalance < 0 ? Math.abs(runningBalance) : null) ,
          credit: (fetchedAccount.accountType === 'Asset' || fetchedAccount.accountType === 'Expense') ? (runningBalance < 0 ? Math.abs(runningBalance) : null) : (runningBalance > 0 ? runningBalance : null),
          description: "Balance brought forward",
          runningBalance: runningBalance
        });
      }
      
      fetchedJournalEntries
        .filter(entry => {
          const entryDateVal = typeof entry.date === 'string' ? parseISO(entry.date) : (entry.date as Timestamp).toDate();
          return entryDateVal >= fromDate && entryDateVal <= toDate;
        })
        .forEach(entry => {
          entry.lines.forEach(line => {
            if (line.accountId === accountId) {
              runningBalance += (line.debit || 0) - (line.credit || 0);
              relevantEntries.push({
                ...line,
                entryId: entry.id,
                entryDate: entry.date,
                entryDescription: entry.description,
                runningBalance: runningBalance
              });
            }
          });
        });
      setLedgerEntries(relevantEntries);

    } catch (error: any) {
      console.error("Error loading account ledger data:", error);
      toast({ variant: "destructive", title: "Error", description: `Could not load report data. ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, accountId, user, toast, router, dateRange]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);
  
  const formatDate = (dateInput: AppTimestamp | undefined, includeTime = false) => {
    if (!dateInput) return 'N/A';
    try {
      const date = typeof dateInput === 'string' ? parseISO(dateInput) : (dateInput as Timestamp).toDate();
      return format(date, includeTime ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd");
    } catch (e) {
      return "Invalid Date";
    }
  };

  const getBalanceSuffix = (balance: number, accountType: ChartOfAccountItem['accountType']): string => {
    if (Math.abs(balance) < 0.001) return ''; 
    if (accountType === 'Asset' || accountType === 'Expense') {
      return balance > 0 ? 'DR' : 'CR';
    }
    // For Liability, Equity, Revenue: natural balance is Credit
    return balance > 0 ? 'CR' : 'DR';
  };

  const handleExportToCsv = () => {
    if (!school || !account || !dateRange?.from || !dateRange?.to || ledgerEntries.length === 0) {
      toast({ title: "No data to export", variant: "default" });
      return;
    }
    const schoolName = school.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const accountNameSafe = account.accountName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fromStr = format(dateRange.from, "yyyyMMdd");
    const toStr = format(dateRange.to, "yyyyMMdd");
    const filename = `AccountLedger_${accountNameSafe}_${schoolName}_From_${fromStr}_To_${toStr}.csv`;

    const rows: string[][] = [
      [`Account Ledger for: ${account.accountCode ? `[${account.accountCode}] ` : ''}${account.accountName}`],
      [`School: ${school.name}`],
      [`Period: ${format(dateRange.from, "PP")} - ${format(dateRange.to, "PP")}`],
      [""],
      ["Date", "Journal Entry Description", "Line Description", "Debit (UGX)", "Credit (UGX)", "Balance (UGX)", "Balance Type"]
    ];

    ledgerEntries.forEach(line => {
      rows.push([
        formatDate(line.entryDate),
        line.entryDescription,
        line.description || '',
        line.debit ? line.debit.toFixed(2) : '',
        line.credit ? line.credit.toFixed(2) : '',
        Math.abs(line.runningBalance).toFixed(2),
        getBalanceSuffix(line.runningBalance, account.accountType)
      ]);
    });

    exportToCsv(filename, rows);
    toast({ title: "Exported", description: "Account Ledger exported to CSV." });
  };

  return (
    <div className="space-y-6">
        <Button variant="outline" onClick={() => router.back()} size="sm">
          <ArrowLeft className="mr-2 h-4 w-4"/> Back to Previous Report
        </Button>
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center">
                <Briefcase className="mr-3 h-6 w-6 text-primary"/>Account Ledger: {account?.accountName || 'Loading...'}
              </CardTitle>
              <CardDescription>
                Detailed transactions for account {account?.accountCode && `[${account.accountCode}]`} {account?.accountName} at {school?.name || 'the school'}.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
                 <DatePickerWithRange
                    date={dateRange}
                    onDateChange={setDateRange}
                    className="w-full sm:w-auto"
                />
                <Button onClick={handleExportToCsv} variant="outline" size="sm" disabled={isLoading || ledgerEntries.length === 0}>
                    <Download className="mr-2 h-4 w-4"/> Export CSV
                </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
          ) : !dateRange?.from || !dateRange?.to || !account ? (
             <div className="text-center py-10 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-3"/>
                <p>Please select an account and a date range to view the ledger.</p>
            </div>
          ) : (
            <div className="space-y-4">
               <div className="text-center mb-2">
                 <h3 className="text-xl font-semibold">{school?.name || 'School Name'}</h3>
                 <p className="text-lg">Account Ledger for: {account?.accountCode && `[${account.accountCode}] `}{account?.accountName}</p>
                <p className="text-sm text-muted-foreground">
                  For the period: {dateRange?.from ? format(dateRange.from, "PP") : "N/A"} - {dateRange?.to ? format(dateRange.to, "PP") : "N/A"}
                </p>
              </div>
              {ledgerEntries.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">No transactions found for this account in the selected period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Journal Entry Desc.</TableHead>
                        <TableHead className="text-xs">Line Description</TableHead>
                        <TableHead className="text-right text-xs">Debit (UGX)</TableHead>
                        <TableHead className="text-right text-xs">Credit (UGX)</TableHead>
                        <TableHead className="text-right text-xs">Balance (UGX)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerEntries.map((line, index) => (
                        <TableRow key={`${line.entryId}-${index}-${line.accountId}`}> {}
                           <TableCell className="text-xs">{formatDate(line.entryDate)}</TableCell>
                           <TableCell className="text-xs truncate max-w-[200px]">{line.entryDescription}</TableCell>
                           <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">{line.description}</TableCell>
                           <TableCell className="text-right text-xs font-mono">{line.debit ? line.debit.toFixed(2) : ''}</TableCell>
                           <TableCell className="text-right text-xs font-mono">{line.credit ? line.credit.toFixed(2) : ''}</TableCell>
                           <TableCell className="text-right text-xs font-mono">
                            {Math.abs(line.runningBalance).toFixed(2)} {getBalanceSuffix(line.runningBalance, account.accountType)}
                           </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
