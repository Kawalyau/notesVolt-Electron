// src/app/school/dashboard/[schoolId]/students/[studentId]/assignment-statement/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { firestore } from '@/config/firebase';
import { Timestamp } from 'firebase/firestore';
import type { Student, School, StudentRequirementAssignmentLog, SchoolClass } from '@/types/school';
import { getSchoolById, getStudentById, getSchoolSubcollectionItems, getStudentRequirementAssignmentLogs } from '@/services/schoolService';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, ShieldAlert, ListOrdered, PackageCheck } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

export default function StudentAssignmentStatementPage() {
  const params = useParams();
  const router = useRouter();
  const { user: adminUserAuth, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const schoolId = params.schoolId as string;
  const studentId = params.studentId as string;

  const [school, setSchool] = useState<School | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [assignmentLogs, setAssignmentLogs] = useState<StudentRequirementAssignmentLog[]>([]);
  
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isAdminForSchool, setIsAdminForSchool] = useState(false);

  const fetchAllData = useCallback(async () => {
    if (!adminUserAuth || !schoolId || !studentId) return;
    setIsLoadingData(true);

    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(adminUserAuth.uid)) {
        toast({ variant: "destructive", title: "Access Denied", description: "You are not an admin for this school." });
        router.push(`/school/dashboard/${schoolId}`);
        setIsAdminForSchool(false); setSchool(null); return;
      }
      setSchool(fetchedSchool); setIsAdminForSchool(true);

      const [fetchedStudent, fetchedClasses, fetchedLogs] = await Promise.all([
        getStudentById(schoolId, studentId),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        getStudentRequirementAssignmentLogs(schoolId, studentId), // Fetch all logs for the student
      ]);

      setSchoolClasses(fetchedClasses);
      setAssignmentLogs(fetchedLogs);

      if (!fetchedStudent) {
        toast({ variant: "destructive", title: "Error", description: "Student not found." });
        setStudent(null); setIsLoadingData(false); return;
      }
      setStudent(fetchedStudent);

    } catch (error) {
      console.error("Error fetching data for assignment statement:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load statement data." });
    } finally {
      setIsLoadingData(false);
    }
  }, [adminUserAuth, schoolId, studentId, toast, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!adminUserAuth) {
      router.replace(`/login?redirect=/school/dashboard/${schoolId}/students/${studentId}/assignment-statement`);
      return;
    }
    fetchAllData();
  }, [adminUserAuth, authLoading, router, schoolId, studentId, fetchAllData]);
  
  const formatDateSafe = (dateInput: Timestamp | string | undefined) => {
    if (!dateInput) return 'N/A';
    try {
      const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput.toDate();
      return format(date, "PPpp"); // e.g., Mar 15, 2024, 4:30 PM
    } catch (error) {
      return 'Invalid Date';
    }
  };


  if (isLoadingData || authLoading) {
    return <div className="flex justify-center items-center min-h-screen-minus-navbar"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (!adminUserAuth || !isAdminForSchool) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar bg-background p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">You do not have permission to view this page.</p>
        <Button onClick={() => router.push(`/school/dashboard/${schoolId}`)} variant="outline">Back to Dashboard</Button>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar bg-background p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Student Not Found</h1>
        <p className="text-muted-foreground mb-6">The student details could not be loaded.</p>
        <Button onClick={() => router.push(`/school/dashboard/${schoolId}/students`)} variant="outline">Back to Student List</Button>
      </div>
    );
  }

  const studentClass = schoolClasses.find(c => c.id === student.classId)?.name || 'N/A';

  return (
    <div className="container mx-auto px-2 sm:px-4 py-8">
       <div className="mb-6 flex flex-wrap justify-between items-center gap-2">
            <Button variant="outline" onClick={() => router.push(`/school/dashboard/${schoolId}/students/${studentId}/pay-requirements`)} size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Pay Requirements
            </Button>
            {/* Future: Add print button for the statement */}
      </div>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><PackageCheck className="mr-3 h-7 w-7 text-primary"/>Student Assignment Statement</CardTitle>
          <CardDescription className="text-sm">
            Record of physical requirement items assigned to the student by the school.
          </CardDescription>
           <div className="mt-3 pt-3 border-t text-sm space-y-0.5">
            <div>School: <span className="font-semibold text-foreground">{school?.name}</span></div>
            <div>Student: <span className="font-semibold text-foreground">{student.firstName} {student.lastName}</span> (Reg: {student.studentRegistrationNumber})</div>
            <div>Class: <span className="font-semibold text-foreground">{studentClass}</span></div>
          </div>
        </CardHeader>
        <CardContent>
          {assignmentLogs.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No items have been assigned to this student yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date Assigned</TableHead>
                  <TableHead>Requirement Item</TableHead>
                  <TableHead className="text-center">Quantity Assigned</TableHead>
                  <TableHead>Assigned By</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignmentLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">{formatDateSafe(log.assignmentDate)}</TableCell>
                    <TableCell className="font-medium">{log.requirementName}</TableCell>
                    <TableCell className="text-center">{log.quantityAssigned}</TableCell>
                    <TableCell className="text-xs">{log.adminName || log.adminId}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.notes || 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
