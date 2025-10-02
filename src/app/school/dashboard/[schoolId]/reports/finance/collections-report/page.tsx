// src/app/school/dashboard/[schoolId]/reports/finance/collections-report/page.tsx
"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Timestamp, query as firestoreQuery, where, orderBy, collectionGroup, getDocs } from 'firebase/firestore';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import Image from 'next/image';
import { Loader2, DollarSign, CalendarDays, Printer, Download } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';

import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services';
import type { School, Student, SchoolClass, FeeTransaction, AppTimestamp } from '@/types/school';
import { firestore } from '@/config/firebase';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableFooter } from '@/components/ui/table';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';

interface EnrichedTransaction extends FeeTransaction {
  studentName?: string;
  studentRegNo?: string;
  studentClassName?: string;
}

const escapeCsvValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')
      ? `"${stringValue.replace(/"/g, '""')}"`
      : stringValue;
  };
  
const exportToExcel = (filename: string, rows: (string|number)[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows as any[][]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Collections_Report");
    XLSX.writeFile(wb, `${filename}.xlsx`);
};

export default function CollectionsReportPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const { user } = useAuth();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [school, setSchool] = useState<School | null>(null);
  const [transactions, setTransactions] = useState<EnrichedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date()),
  });

  const fetchReportData = useCallback(async () => {
    if (!user || !schoolId || !dateRange?.from || !dateRange?.to) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [fetchedSchool, studentsData, classesData] = await Promise.all([
        getSchoolById(schoolId),
        getSchoolSubcollectionItems<Student>(schoolId, 'students'),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
      ]);
      setSchool(fetchedSchool);

      const studentMap = new Map(studentsData.map(s => [s.id, s]));
      const classMap = new Map(classesData.map(c => [c.id, c.class]));
      
      const fromTimestamp = Timestamp.fromDate(dateRange.from);
      const toTimestamp = Timestamp.fromDate(endOfDay(dateRange.to));

      const transactionsQuery = firestoreQuery(
        collectionGroup(firestore, 'feeTransactions'),
        where('schoolId', '==', schoolId),
        where('type', '==', 'credit'),
        where('transactionDate', '>=', fromTimestamp),
        where('transactionDate', '<=', toTimestamp),
        orderBy('transactionDate', 'desc')
      );

      const snapshot = await getDocs(transactionsQuery);
      const fetchedTransactions: EnrichedTransaction[] = snapshot.docs.map(doc => {
        const tx = doc.data() as FeeTransaction;
        const student = studentMap.get(tx.studentId);
        return {
          ...tx,
          id: doc.id,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown Student',
          studentRegNo: student?.studentRegistrationNumber || 'N/A',
          studentClassName: student ? classMap.get(student.classId) || 'N/A' : 'N/A',
        };
      }).filter(tx => tx.paymentMethod !== "Bursary/Scholarship"); // Exclude non-cash bursaries

      setTransactions(fetchedTransactions);

    } catch (error: any) {
      console.error("Error loading collections report data:", error);
      toast({ variant: "destructive", title: "Error", description: `Could not load report data. ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, dateRange, user, toast]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const totalCollected = useMemo(() => 
    transactions.reduce((sum, tx) => sum + tx.amount, 0),
    [transactions]
  );
  
  const handleExport = () => {
    if (!school || transactions.length === 0) {
      toast({ title: "No data to export" });
      return;
    }
    const filename = `Collections_Report_${school.name.replace(/\s/g, '_')}_${format(new Date(), 'yyyyMMdd')}`;
    const rows: (string|number)[][] = [
        [`Collections Report for ${school?.name}`],
        [`Period: ${format(dateRange!.from!, "PP")} to ${format(dateRange!.to!, "PP")}`],
        [],
        ["Date", "Student Name", "Reg No.", "Class", "Description", "Method", "Reference", "Amount (UGX)"]
    ];
    transactions.forEach(tx => {
        const date = tx.transactionDate;
        const formattedDate = date ? format(date instanceof Timestamp ? date.toDate() : parseISO(date as string), 'yyyy-MM-dd HH:mm') : 'N/A';
        rows.push([
            formattedDate, tx.studentName || '', tx.studentRegNo || '', tx.studentClassName || '',
            tx.description, tx.paymentMethod || '', tx.reference || '', tx.amount
        ]);
    });
    rows.push([]);
    rows.push(["", "", "", "", "", "","Total Collected", totalCollected]);
    
    exportToExcel(filename, rows);
    toast({ title: "Export Successful" });
  };
  
  const handlePrint = () => {
    const printContent = printRef.current;
    if (printContent && school) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`<html><head><title>Collections Report</title><style>
          @media print {
            body { font-family: Arial, sans-serif; margin: 20px; }
            .print-header { text-align: center; margin-bottom: 20px; }
            h1, h2, p { margin: 0; padding: 0; }
            h1 { font-size: 1.5rem; } h2 { font-size: 1.2rem; font-weight: normal; } p { font-size: 0.9rem; color: #555; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 9pt; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background-color: #f2f2f2 !important; }
            tfoot { font-weight: bold; }
            .no-print { display: none !important; }
          }
        </style></head><body>`);
        printWindow.document.write(printContent.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
      }
    }
  };

  const presetDateRanges = [
    { label: "Today", range: { from: startOfDay(new Date()), to: endOfDay(new Date()) } },
    { label: "This Week", range: { from: startOfWeek(new Date()), to: endOfWeek(new Date()) } },
    { label: "This Month", range: { from: startOfMonth(new Date()), to: endOfMonth(new Date()) } },
    { label: "This Year", range: { from: startOfYear(new Date()), to: endOfYear(new Date()) } },
  ];

  return (
    <>
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center"><DollarSign className="mr-3 h-6 w-6 text-primary"/>Collections Report</CardTitle>
              <CardDescription>View all student fee payments (excluding bursaries) received within a selected period.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
                <div className="flex gap-1 sm:gap-2 flex-wrap">
                    {presetDateRanges.map(preset => (
                        <Button key={preset.label} variant="outline" size="xs" onClick={() => setDateRange(preset.range)}
                                className={dateRange?.from?.getTime() === preset.range.from.getTime() && dateRange?.to?.getTime() === preset.range.to.getTime() ? "bg-primary/10 text-primary border-primary" : ""}>
                            {preset.label}
                        </Button>
                    ))}
                </div>
                <DatePickerWithRange date={dateRange} onDateChange={setDateRange} className="w-full sm:w-auto" />
                <Button onClick={handleExport} variant="outline" size="sm" disabled={isLoading || transactions.length === 0}><Download className="mr-2 h-4 w-4"/>Export</Button>
                <Button onClick={handlePrint} variant="outline" size="sm" disabled={isLoading || transactions.length === 0}><Printer className="mr-2 h-4 w-4"/>Print</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
          ) : !dateRange?.from || !dateRange?.to ? (
             <div className="text-center py-10 text-muted-foreground"><CalendarDays className="h-12 w-12 mx-auto mb-3"/><p>Please select a date range to view the collections report.</p></div>
          ) : (
            <div ref={printRef}>
              <div className="print-header text-center mb-4">
                  {school?.badgeImageUrl && <Image src={school.badgeImageUrl} alt={`${school.name} Logo`} width={80} height={80} className="mx-auto" />}
                  <h1 className="text-xl font-bold">{school?.name}</h1>
                  <h2 className="text-lg">Collections Report</h2>
                  {dateRange?.from && dateRange?.to && (
                      <p className="text-sm">Period: {format(dateRange.from, 'PP')} to {format(dateRange.to, 'PP')}</p>
                  )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead><TableHead>Student Name</TableHead><TableHead>Reg. No.</TableHead>
                    <TableHead>Class</TableHead><TableHead>Description</TableHead><TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount (UGX)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length > 0 ? transactions.map(tx => (
                    <TableRow key={tx.id}>
                       <TableCell className="text-xs">{tx.transactionDate ? format(tx.transactionDate instanceof Timestamp ? tx.transactionDate.toDate() : parseISO(tx.transactionDate as string), 'PPp') : 'N/A'}</TableCell>
                       <TableCell className="text-xs font-medium">{tx.studentName}</TableCell>
                       <TableCell className="text-xs">{tx.studentRegNo}</TableCell>
                       <TableCell className="text-xs">{tx.studentClassName}</TableCell>
                       <TableCell className="text-xs">{tx.description}</TableCell>
                       <TableCell className="text-xs">{tx.paymentMethod}</TableCell>
                       <TableCell className="text-right font-semibold text-xs">{tx.amount.toLocaleString()}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={7} className="text-center text-gray-500 py-6">No cash payments found for this period.</TableCell></TableRow>
                  )}
                </TableBody>
                <TableFooter>
                    <TableRow className="font-bold text-md bg-muted/50">
                        <TableCell colSpan={6} className="text-right">Total Collected for Period</TableCell>
                        <TableCell className="text-right">{totalCollected.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                    </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
