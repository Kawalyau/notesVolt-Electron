
// src/app/school/dashboard/[schoolId]/exercise-books/balances/page.tsx
"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services/schoolService';
import type { School, Student, SchoolClass } from '@/types/school';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Search as SearchIcon, Book, MoreVertical } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ManageStudentBooksDialog } from '@/components/school/manage-student-books-dialog';

const getInitials = (firstName?: string, lastName?: string) => {
  if (!firstName && !lastName) return "S";
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
};

export default function StudentBookBalancesPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isManageBooksDialogOpen, setIsManageBooksDialogOpen] = useState(false);

  useEffect(() => {
    if (authLoading || !user || !schoolId) return;
    fetchData();
  }, [schoolId, user, authLoading]);

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
      toast({ variant: "destructive", title: "Error", description: "Failed to load student or class data." });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredStudents = useMemo(() => {
    let studentsToProcess = allStudents;
    if (searchTerm.trim()) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      studentsToProcess = studentsToProcess.filter(student =>
        `${student.firstName} ${student.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
        student.studentRegistrationNumber.toLowerCase().includes(lowerSearchTerm)
      );
    }
    return studentsToProcess.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  }, [allStudents, searchTerm]);

  const getClassName = (classId: string) => {
    const foundClass = schoolClasses.find(c => c.id === classId);
    return foundClass ? (foundClass.code ? `${foundClass.class} (${foundClass.code})` : foundClass.class) : 'N/A';
  };
  
  const handleManageStudent = (student: Student) => {
    setSelectedStudent(student);
    setIsManageBooksDialogOpen(true);
  };

  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Student Exercise Book Balances</CardTitle>
          <CardDescription>View, record payments, and issue exercise books to students.</CardDescription>
          <div className="relative mt-4">
            <Input
              type="search"
              placeholder="Search by name or registration no..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
            <SearchIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-center">Sm. Books Bal.</TableHead>
                  <TableHead className="text-center">Lg. Books Bal.</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.length > 0 ? filteredStudents.map(student => {
                  const smallBalance = (student.exerciseBooksSmall_Paid || 0) - (student.exerciseBooksSmall_Received || 0);
                  const largeBalance = (student.exerciseBooksLarge_Paid || 0) - (student.exerciseBooksLarge_Received || 0);
                  return (
                    <TableRow key={student.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8"><AvatarImage src={student.photoUrl || undefined} /><AvatarFallback>{getInitials(student.firstName, student.lastName)}</AvatarFallback></Avatar>
                          <div>
                            <span className="font-medium text-sm">{`${student.firstName} ${student.lastName}`}</span>
                            <div className="text-xs text-muted-foreground">{student.studentRegistrationNumber}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{getClassName(student.classId)}</TableCell>
                      <TableCell className="text-center font-semibold text-sm">{smallBalance}</TableCell>
                      <TableCell className="text-center font-semibold text-sm">{largeBalance}</TableCell>
                      <TableCell className="text-center">
                          <Button variant="outline" size="sm" onClick={() => handleManageStudent(student)}>
                            <Book className="mr-2 h-4 w-4" /> Manage
                          </Button>
                      </TableCell>
                    </TableRow>
                  )
                }) : (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No students match your search.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {selectedStudent && (
        <ManageStudentBooksDialog
            isOpen={isManageBooksDialogOpen}
            onOpenChange={setIsManageBooksDialogOpen}
            student={selectedStudent}
            schoolId={schoolId}
            onDataChange={() => {
                fetchData();
                setIsManageBooksDialogOpen(false);
            }}
        />
      )}
    </>
  );
}
