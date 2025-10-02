// src/app/school/dashboard/[schoolId]/attendance/reports/page.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, getAttendanceForDate } from '@/services/schoolService';
import type { School, SchoolClass, AttendanceRecord } from '@/types/school';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CalendarDays, Printer, BarChart3, AlertTriangle } from 'lucide-react';
import Image from 'next/image';
import { Label } from '@/components/ui/label';

interface DailySummary {
  classId: string;
  className: string;
  present: number;
  absent: number;
  late: number;
  total: number;
}

export default function AttendanceReportsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const { user } = useAuth();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingReport, setIsFetchingReport] = useState(false);
  const [school, setSchool] = useState<School | null>(null);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [dailySummaryData, setDailySummaryData] = useState<DailySummary[]>([]);

  const fetchInitialData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const [fetchedSchool, fetchedClasses] = await Promise.all([
        getSchoolById(schoolId),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses')
      ]);
      setSchool(fetchedSchool);
      setSchoolClasses(fetchedClasses.sort((a, b) => (a.class || "").localeCompare(b.class || "")));
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load initial school data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    const generateDailySummary = async () => {
      if (!selectedDate || schoolClasses.length === 0) {
        setDailySummaryData([]);
        return;
      }
      setIsFetchingReport(true);
      try {
        const attendanceRecords = await getAttendanceForDate(schoolId, selectedDate);
        
        const summary: Record<string, Omit<DailySummary, 'classId' | 'className'>> = {};

        attendanceRecords.forEach(record => {
          if (!summary[record.classId]) {
            summary[record.classId] = { present: 0, absent: 0, late: 0, total: 0 };
          }
          summary[record.classId][record.status.toLowerCase() as 'present' | 'absent' | 'late']++;
          summary[record.classId].total++;
        });

        const formattedSummary = schoolClasses.map(cls => ({
          classId: cls.id,
          className: cls.class,
          present: summary[cls.id]?.present || 0,
          absent: summary[cls.id]?.absent || 0,
          late: summary[cls.id]?.late || 0,
          total: summary[cls.id]?.total || 0,
        }));

        setDailySummaryData(formattedSummary);

      } catch (error) {
        console.error("Error generating daily summary:", error);
        toast({ variant: "destructive", title: "Report Error", description: "Could not generate the daily summary report." });
      } finally {
        setIsFetchingReport(false);
      }
    };

    generateDailySummary();
  }, [selectedDate, schoolId, schoolClasses, toast]);

   const handlePrint = () => {
    const printContent = printRef.current;
    if (printContent && school) {
      const printWindow = window.open('', '_blank', 'height=800,width=1000');
      if (printWindow) {
        printWindow.document.write('<html><head><title>Daily Attendance Summary</title>');
        printWindow.document.write(`
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 10pt; }
            .print-header { text-align: center; margin-bottom: 20px; }
            h1 { font-size: 16pt; margin: 0; } h2 { font-size: 12pt; margin: 0; font-weight: normal; }
            p { font-size: 10pt; margin: 2px 0; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #000; padding: 6px; text-align: center; }
            th { background-color: #f2f2f2; }
            .class-name { text-align: left; }
            .no-print { display: none !important; }
            @page { size: auto; margin: 0.7in; }
          </style>
        `);
        printWindow.document.write('</head><body>');
        printWindow.document.write(printRef.current?.innerHTML || '');
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
      }
    }
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
            <div>
              <CardTitle className="flex items-center">
                <BarChart3 className="mr-3 h-6 w-6 text-primary"/>
                Attendance Reports
              </CardTitle>
              <CardDescription>
                Select a date to view the daily attendance summary for all classes.
              </CardDescription>
            </div>
             <Button onClick={handlePrint} variant="outline" size="sm" disabled={isFetchingReport || dailySummaryData.length === 0}>
                <Printer className="mr-2 h-4 w-4"/> Print Summary
            </Button>
          </div>
          <div className="mt-4 pt-4 border-t">
            <Label>Select Date</Label>
            <DatePicker date={selectedDate} onDateChange={setSelectedDate} />
          </div>
        </CardHeader>
        <CardContent>
          {isFetchingReport ? (
            <div className="flex justify-center items-center py-12"><Loader2 className="h-10 w-10 animate-spin text-primary"/></div>
          ) : dailySummaryData.length > 0 ? (
            <div ref={printRef}>
              <div className="print-header hidden print:block">
                {school?.badgeImageUrl && <Image src={school.badgeImageUrl} alt={`${school.name} Logo`} width={70} height={70} className="mx-auto" />}
                <h1>{school?.name}</h1>
                <h2>Daily Attendance Summary</h2>
                <p>Date: {selectedDate ? format(selectedDate, "PP") : 'N/A'}</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="class-name">Class</TableHead>
                    <TableHead className="text-center">Present</TableHead>
                    <TableHead className="text-center">Absent</TableHead>
                    <TableHead className="text-center">Late</TableHead>
                    <TableHead className="text-center font-bold">Total Recorded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailySummaryData.map((summary) => (
                    <TableRow key={summary.classId}>
                      <TableCell className="font-medium class-name">{summary.className}</TableCell>
                      <TableCell className="text-center text-green-600 font-semibold">{summary.present}</TableCell>
                      <TableCell className="text-center text-red-600 font-semibold">{summary.absent}</TableCell>
                      <TableCell className="text-center text-amber-600 font-semibold">{summary.late}</TableCell>
                      <TableCell className="text-center font-bold">{summary.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
             <div className="text-center py-10 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-3"/>
                <p>No attendance records found for {selectedDate ? format(selectedDate, "PP") : 'the selected date'}.</p>
            </div>
          )}
        </CardContent>
      </Card>
      
       <Card>
        <CardHeader>
          <CardTitle className="text-lg text-muted-foreground flex items-center">
            <AlertTriangle className="mr-3 h-5 w-5 text-amber-500"/>
            More Reports Coming Soon
          </CardTitle>
          <CardDescription>
            Individual student reports, monthly summaries, and absentee tracking are under development.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
