// src/app/school/dashboard/[schoolId]/attendance/take/page.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, setAttendanceForClass } from '@/services/schoolService';
import type { School, Student, SchoolClass, AttendanceRecord } from '@/types/school';
import { format } from 'date-fns';
import Image from 'next/image';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';


import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2, CalendarCheck, Filter, Printer, SaveAll, Send } from 'lucide-react';
import { query, where } from 'firebase/firestore';

export default function TakeAttendancePage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const { user } = useAuth();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingStudents, setIsFetchingStudents] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isNotifying, setIsNotifying] = useState(false);

  const [school, setSchool] = useState<School | null>(null);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  
  const [studentsInClass, setStudentsInClass] = useState<Student[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, 'Present' | 'Absent' | 'Late'>>({});
  const [hasSaved, setHasSaved] = useState(false);

  const fetchInitialData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const [fetchedSchool, fetchedClasses] = await Promise.all([
        getSchoolById(schoolId),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses')
      ]);
      setSchool(fetchedSchool);
      setSchoolClasses(fetchedClasses);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load initial school data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Fetch students and existing attendance records when class or date changes
  useEffect(() => {
    const fetchStudentsAndAttendance = async () => {
      if (!selectedClassId || !selectedDate) {
        setStudentsInClass([]);
        setAttendanceRecords({});
        setHasSaved(false);
        return;
      }
      setIsFetchingStudents(true);
      setHasSaved(false);
      try {
        const formattedDate = format(selectedDate, 'yyyy-MM-dd');
        const [students, existingAttendance] = await Promise.all([
          getSchoolSubcollectionItems<Student>(schoolId, 'students', [where('classId', '==', selectedClassId), where('status', '==', 'Active')]),
          getSchoolSubcollectionItems<AttendanceRecord>(schoolId, 'attendance', [where('classId', '==', selectedClassId), where('date', '==', formattedDate)]),
        ]);
        
        setStudentsInClass(students.sort((a,b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)));
        
        const initialRecords: Record<string, 'Present' | 'Absent' | 'Late'> = {};
        students.forEach(student => {
          const record = existingAttendance.find(att => att.studentId === student.id);
          initialRecords[student.id] = record?.status || 'Present'; // Default to Present
        });
        setAttendanceRecords(initialRecords);
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Could not load students or attendance records." });
      } finally {
        setIsFetchingStudents(false);
      }
    };
    fetchStudentsAndAttendance();
  }, [selectedClassId, selectedDate, schoolId, toast]);

  const handleAttendanceChange = (studentId: string, status: 'Present' | 'Absent' | 'Late') => {
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: status,
    }));
    setHasSaved(false); // Changes have been made, requires saving again
  };

  const handleSaveAttendance = async () => {
    if (!selectedClassId || !selectedDate || studentsInClass.length === 0 || !user) return;
    setIsSaving(true);
    try {
      await setAttendanceForClass(schoolId, selectedClassId, selectedDate, attendanceRecords, user.uid);
      toast({ title: "Success", description: "Attendance records have been saved." });
      setHasSaved(true); // Mark as saved to enable notification button
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleNotifyAbsentees = async () => {
    if (!hasSaved || !school) {
        toast({ variant: "destructive", title: "Save First", description: "Please save the attendance records before sending notifications." });
        return;
    }
    const absentees = studentsInClass.filter(
        student => attendanceRecords[student.id] === 'Absent' && student.guardianPhone
    );

    if (absentees.length === 0) {
        toast({ title: "No Absentees", description: "No students marked as 'Absent' with a guardian phone number." });
        return;
    }

    if (!window.confirm(`This will send an SMS to the guardians of ${absentees.length} absent student(s). Do you want to proceed?`)) {
        return;
    }

    setIsNotifying(true);
    toast({ title: `Sending ${absentees.length} SMS...`, description: "This may take a moment." });
    
    const sendSmsFunction = httpsCallable(functions, 'sendSms');
    let successCount = 0;
    
    for (const student of absentees) {
        const studentName = `${student.firstName} ${student.lastName}`;
        const className = schoolClasses.find(c => c.id === student.classId)?.class || 'their class';
        const message = `Dear Parent, this is to inform you that ${studentName} was marked absent from ${className} on ${format(selectedDate!, "PP")}. Please contact the school if you have any concerns. Thank you, ${school.name}.`;
        try {
            const result = await sendSmsFunction({
                schoolId,
                recipient: student.guardianPhone,
                message,
            });
            const data = result.data as { success: boolean };
            if (data.success) {
                successCount++;
            }
        } catch (error) {
            console.error(`Failed to send SMS to ${student.guardianPhone}`, error);
        }
    }

    toast({
        title: "Notifications Sent",
        description: `Successfully sent ${successCount} out of ${absentees.length} possible SMS alerts for absentees.`,
    });
    setIsNotifying(false);
  };


  const handlePrint = () => {
    const printContent = printRef.current;
    if (printContent && school) {
      const printWindow = window.open('', '_blank', 'height=800,width=1000');
      if (printWindow) {
        printWindow.document.write('<html><head><title>Attendance Sheet</title>');
        printWindow.document.write(`
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .print-header { text-align: center; margin-bottom: 20px; }
            h1 { margin: 0; } h2 { margin: 0; font-weight: normal; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11pt; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .status-col { width: 120px; }
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
  
  const selectedClassName = schoolClasses.find(c => c.id === selectedClassId)?.class || '';


  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><CalendarCheck className="mr-3 h-6 w-6 text-primary"/>Take Attendance</CardTitle>
          <CardDescription>Select a class and date to take attendance. You can also print a blank sheet for manual entry.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-grow"><Label>Class</Label><Select value={selectedClassId} onValueChange={setSelectedClassId}><SelectTrigger><SelectValue placeholder="Select a class..." /></SelectTrigger><SelectContent>{schoolClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.class}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex-grow"><Label>Date</Label><DatePicker date={selectedDate} onDateChange={setSelectedDate} /></div>
            <Button onClick={handlePrint} variant="outline" disabled={!selectedClassId || !selectedDate}>
              <Printer className="mr-2 h-4 w-4"/> Print Blank Sheet
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {isFetchingStudents ? (
        <div className="flex justify-center items-center py-8"><Loader2 className="h-10 w-10 animate-spin text-primary"/></div>
      ) : studentsInClass.length > 0 && selectedClassId && selectedDate ? (
        <Card>
          <CardHeader>
            <CardTitle>Attendance for {selectedClassName} on {format(selectedDate, "PP")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studentsInClass.map(student => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{`${student.firstName} ${student.lastName}`}</TableCell>
                      <TableCell>
                        <RadioGroup
                          value={attendanceRecords[student.id] || 'Present'}
                          onValueChange={(value) => handleAttendanceChange(student.id, value as 'Present' | 'Absent' | 'Late')}
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2"><RadioGroupItem value="Present" id={`present-${student.id}`} /><Label htmlFor={`present-${student.id}`}>Present</Label></div>
                          <div className="flex items-center space-x-2"><RadioGroupItem value="Absent" id={`absent-${student.id}`} /><Label htmlFor={`absent-${student.id}`}>Absent</Label></div>
                          <div className="flex items-center space-x-2"><RadioGroupItem value="Late" id={`late-${student.id}`} /><Label htmlFor={`late-${student.id}`}>Late</Label></div>
                        </RadioGroup>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-3">
             <Button onClick={handleNotifyAbsentees} disabled={!hasSaved || isSaving || isNotifying} variant="outline">
              {isNotifying ? <Loader2 className="animate-spin mr-2"/> : <Send className="mr-2 h-4 w-4"/>}
              Notify Absentees
            </Button>
            <Button onClick={handleSaveAttendance} disabled={isSaving || isNotifying}>
              {isSaving ? <Loader2 className="animate-spin mr-2"/> : <SaveAll className="mr-2 h-4 w-4"/>}
              Save Attendance
            </Button>
          </CardFooter>
        </Card>
      ) : selectedClassId && selectedDate && (
        <div className="text-center py-8 text-muted-foreground">No students found for this class.</div>
      )}
      
      {/* Hidden printable content */}
      <div className="hidden">
        <div ref={printRef}>
          <div className="print-header">
            {school?.badgeImageUrl && <img src={school.badgeImageUrl} alt={`${school.name} Logo`} style={{maxHeight: '70px', marginBottom: '10px'}} />}
            <h1>{school?.name}</h1>
            <h2>Daily Attendance Sheet</h2>
            <p><strong>Class:</strong> {selectedClassName} | <strong>Date:</strong> {selectedDate ? format(selectedDate, 'eeee, MMMM dd, yyyy') : ''}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th style={{width: '5%'}}>#</th>
                <th style={{width: '50%'}}>Student Name</th>
                <th className="status-col">Present</th>
                <th className="status-col">Absent</th>
                <th className="status-col">Late</th>
              </tr>
            </thead>
            <tbody>
              {studentsInClass.map((student, index) => (
                <tr key={student.id}>
                  <td>${index + 1}</td>
                  <td className="name-col">{`${student.firstName} ${student.lastName}`}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
