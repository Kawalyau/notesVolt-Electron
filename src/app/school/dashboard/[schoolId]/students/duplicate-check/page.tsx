// src/app/school/dashboard/[schoolId]/students/duplicate-check/page.tsx
"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { firestore } from '@/config/firebase';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import type { Student, School, SchoolClass } from '@/types/school';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Edit, ArrowLeft, ShieldAlert, Search, AlertTriangle, CheckCircle } from 'lucide-react'; // Added CheckCircle
import { StudentFormDialog } from '@/components/school/student-form-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface DuplicateGroup {
  registrationNumber: string;
  students: Student[];
}

const getInitials = (firstName?: string, lastName?: string) => {
  if (!firstName && !lastName) return "S";
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
};

export default function DuplicateRegCheckPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminForSchool, setIsAdminForSchool] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const fetchSchoolData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const schoolDocRef = doc(firestore, 'schools', schoolId);
      const schoolSnap = await getDoc(schoolDocRef);

      if (schoolSnap.exists()) {
        const schoolData = { id: schoolSnap.id, ...schoolSnap.data() } as School;
        setSchool(schoolData);
        if (schoolData.adminUids.includes(user.uid)) {
          setIsAdminForSchool(true);
          const [studentsSnap, classesSnap] = await Promise.all([
            getDocs(query(collection(firestore, `schools/${schoolId}/students`))),
            getDocs(query(collection(firestore, `schools/${schoolId}/schoolClasses`)))
          ]);
          setAllStudents(studentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
          setSchoolClasses(classesSnap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolClass)));
        } else {
          setIsAdminForSchool(false);
          toast({ variant: "destructive", title: "Access Denied" });
        }
      } else {
        toast({ variant: "destructive", title: "School Not Found" });
        router.push('/school/auth');
      }
    } catch (error) {
      console.error("Error fetching data for duplicate check:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load necessary data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?redirect=/school/dashboard/${schoolId}/students/duplicate-check`);
      return;
    }
    fetchSchoolData();
  }, [authLoading, user, schoolId, fetchSchoolData, router]);

  const duplicateGroups = useMemo((): DuplicateGroup[] => {
    if (isLoading || !allStudents.length) return [];
    const regNoMap = new Map<string, Student[]>();
    allStudents.forEach(student => {
      if (student.studentRegistrationNumber) { // Ensure reg number exists
        const list = regNoMap.get(student.studentRegistrationNumber.toLowerCase()) || [];
        list.push(student);
        regNoMap.set(student.studentRegistrationNumber.toLowerCase(), list);
      }
    });

    const duplicates: DuplicateGroup[] = [];
    regNoMap.forEach((studentsList, regNo) => {
      if (studentsList.length > 1) {
        duplicates.push({ registrationNumber: regNo, students: studentsList });
      }
    });
    return duplicates.sort((a,b) => a.registrationNumber.localeCompare(b.registrationNumber));
  }, [allStudents, isLoading]);

  const handleEditStudent = (studentToEdit: Student) => {
    setEditingStudent(studentToEdit);
    setIsFormOpen(true);
  };
  
  const getClassName = (classId?: string): string => {
    if (!classId) return "N/A";
    const foundClass = schoolClasses.find(c => c.id === classId);
    return foundClass ? (foundClass.code ? `${foundClass.class} (${foundClass.code})` : foundClass.class) : 'N/A';
  };


  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center min-h-screen-minus-navbar"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (!isAdminForSchool && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar bg-background p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">You do not have permission to access this page.</p>
        <Button onClick={() => router.push(`/school/dashboard/${schoolId}`)} variant="outline">Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <Button variant="outline" onClick={() => router.push(`/school/dashboard/${schoolId}/students`)} size="sm">
          <ArrowLeft className="mr-2 h-4 w-4"/> Back to Student List
        </Button>
        <h1 className="text-3xl font-bold text-primary flex items-center"><Search className="mr-3 h-8 w-8"/>Check Duplicate Registration Numbers</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Duplicate Registration Number Report</CardTitle>
          <CardDescription>
            This report lists students who share the same registration number. Each registration number should be unique.
            Use the "Edit" button to correct the registration number for the affected students.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {duplicateGroups.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500"/>
              <p className="font-semibold">No duplicate registration numbers found.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {duplicateGroups.map(group => (
                <Card key={group.registrationNumber} className="bg-amber-50 border-amber-300">
                  <CardHeader className="pb-3 pt-4">
                    <CardTitle className="text-lg text-amber-700 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5"/>
                        Duplicate Registration No: <span className="font-mono">{group.registrationNumber}</span> ({group.students.length} students)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Student Name</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {group.students.map(student => (
                          <TableRow key={student.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7">
                                  <AvatarImage src={student.photoUrl || undefined} alt={`${student.firstName} ${student.lastName}`} />
                                  <AvatarFallback>{getInitials(student.firstName, student.lastName)}</AvatarFallback>
                                </Avatar>
                                <span className="font-medium text-sm">{`${student.firstName} ${student.middleName || ''} ${student.lastName}`}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{getClassName(student.classId)}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="outline" size="sm" onClick={() => handleEditStudent(student)}>
                                <Edit className="mr-1.5 h-3.5 w-3.5"/> Edit
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {school && editingStudent && (
        <StudentFormDialog
          isOpen={isFormOpen}
          onOpenChange={setIsFormOpen}
          school={school}
          schoolClasses={schoolClasses}
          allStudents={allStudents} 
          initialData={editingStudent}
          onStudentSaved={() => {
            fetchSchoolData(); 
            setIsFormOpen(false);
            setEditingStudent(null);
          }}
        />
      )}
    </div>
  );
}
