
// src/app/school/dashboard/[schoolId]/reports/finance/general-ledger/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services';
import type { School, JournalEntry, AppTimestamp } from '@/types/school';
import { Timestamp, query as firestoreQuery, where, orderBy, collection as firestoreCollection, getDocs } from 'firebase/firestore';
import { firestore } from '@/config/firebase';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, BookKey, AlertTriangle, CalendarDays, Download } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

const exportToExcel = (filename: string, rows: (string|number)[][]) => {
  const ws = XLSX.utils.aoa_to_sheet(rows as any[][]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "General_Ledger");
  XLSX.writeFile(wb, `${filename}.xlsx`);
};


export default function GeneralLedgerPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);

  const fetchReportData = useCallback(async () => {
    if (!user || !schoolId || !dateRange?.from || !dateRange?.to) {
      if (!dateRange?.from || !dateRange?.to) setJournalEntries([]);
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
      const toTimestamp = Timestamp.fromDate(endOfDay(dateRange.to)); // Ensure end of day for 'to' date

      const qConstraints = [
        where("date", ">=", fromTimestamp),
        where("date", "<=", toTimestamp),
        orderBy("date", "asc"), 
        orderBy("createdAt", "asc") 
      ];
      const entries = await getSchoolSubcollectionItems<JournalEntry>(schoolId, 'journalEntries', qConstraints);
      setJournalEntries(entries);

    } catch (error) {
      console.error("Error loading general ledger data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load report data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router, dateRange]);

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
  
  const presetDateRanges = [
    { label: "This Month", range: { from: startOfMonth(new Date()), to: endOfMonth(new Date()) } },
    { label: "Last Month", range: { from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) } },
    { label: "This Year", range: { from: startOfYear(new Date()), to: endOfYear(new Date()) } },
  ];

  const handleExport = () => {
    if (!school || !dateRange?.from || !dateRange?.to || journalEntries.length === 0) {
      toast({ title: "No data to export" });
      return;
    }
    const schoolName = school.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fromStr = format(dateRange.from, "yyyyMMdd");
    const toStr = format(dateRange.to, "yyyyMMdd");
    const filename = `GeneralLedger_${schoolName}_From_${fromStr}_To_${toStr}`;

    const rows: (string|number)[][] = [
        [`General Ledger for ${school.name}`],
        [`Period: ${format(dateRange.from, "PP")} to ${format(dateRange.to, "PP")}`],
        [],
      ["Date", "Entry Description", "Account Name", "Line Description", "Debit (UGX)", "Credit (UGX)"]
    ];

    journalEntries.forEach(entry => {
      entry.lines.forEach((line, index) => {
        rows.push([
          index === 0 ? formatDate(entry.date) : '',
          index === 0 ? entry.description : '',
          line.accountName || line.accountId,
          line.description || '',
          line.debit || '',
          line.credit || ''
        ]);
      });
       rows.push(["", "", "", "", "", ""]); // Add a separator row
    });

    exportToExcel(filename, rows);
    toast({ title: "Exported", description: "General Ledger exported to Excel." });
  };


  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center"><BookKey className="mr-3 h-6 w-6 text-primary"/>General Ledger</CardTitle>
              <CardDescription>Chronological record of all journal entries for {school?.name || 'the school'}.</CardDescription>
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
                <Button onClick={handleExport} variant="outline" size="sm" disabled={isLoading || journalEntries.length === 0}>
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
                <p>Please select a date range to view the General Ledger.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center mb-2">
                 <h3 className="text-xl font-semibold">{school?.name || 'School Name'}</h3>
                 <p className="text-lg">General Ledger</p>
                <p className="text-sm text-muted-foreground">
                  For the period: {dateRange?.from ? format(dateRange.from, "PP") : "N/A"} - {dateRange?.to ? format(dateRange.to, "PP") : "N/A"}
                </p>
              </div>
              {journalEntries.length === 0 && (
                <p className="text-muted-foreground text-center py-6">No journal entries found for the selected period.</p>
              )}
              {journalEntries.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Entry Description</TableHead>
                      <TableHead className="text-xs">Account</TableHead>
                      <TableHead className="text-xs">Line Description</TableHead>
                      <TableHead className="text-right text-xs">Debit (UGX)</TableHead>
                      <TableHead className="text-right text-xs">Credit (UGX)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journalEntries.flatMap(entry => 
                      entry.lines.map((line, index) => (
                        <TableRow key={`${entry.id}-${index}`} className={index === 0 ? "border-t-2 border-primary/20" : ""}>
                           <TableCell className="text-xs py-1.5">{index === 0 ? formatDate(entry.date) : ''}</TableCell>
                           <TableCell className="text-xs py-1.5">{index === 0 ? entry.description : ''}</TableCell>
                           <TableCell className="text-xs py-1.5 pl-4">{line.accountName || line.accountId}</TableCell>
                           <TableCell className="text-xs py-1.5 text-muted-foreground truncate max-w-[150px]">{line.description}</TableCell>
                           <TableCell className="text-right text-xs py-1.5">{line.debit ? line.debit.toFixed(2) : '-'}</TableCell>
                           <TableCell className="text-right text-xs py-1.5">{line.credit ? line.credit.toFixed(2) : '-'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

    
