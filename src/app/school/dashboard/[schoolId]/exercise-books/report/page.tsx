
// src/app/school/dashboard/[schoolId]/exercise-books/report/page.tsx
"use client";

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services/schoolService';
import type { School, Student, SchoolClass } from '@/types/school';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from '@/hooks/use-toast';
import { Loader2, ListChecks } from 'lucide-react';

export default function OutstandingBooksReportPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user || !schoolId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [studentsData, classesData] = await Promise.all([
          getSchoolSubcollectionItems<Student>(schoolId, 'students', [{ field: 'status', op: '==', value: 'Active' }]),
          getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        ]);
        setAllStudents(studentsData);
        setSchoolClasses(classesData);
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Failed to load report data." });
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [schoolId, user, authLoading, toast]);

  const studentsWithBalance = useMemo(() => {
    return allStudents.filter(student => {
      const smallBalance = (student.exerciseBooksSmall_Paid || 0) - (student.exerciseBooksSmall_Received || 0);
      const largeBalance = (student.exerciseBooksLarge_Paid || 0) - (student.exerciseBooksLarge_Received || 0);
      return smallBalance > 0 || largeBalance > 0;
    }).sort((a,b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  }, [allStudents]);

  const getClassName = (classId: string) => {
    const foundClass = schoolClasses.find(c => c.id === classId);
    return foundClass ? (foundClass.code ? `${foundClass.class} (${foundClass.code})` : foundClass.class) : 'N/A';
  }

  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center"><ListChecks className="mr-3 h-6 w-6"/>Students with Outstanding Book Balances</CardTitle>
        <CardDescription>This report lists all active students who are still owed exercise books.</CardDescription>
      </CardHeader>
      <CardContent>
        {studentsWithBalance.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">All students have received their paid-for books.</p>
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Registration No.</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-center">Small Books Balance</TableHead>
                  <TableHead className="text-center">Large Books Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentsWithBalance.map(student => {
                  const smallBalance = (student.exerciseBooksSmall_Paid || 0) - (student.exerciseBooksSmall_Received || 0);
                  const largeBalance = (student.exerciseBooksLarge_Paid || 0) - (student.exerciseBooksLarge_Received || 0);
                  return (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{`${student.firstName} ${student.lastName}`}</TableCell>
                      <TableCell>{student.studentRegistrationNumber}</TableCell>
                      <TableCell>{getClassName(student.classId)}</TableCell>
                      <TableCell className="text-center font-semibold">{smallBalance}</TableCell>
                      <TableCell className="text-center font-semibold">{largeBalance}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
