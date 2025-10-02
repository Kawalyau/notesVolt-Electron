
// src/app/school/dashboard/[schoolId]/reports/finance/fee-statements/page.tsx
"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, getFeeTransactions } from '@/services/schoolService';
import type { School, Student, SchoolClass, FeeTransaction, AppTimestamp } from '@/types/school';
import { Timestamp } from 'firebase/firestore';
import { format, parseISO, isValid, startOfYear, endOfYear } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileSpreadsheet, Filter, Printer, CalendarDays } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import Image from 'next/image';
import { PrintButton } from '@/components/ui/print-button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";


interface StudentStatementData {
  student: Student;
  openingBalance: number;
  transactions: Array<FeeTransaction & { runningBalance: number }>;
  closingBalance: number;
}

const ALL_CLASSES_SENTINEL = "_ALL_CLASSES_";

const endOfDay = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(23, 59, 59, 999);
  return newDate;
};

const formatDateSafe = (dateInput: AppTimestamp | undefined) => {
    if (!dateInput) return 'N/A';
    try {
      const date = dateInput instanceof Timestamp ? dateInput.toDate() : typeof dateInput === 'string' ? parseISO(dateInput) : new Date(dateInput);
      return isValid(date) ? format(date, "PP") : 'Invalid Date';
    } catch (error) {
      return 'Invalid Date';
    }
};

export default function StudentFeeStatementsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const printAreaRef = useRef<HTMLDivElement>(null);
  const schoolId = params.schoolId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [school, setSchool] = useState<School | null>(null);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfYear(new Date()),
    to: endOfYear(new Date()),
  });

  const [statements, setStatements] = useState<StudentStatementData[]>([]);

  const fetchInitialData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const [schoolData, classesData] = await Promise.all([
        getSchoolById(schoolId),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
      ]);
      setSchool(schoolData);
      setSchoolClasses(classesData.sort((a,b) => (a.class || "").localeCompare(b.class || "")));
    } catch (error) {
      console.error("Error fetching initial data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load required school data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast]);

  useEffect(() => { fetchInitialData(); }, [fetchInitialData]);

  const generateStatements = useCallback(async () => {
    if (!schoolId || !selectedClassId || !dateRange?.from || !dateRange?.to) {
      toast({ variant: "destructive", title: "Missing Information", description: "Please select a class and a date range." });
      return;
    }
    setIsGenerating(true);
    setStatements([]);
    try {
      const allStudentsData = await getSchoolSubcollectionItems<Student>(schoolId, 'students');
      
      const studentsToProcess = selectedClassId === ALL_CLASSES_SENTINEL
        ? allStudentsData
        : allStudentsData.filter(s => s.classId === selectedClassId);

      const statementsData: StudentStatementData[] = await Promise.all(
        studentsToProcess.map(async (student) => {
          const allTransactions = await getFeeTransactions(schoolId, student.id);
          const sortedTransactions = allTransactions.sort((a, b) => {
              const aDate = a.transactionDate instanceof Timestamp ? a.transactionDate.toMillis() : new Date(a.transactionDate as string).getTime();
              const bDate = b.transactionDate instanceof Timestamp ? b.transactionDate.toMillis() : new Date(b.transactionDate as string).getTime();
              return aDate - bDate;
          });

          let openingBalance = 0;
          sortedTransactions.forEach(tx => {
            const txDate = tx.transactionDate instanceof Timestamp ? tx.transactionDate.toDate() : parseISO(tx.transactionDate as string);
            if (isValid(txDate) && txDate < dateRange.from!) {
              openingBalance += tx.type === 'debit' ? tx.amount : -tx.amount;
            }
          });

          const periodTransactions = sortedTransactions.filter(tx => {
            const txDate = tx.transactionDate instanceof Timestamp ? tx.transactionDate.toDate() : parseISO(tx.transactionDate as string);
            return isValid(txDate) && txDate >= dateRange.from! && txDate <= endOfDay(dateRange.to!);
          });
          
          let runningBalance = openingBalance;
          const ledgerWithRunningBalance = periodTransactions.map(tx => {
            runningBalance += tx.type === 'debit' ? tx.amount : -tx.amount;
            return { ...tx, runningBalance };
          });

          return {
            student,
            openingBalance,
            transactions: ledgerWithRunningBalance,
            closingBalance: runningBalance,
          };
        })
      );
      
      const classOrder = schoolClasses.map(c => c.id);
      setStatements(statementsData.sort((a, b) => {
        const classIndexA = classOrder.indexOf(a.student.classId);
        const classIndexB = classOrder.indexOf(b.student.classId);
        if (classIndexA !== classIndexB) return classIndexA - classIndexB;
        return `${a.student.firstName} ${a.student.lastName}`.localeCompare(`${b.student.firstName} ${b.student.lastName}`);
      }));
      
      toast({title: "Statements Generated", description: `Generated ${statementsData.length} statements.`});

    } catch (error) {
      console.error("Error generating statements:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to generate fee statements." });
    } finally {
      setIsGenerating(false);
    }
  }, [schoolId, selectedClassId, dateRange, toast, schoolClasses]);

  const handlePrint = () => {
    const printContent = printAreaRef.current;
    if (printContent && school) {
      const printWindow = window.open('', '_blank', 'height=800,width=1000');
      if (printWindow) {
        printWindow.document.write('<html><head><title>Student Fee Statements</title>');
        printWindow.document.write(`
          <style>
            @media print {
              @page { size: A4; margin: 0.7in; }
              body { font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .statement-container { page-break-after: always; border: 1px solid #ccc; padding: 20px; margin-bottom: 20px; }
              .no-print { display: none !important; }
              .print-header { text-align: center; margin-bottom: 1rem; }
              h1, h2 { margin: 0; }
              h1 { font-size: 1.5rem; }
              h2 { font-size: 1.2rem; font-weight: normal; }
              p { margin: 2px 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 9pt; }
              th, td { border: 1px solid #ddd; padding: 5px; text-align: left; }
              th { background-color: #f2f2f2 !important; }
              .text-right { text-align: right; }
              .font-semibold { font-weight: 600; }
            }
          </style>
        `);
        printWindow.document.write('</head><body>');
        printWindow.document.write(printAreaRef.current?.innerHTML || '');
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
      }
    }
  };


  return (
    <>
      <div className="space-y-6">
        <Card className="shadow-lg no-print">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-2xl flex items-center"><FileSpreadsheet className="mr-3 h-6 w-6 text-primary"/>Student Fee Statements</CardTitle>
                <CardDescription>Generate detailed, printable fee statements for a selected class and period.</CardDescription>
              </div>
               <PrintButton onClick={handlePrint} disabled={statements.length === 0 || isGenerating}>
                  <Printer className="mr-2 h-4 w-4"/> Download PDF ({statements.length})
                </PrintButton>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row gap-3 w-full items-end">
              <div className="w-full sm:w-auto sm:min-w-[200px]">
                <Label>Class</Label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger className="h-9 text-sm"><Filter className="mr-2 h-4 w-4 text-muted-foreground"/><SelectValue placeholder="Select Class" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CLASSES_SENTINEL}>All Classes</SelectItem>
                    {schoolClasses.map(cls => <SelectItem key={cls.id} value={cls.id}>{cls.class}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-auto">
                <Label>Period</Label>
                <DatePickerWithRange date={dateRange} onDateChange={setDateRange} className="w-full" />
              </div>
              <Button onClick={generateStatements} disabled={!selectedClassId || !dateRange || isGenerating}>
                {isGenerating ? <Loader2 className="animate-spin mr-2"/> : <CalendarDays className="mr-2 h-4 w-4"/>}
                Generate Statements
              </Button>
            </div>
          </CardHeader>
        </Card>

        {isGenerating && <div className="flex justify-center p-12 no-print"><Loader2 className="animate-spin h-12 w-12 text-primary"/></div>}

        <div ref={printAreaRef}>
          {!isGenerating && statements.length === 0 ? (
            <Card className="no-print">
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-3"/>
                <p>Select a class and date range, then click "Generate Statements".</p>
              </CardContent>
            </Card>
          ) : statements.map(data => (
            <div key={data.student.id} className="statement-container p-4 border border-gray-300 rounded-lg bg-white mb-8">
              <div className="print-header text-center mb-4">
                {school?.badgeImageUrl && <Image src={school.badgeImageUrl} alt="School Logo" width={60} height={60} className="mx-auto" />}
                <h1 className="text-xl font-bold">{school?.name}</h1>
                <h2 className="text-lg">Student Fee Statement</h2>
                <p className="text-xs">Period: {format(dateRange!.from!, "PP")} - {format(dateRange!.to!, "PP")}</p>
                 <p className="text-xs">Term: {school?.currentTerm || 'N/A'}</p>
              </div>
              <div className="text-xs mb-3 space-y-0.5">
                <p><strong>Student:</strong> {data.student.firstName} {data.student.lastName}</p>
                <p><strong>Reg. No:</strong> {data.student.studentRegistrationNumber}</p>
                <p><strong>Class:</strong> {schoolClasses.find(c => c.id === data.student.classId)?.class || 'N/A'}</p>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Description</TableHead><TableHead className="text-right text-xs">Debit</TableHead><TableHead className="text-right text-xs">Credit</TableHead><TableHead className="text-right text-xs">Balance</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow><TableCell colSpan={4} className="font-semibold text-xs">Opening Balance</TableCell><TableCell className="text-right font-semibold text-xs">{data.openingBalance.toFixed(2)}</TableCell></TableRow>
                  {data.transactions.map(tx => (
                    <TableRow key={tx.id}><TableCell className="text-xs">{formatDateSafe(tx.transactionDate)}</TableCell><TableCell className="text-xs">{tx.description}</TableCell><TableCell className="text-right text-xs">{tx.type === 'debit' ? tx.amount.toFixed(2) : '-'}</TableCell><TableCell className="text-right text-xs">{tx.type === 'credit' ? tx.amount.toFixed(2) : '-'}</TableCell><TableCell className="text-right text-xs">{tx.runningBalance.toFixed(2)}</TableCell></TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2 border-black"><TableCell colSpan={4} className="text-right text-sm">Closing Balance as of {format(dateRange!.to!, "PP")}</TableCell><TableCell className="text-right text-sm">{data.closingBalance.toFixed(2)}</TableCell></TableRow>
                </TableBody>
              </Table>
              <div className="text-center mt-4 text-xs text-gray-500">Generated on: {format(new Date(), "PPpp")}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
