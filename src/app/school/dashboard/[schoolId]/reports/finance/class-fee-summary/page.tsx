
// src/app/school/dashboard/[schoolId]/reports/finance/class-fee-summary/page.tsx
"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, getFeeTransactions } from '@/services';
import type { School, Student, SchoolClass, FeeItem, SchoolAcademicYear, SchoolTerm, FeeTransaction } from '@/types/school';
import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, UsersRound, Filter, ShieldAlert, Printer, BarChart3 } from 'lucide-react';

const ALL_ITEMS_SENTINEL = "_ALL_";

export default function ClassFeeSummaryReportPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [academicYears, setAcademicYears] = useState<SchoolAcademicYear[]>([]);
  const [schoolTerms, setSchoolTerms] = useState<SchoolTerm[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [allTransactions, setAllTransactions] = useState<FeeTransaction[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminForSchool, setIsAdminForSchool] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>("");
  const [selectedTerm, setSelectedTerm] = useState<string>("");

  const fetchInitialData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" });
        router.push(`/school/dashboard/${schoolId}`);
        setIsAdminForSchool(false); return;
      }
      setSchool(fetchedSchool);
      setIsAdminForSchool(true);
      setSelectedAcademicYearId(fetchedSchool.currentAcademicYearId || "");
      setSelectedTerm(fetchedSchool.currentTerm || "");

      const [classesData, academicYearsData, termsData, studentsData] = await Promise.all([
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        getSchoolSubcollectionItems<SchoolAcademicYear>(schoolId, 'schoolAcademicYears'),
        getSchoolSubcollectionItems<SchoolTerm>(schoolId, 'schoolTerms'),
        getSchoolSubcollectionItems<Student>(schoolId, 'students'),
      ]);
      setSchoolClasses(classesData.sort((a,b) => (a.class || "").localeCompare(b.class || "")));
      setAcademicYears(academicYearsData.sort((a,b) => (b.year || "").localeCompare(a.year || "")));
      setSchoolTerms(termsData);
      setAllStudents(studentsData);

      // Fetch all transactions for all students (can be performance intensive)
      let transactions: FeeTransaction[] = [];
      for (const student of studentsData) {
        const studentTransactions = await getFeeTransactions(schoolId, student.id);
        transactions.push(...studentTransactions);
      }
      setAllTransactions(transactions);

    } catch (error) {
      console.error("Error fetching class fee summary data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load report data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?redirect=/school/dashboard/${schoolId}/reports/finance/class-fee-summary`);
      return;
    }
    fetchInitialData();
  }, [authLoading, user, schoolId, fetchInitialData, router]);

  const availableTermsForSelectedYear = useMemo(() => {
    if (!selectedAcademicYearId) return schoolTerms.sort((a,b) => (a.name || "").localeCompare(b.name || ""));
    return schoolTerms.filter(t => t.academicYearId === selectedAcademicYearId).sort((a,b) => (a.name || "").localeCompare(b.name || ""));
  }, [selectedAcademicYearId, schoolTerms]);

  const reportSummary = useMemo(() => {
    if (isLoading || !selectedClassId || !selectedAcademicYearId || !selectedTerm) {
      return { totalBilled: 0, totalPaid: 0, totalOutstanding: 0, studentCount: 0 };
    }

    const studentsInSelectedClass = allStudents.filter(s => s.classId === selectedClassId && s.status === 'Active');
    let totalBilledForClass = 0;
    let totalPaidForClass = 0;

    studentsInSelectedClass.forEach(student => {
      const studentTransactionsInContext = allTransactions.filter(tx => 
        tx.studentId === student.id &&
        tx.academicYearId === selectedAcademicYearId &&
        tx.term === selectedTerm
      );
      studentTransactionsInContext.forEach(tx => {
        if (tx.type === 'debit') totalBilledForClass += tx.amount;
        else if (tx.type === 'credit') totalPaidForClass += tx.amount;
      });
    });
    
    return {
      totalBilled: totalBilledForClass,
      totalPaid: totalPaidForClass,
      totalOutstanding: totalBilledForClass - totalPaidForClass,
      studentCount: studentsInSelectedClass.length,
    };
  }, [isLoading, selectedClassId, selectedAcademicYearId, selectedTerm, allStudents, allTransactions]);

  const handlePrintReport = () => {
    const printContent = document.getElementById("printableClassFeeSummary");
    const selectedClass = schoolClasses.find(c => c.id === selectedClassId);
    const selectedYear = academicYears.find(ay => ay.id === selectedAcademicYearId);
    
    if (printContent && school && selectedClass && selectedYear && selectedTerm) {
      const printWindow = window.open('', '_blank', 'height=800,width=1000');
      if (printWindow) {
        printWindow.document.write('<html><head><title>Class Fee Summary Report</title>');
        printWindow.document.write(`
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 10pt; }
            .report-header { text-align: center; margin-bottom: 20px; }
            .report-header h1 { font-size: 16pt; margin: 0; color: #1A237E; }
            .report-header h2 { font-size: 12pt; margin: 0; }
            .report-header p { font-size: 9pt; margin: 2px 0; color: #555; }
            .summary-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            .summary-table th, .summary-table td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 10pt; }
            .summary-table th { background-color: #f0f4f8; font-weight: bold; color: #1A237E; }
            .summary-table td.number { text-align: right; font-weight: bold; }
            .no-print { display: none !important; }
            @page { size: auto; margin: 0.5in; }
          </style>
        `);
        printWindow.document.write('</head><body>');
        printWindow.document.write('<div class="report-header">');
        if (school.badgeImageUrl) {
          printWindow.document.write(`<img src="${school.badgeImageUrl}" alt="${school.name} Logo" style="max-height: 60px; margin-bottom: 10px; object-fit: contain;">`);
        }
        printWindow.document.write(`<h1>${school.name}</h1>`);
        printWindow.document.write(`<h2>Class Fee Summary Report</h2>`);
        printWindow.document.write(`<p>Class: ${selectedClass.class} | Year: ${selectedYear.year} | Term: ${selectedTerm}</p>`);
        printWindow.document.write(`<p>Report Date: ${format(new Date(), "PP")}</p>`);
        printWindow.document.write('</div>');
        printWindow.document.write(printContent.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
      }
    }
  };

  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-15rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  if (!isAdminForSchool && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar bg-background p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">You do not have permission to view this report.</p>
        <Button onClick={() => router.push(`/school/dashboard/${schoolId}`)} variant="outline">Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex-grow">
              <CardTitle className="text-2xl flex items-center"><UsersRound className="mr-3 h-6 w-6 text-primary"/>Class Fee Summary Report</CardTitle>
              <CardDescription>Summary of fees billed, paid, and outstanding for a selected class, academic year, and term in {school?.name || 'the school'}.</CardDescription>
            </div>
            <Button onClick={handlePrintReport} variant="outline" size="sm" disabled={!selectedClassId || !selectedAcademicYearId || !selectedTerm}>
              <Printer className="mr-2 h-4 w-4"/> Print Report
            </Button>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-3 w-full items-end">
            <div className="w-full sm:w-auto sm:min-w-[200px]">
              <Select value={selectedAcademicYearId} onValueChange={setSelectedAcademicYearId} disabled={academicYears.length === 0}>
                <SelectTrigger className="h-9 text-sm"><Filter className="mr-2 h-4 w-4 text-muted-foreground"/><SelectValue placeholder="Select Academic Year" /></SelectTrigger>
                <SelectContent>
                  {academicYears.map(ay => <SelectItem key={ay.id} value={ay.id}>{ay.year}</SelectItem>)}
                  {academicYears.length === 0 && <SelectItem value="_NONE_YEARS_" disabled>No academic years defined</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[150px]">
              <Select value={selectedTerm} onValueChange={setSelectedTerm} disabled={availableTermsForSelectedYear.length === 0}>
                <SelectTrigger className="h-9 text-sm"><Filter className="mr-2 h-4 w-4 text-muted-foreground"/><SelectValue placeholder="Select Term" /></SelectTrigger>
                <SelectContent>
                  {availableTermsForSelectedYear.map(term => <SelectItem key={term.id} value={term.name}>{term.name}</SelectItem>)}
                  {availableTermsForSelectedYear.length === 0 && <SelectItem value="_NONE_TERMS_" disabled>No terms for selected year</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[200px]">
              <Select value={selectedClassId} onValueChange={setSelectedClassId} disabled={schoolClasses.length === 0}>
                <SelectTrigger className="h-9 text-sm"><Filter className="mr-2 h-4 w-4 text-muted-foreground"/><SelectValue placeholder="Select Class" /></SelectTrigger>
                <SelectContent>
                  {schoolClasses.map(cls => <SelectItem key={cls.id} value={cls.id}>{cls.code ? `${cls.class} (${cls.code})` : cls.class}</SelectItem>)}
                  {schoolClasses.length === 0 && <SelectItem value="_NONE_CLASSES_" disabled>No classes defined</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedClassId || !selectedAcademicYearId || !selectedTerm ? (
             <div className="text-center py-10 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-3"/>
                <p>Please select an Academic Year, Term, and Class to generate the summary.</p>
            </div>
          ) : reportSummary.studentCount === 0 && !isLoading ? (
            <div className="text-center py-10 text-muted-foreground">
              <UsersRound className="h-12 w-12 mx-auto mb-3"/>
              <p>No active students found for the selected class in this academic context.</p>
            </div>
          ) : (
            <div id="printableClassFeeSummary">
              <Table className="summary-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Summary Item</TableHead>
                    <TableHead className="text-right number">Amount (UGX)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Total Fees Billed for Class</TableCell>
                    <TableCell className="number">{reportSummary.totalBilled.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Total Fees Paid by Class</TableCell>
                    <TableCell className="number">{reportSummary.totalPaid.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow className="font-bold text-primary">
                    <TableCell>Total Outstanding for Class</TableCell>
                    <TableCell className={`number ${reportSummary.totalOutstanding > 0 ? 'positive-balance' : (reportSummary.totalOutstanding < 0 ? 'negative-balance' : '')}`}>
                      {reportSummary.totalOutstanding.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-3">Summary based on {reportSummary.studentCount} active student(s) in the selected class for the specified academic year and term.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
