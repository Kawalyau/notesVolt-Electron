
// src/app/school/dashboard/[schoolId]/reports/finance/cash-flow-statement/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services';
import type { School, SchoolIncome, SchoolExpense, FeeTransaction, ChartOfAccountItem, JournalEntry, AppTimestamp } from '@/types/school';
import { Timestamp, query as firestoreQuery, where, orderBy, collection as firestoreCollection, getDocs, collectionGroup } from 'firebase/firestore'; // Ensured alias is used
import { firestore } from '@/config/firebase';
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, DollarSign, AlertTriangle, CalendarDays, Download } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Separator } from '@/components/ui/separator';

interface ReportRow {
  label: string;
  amount: number;
  isSubHeader?: boolean;
  isBold?: boolean;
  isTotal?: boolean;
  isMainTotal?: boolean;
  indent?: number; // 0 for no indent, 1 for first level, 2 for second etc.
}

const endOfDayForRange = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(23, 59, 59, 999);
  return newDate;
};

const escapeCsvValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')
    ? `"${stringValue.replace(/"/g, '""')}"`
    : stringValue;
};

const exportToCsv = (filename: string, rows: Array<Array<string | number>>) => {
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

const ReportRowDisplay: React.FC<ReportRow> = ({ label, amount, isSubHeader, isBold, isTotal, isMainTotal, indent = 0 }) => (
  <div className={`flex justify-between py-1.5 ${isBold ? 'font-semibold' : ''} ${isSubHeader ? 'text-primary font-medium mt-2 text-md' : ''} ${isTotal ? 'border-t pt-2' : ''} ${isMainTotal ? 'text-lg border-t-2 border-primary pt-2 text-primary' : ''}`}
       style={{ paddingLeft: `${indent * 1}rem` }}>
    <span>{label}</span>
    <span>{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
  </div>
);


export default function CashFlowStatementPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Main page loading state
  const [isFetchingData, setIsFetchingData] = useState(false); // Specific to data refresh
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfYear(new Date()),
    to: endOfYear(new Date()),
  });
  
  const [cashInflowsStudents, setCashInflowsStudents] = useState(0);
  const [cashInflowsOther, setCashInflowsOther] = useState(0);
  const [cashOutflowsOperations, setCashOutflowsOperations] = useState(0);
  const [cashAtEndOfPeriod, setCashAtEndOfPeriod] = useState(0);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccountItem[]>([]);
  
  const fetchReportData = useCallback(async () => {
    if (!user || !schoolId || !dateRange?.from || !dateRange?.to) {
      setIsLoading(false); 
      setIsFetchingData(false);
      return;
    }
    setIsFetchingData(true);
    
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" }); router.push(`/school/dashboard/${schoolId}`); return;
      }
      setSchool(fetchedSchool);

      const fromTimestamp = Timestamp.fromDate(dateRange.from);
      const toTimestamp = Timestamp.fromDate(endOfDayForRange(dateRange.to));

      const [studentFeePaymentsResult, otherIncomeData, schoolExpensesData, fetchedChartOfAccountsData, allJournalEntries] = await Promise.all([
        (async () => { 
          const feeTransactionsGroupRef = collectionGroup(firestore, 'feeTransactions');
          const q = firestoreQuery(
            feeTransactionsGroupRef,
            where('schoolId', '==', schoolId),
            where('type', '==', 'credit'),
            where('transactionDate', '>=', fromTimestamp),
            where('transactionDate', '<=', toTimestamp)
          );
          const snapshot = await getDocs(q);
          const allCreditTransactions = snapshot.docs.map(doc => doc.data() as FeeTransaction);
          const payments = allCreditTransactions
            .filter(tx => tx.paymentMethod !== "Bursary/Scholarship") 
            .reduce((sum, tx) => sum + tx.amount, 0);
          return payments;
        })(),
        getSchoolSubcollectionItems<SchoolIncome>(schoolId, 'income', [firestoreQuery(firestoreCollection(firestore, `schools/${schoolId}/income`), where("date", ">=", fromTimestamp), where("date", "<=", toTimestamp))]),
        getSchoolSubcollectionItems<SchoolExpense>(schoolId, 'expenses', [firestoreQuery(firestoreCollection(firestore, `schools/${schoolId}/expenses`), where("date", ">=", fromTimestamp), where("date", "<=", toTimestamp))]),
        getSchoolSubcollectionItems<ChartOfAccountItem>(schoolId, 'chartOfAccounts'),
        getSchoolSubcollectionItems<JournalEntry>(schoolId, 'journalEntries', [firestoreQuery(firestoreCollection(firestore, `schools/${schoolId}/journalEntries`), where("date", "<=", toTimestamp), orderBy("date", "asc"), orderBy("createdAt", "asc"))])
      ]);

      setCashInflowsStudents(studentFeePaymentsResult);
      setCashInflowsOther(otherIncomeData.reduce((sum, item) => sum + item.amount, 0));
      setCashOutflowsOperations(schoolExpensesData.reduce((sum, item) => sum + item.amount, 0));
      setChartOfAccounts(fetchedChartOfAccountsData);

      let endCash = 0;
      const cashAccountIdsToSum: string[] = [];
      if (fetchedSchool.defaultCashAccountId) {
        cashAccountIdsToSum.push(fetchedSchool.defaultCashAccountId);
      } else {
        const foundCashAccounts = fetchedChartOfAccountsData
          .filter(acc => acc.accountType === 'Asset' && (acc.accountName.toLowerCase().includes('cash') || acc.accountName.toLowerCase().includes('bank')))
          .map(acc => acc.id);
        if (foundCashAccounts.length > 0) {
            cashAccountIdsToSum.push(...foundCashAccounts);
        } else {
            console.warn("Cash Flow Statement: No default cash/bank account ID set and no accounts found by name matching 'cash' or 'bank'. Cash balance at end will be 0 if no transactions hit identified cash accounts.");
        }
      }
      
      if (cashAccountIdsToSum.length > 0) {
          allJournalEntries.forEach(entry => { 
            entry.lines.forEach(line => {
              if (cashAccountIdsToSum.includes(line.accountId)) {
                endCash += (line.debit || 0) - (line.credit || 0);
              }
            });
          });
      }
      setCashAtEndOfPeriod(endCash);

    } catch (error: any) {
      console.error("Error loading cash flow data:", error);
      toast({ variant: "destructive", title: "Error", description: `Could not load report data. ${error.message}` });
    } finally {
      setIsFetchingData(false);
      setIsLoading(false); 
    }
  }, [schoolId, user, toast, router, dateRange]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]); 
  
  const totalCashInflowsOps = cashInflowsStudents + cashInflowsOther;
  const netCashFromOps = totalCashInflowsOps - cashOutflowsOperations;
  const netCashFromInvesting = 0; 
  const netCashFromFinancing = 0; 
  const netChangeInCash = netCashFromOps + netCashFromInvesting + netCashFromFinancing;
  const cashAtBeginningOfPeriod = cashAtEndOfPeriod - netChangeInCash;

  const reportRows: ReportRow[] = [
    { label: "Cash Flow from Operating Activities", amount: 0, isSubHeader: true, indent: 0 },
    { label: "Cash received from Student Fees", amount: cashInflowsStudents, indent: 1 },
    { label: "Cash received from Other Income", amount: cashInflowsOther, indent: 1 },
    { label: "Total Cash Inflows from Operations", amount: totalCashInflowsOps, isBold: true, indent: 1 },
    { label: "Cash paid for Operating Expenses", amount: -cashOutflowsOperations, indent: 1 },
    { label: "Net Cash from Operating Activities", amount: netCashFromOps, isBold: true, isTotal: true, indent: 0 },
    
    { label: "Cash Flow from Investing Activities", amount: 0, isSubHeader: true, indent: 0 },
    { label: " (Purchases/Sales of Fixed Assets - Not Tracked)", amount: netCashFromInvesting, indent: 1 },
    { label: "Net Cash from Investing Activities", amount: netCashFromInvesting, isBold: true, isTotal: true, indent: 0 },

    { label: "Cash Flow from Financing Activities", amount: 0, isSubHeader: true, indent: 0 },
    { label: " (Debt, Equity Transactions - Not Tracked)", amount: netCashFromFinancing, indent: 1 },
    { label: "Net Cash from Financing Activities", amount: netCashFromFinancing, isBold: true, isTotal: true, indent: 0 },
    
    { label: "Net Increase / (Decrease) in Cash", amount: netChangeInCash, isMainTotal: true, indent: 0 },
    { label: "Cash at Beginning of Period", amount: cashAtBeginningOfPeriod, indent: 0 },
    { label: "Cash at End of Period", amount: cashAtEndOfPeriod, isMainTotal: true, indent: 0 },
  ];

  const presetDateRanges = [
    { label: "This Month", range: { from: startOfMonth(new Date()), to: endOfMonth(new Date()) } },
    { label: "Last Month", range: { from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) } },
    { label: "This Year", range: { from: startOfYear(new Date()), to: endOfYear(new Date()) } },
  ];

  const handleExportToCsv = () => {
    if (!school || !dateRange?.from || !dateRange?.to ) {
      toast({ title: "No data to export", variant: "default" });
      return;
    }
    const schoolName = school.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fromStr = format(dateRange.from, "yyyyMMdd");
    const toStr = format(dateRange.to, "yyyyMMdd");
    const filename = `CashFlowStatement_${schoolName}_From_${fromStr}_To_${toStr}.csv`;

    const csvRows: Array<Array<string | number>> = [
      [`Cash Flow Statement for ${school.name}`],
      [`Period: ${format(dateRange.from, "PP")} - ${format(dateRange.to, "PP")}`],
      [""],
      ["Description", "Amount (UGX)"]
    ];
    reportRows.forEach(row => {
      if (row.isSubHeader && row.label !== "Cash Flow from Operating Activities") csvRows.push([""]); 
      csvRows.push([`${" ".repeat((row.indent || 0) * 2)}${row.label}`, row.isSubHeader ? "" : row.amount]);
    });

    exportToCsv(filename, csvRows);
    toast({ title: "Exported", description: "Cash Flow Statement exported to CSV." });
  };

  if (isLoading) { 
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center"><DollarSign className="mr-3 h-6 w-6 text-primary"/>Cash Flow Statement</CardTitle>
              <CardDescription>Summary of cash inflows and outflows for {school?.name || 'the school'} for the selected period.</CardDescription>
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
                 <Button onClick={handleExportToCsv} variant="outline" size="sm" disabled={isFetchingData}>
                    <Download className="mr-2 h-4 w-4"/> Export CSV
                </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isFetchingData ? ( 
            <div className="flex justify-center items-center py-10"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
          ) : !dateRange?.from || !dateRange?.to ? (
             <div className="text-center py-10 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-3"/>
                <p>Please select a date range to generate the Cash Flow Statement.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center mb-4">
                 <h3 className="text-xl font-semibold">{school?.name || 'School Name'}</h3>
                 <p className="text-lg">Cash Flow Statement</p>
                <p className="text-sm text-muted-foreground">
                  For the period: {format(dateRange.from, "PP")} - {format(dateRange.to, "PP")}
                </p>
              </div>
              <div className="max-w-2xl mx-auto space-y-1 p-4 border rounded-md bg-muted/20">
                {reportRows.map((row, index) => (
                  <ReportRowDisplay key={index} {...row} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center mt-4">Note: Investing and Financing activities are placeholders as specific tracking for these is not yet implemented. Cash at Beginning of Period is derived.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
