// src/app/school/dashboard/[schoolId]/students/directory/page.tsx
"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { getSchoolById, getSchoolSubcollectionItems, deleteSchoolSubcollectionItem } from '@/services/schoolService';
import type { School, Student, SchoolClass } from '@/types/school';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, PlusCircle, Edit, Trash2, ShieldAlert, UserCircle, Search as SearchIcon, MoreVertical, Banknote, Upload, Receipt, Calendar, Printer } from 'lucide-react';
import { StudentFormDialog } from '@/components/school/student-form-dialog';
import { ImportStudentsDialog } from '@/components/school/import-students-dialog';
import { ImportFeeTransactionsDialog } from '@/components/school/import-fee-transactions-dialog';
import { PrintStudentListDialog } from '@/components/school/print-student-list-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DatePicker } from '@/components/ui/date-picker';
import { format, parseISO, isSameDay, isValid } from 'date-fns';
import { Timestamp } from 'firebase/firestore';


const getInitials = (firstName?: string, lastName?: string) => {
  if (!firstName && !lastName) return "S";
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
};

export default function StudentDirectoryPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const schoolId = params.schoolId as string;

  const [school, setSchool] = useState<School | null>(null);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminForSchool, setIsAdminForSchool] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportStudentsDialogOpen, setIsImportStudentsDialogOpen] = useState(false);
  const [isImportTransactionsDialogOpen, setIsImportTransactionsDialogOpen] = useState(false);
  const [isPrintListDialogOpen, setIsPrintListDialogOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [admissionDateFilter, setAdmissionDateFilter] = useState<Date | undefined>();

  const fetchSchoolData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const schoolData = await getSchoolById(schoolId);
      if (schoolData && schoolData.adminUids.includes(user.uid)) {
        setIsAdminForSchool(true);
        setSchool(schoolData);
        const [studentsData, classesData] = await Promise.all([
          getSchoolSubcollectionItems<Student>(schoolId, 'students'),
          getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        ]);
        setAllStudents(studentsData);
        setSchoolClasses(classesData);
      } else {
        setIsAdminForSchool(false);
        toast({ variant: "destructive", title: "Access Denied" });
        router.push(`/school/dashboard/${schoolId}`);
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to load school data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router]);

  useEffect(() => {
    if (!authLoading) {
      fetchSchoolData();
    }
  }, [authLoading, fetchSchoolData]);
  
  const handleAddStudent = () => {
    setEditingStudent(null);
    setIsFormOpen(true);
  };
  
  const handleEditStudent = (student: Student) => {
    setEditingStudent(student);
    setIsFormOpen(true);
  };

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!window.confirm(`Are you sure you want to delete ${studentName}? This will remove the student and all associated financial records permanently.`)) return;

    try {
      await deleteSchoolSubcollectionItem(schoolId, 'students', studentId);
      toast({ title: "Student Deleted", description: `${studentName} has been removed from the system.` });
      fetchSchoolData(); // Re-fetch all data
    } catch (error) {
      console.error("Error deleting student:", error);
      toast({ variant: "destructive", title: "Delete Failed", description: "Could not remove the student." });
    }
  };

  const getClassName = (classId: string) => {
    const foundClass = schoolClasses.find(c => c.id === classId);
    return foundClass ? (foundClass.code ? `${foundClass.class} (${foundClass.code})` : foundClass.class) : 'Unknown Class';
  };

  const filteredStudents = useMemo(() => {
    let studentsToProcess = [...allStudents];

    if (searchTerm.trim()) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      studentsToProcess = studentsToProcess.filter(student =>
        `${student.firstName} ${student.middleName || ''} ${student.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
        student.studentRegistrationNumber.toLowerCase().includes(lowerSearchTerm)
      );
    }

    if (admissionDateFilter) {
      studentsToProcess = studentsToProcess.filter(student => {
        if (!student.admissionDate) return false;
        let studentAdmissionDate: Date;
        if (typeof student.admissionDate === 'string') {
          studentAdmissionDate = parseISO(student.admissionDate);
        } else if (student.admissionDate instanceof Timestamp) {
          studentAdmissionDate = student.admissionDate.toDate();
        } else {
          studentAdmissionDate = student.admissionDate as Date;
        }
        return isValid(studentAdmissionDate) && isSameDay(studentAdmissionDate, admissionDateFilter);
      });
    }
    
    return studentsToProcess.sort((a,b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));

  }, [allStudents, searchTerm, admissionDateFilter]);


  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  if (!isAdminForSchool) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar bg-background p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">You do not have permission to manage students for this school.</p>
        <Button onClick={() => router.push(`/school/dashboard/${schoolId}`)} variant="outline">Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle>Student Directory ({filteredStudents.length})</CardTitle>
              <CardDescription>View, search, and manage all registered students in {school?.name}.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setIsPrintListDialogOpen(true)} variant="outline" size="sm">
                <Printer className="mr-2 h-4 w-4"/> Print Lists
              </Button>
              <Button onClick={() => setIsImportStudentsDialogOpen(true)} variant="outline" size="sm">
                <Upload className="mr-2 h-4 w-4"/> Import Students
              </Button>
              <Button onClick={handleAddStudent} size="sm">
                <PlusCircle className="mr-2 h-4 w-4"/> Add Student
              </Button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full mt-4 pt-4 border-t">
              <div className="relative flex-grow">
                <Input
                    type="search"
                    placeholder="Search by name or registration no..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9 text-sm"
                />
                <SearchIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <div className="w-full sm:w-auto">
                 <DatePicker date={admissionDateFilter} onDateChange={setAdmissionDateFilter} buttonClassName="h-9 text-xs w-full" buttonLabel="Filter by Admission Date" />
              </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Fee Balance (UGX)</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.length > 0 ? filteredStudents.map(student => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={student.photoUrl || undefined} alt={`${student.firstName} ${student.lastName}`} />
                          <AvatarFallback>{getInitials(student.firstName, student.lastName)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <span className="font-medium text-sm">{`${student.firstName} ${student.middleName || ''} ${student.lastName}`}</span>
                            <div className="text-xs text-muted-foreground">{student.studentRegistrationNumber}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{getClassName(student.classId)}</TableCell>
                    <TableCell><Badge variant={student.status === 'Active' ? 'default' : 'secondary'}>{student.status}</Badge></TableCell>
                    <TableCell className={`text-right text-sm font-semibold ${(student.feeBalance || 0) > 0 ? 'text-destructive' : ((student.feeBalance || 0) < 0 ? 'text-green-600' : 'text-foreground')}`}>
                      {(student.feeBalance || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                       <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" title="Actions"><MoreVertical className="h-4 w-4" /><span className="sr-only">Student Actions</span></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/school/dashboard/${schoolId}/fees/manage-student/${student.id}`)}><Banknote className="mr-2 h-4 w-4" /> Manage Fees</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/school/dashboard/${schoolId}/students/${student.id}/pay-requirements`)}><Receipt className="mr-2 h-4 w-4"/> Pay Requirements</DropdownMenuItem>
                             <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleEditStudent(student)}><Edit className="mr-2 h-4 w-4" /> Edit Details</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteStudent(student.id, `${student.firstName} ${student.lastName}`)} className="text-destructive focus:text-destructive focus:bg-destructive/10"><Trash2 className="mr-2 h-4 w-4" /> Delete Student</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">{searchTerm || admissionDateFilter ? "No students match your search/filter." : "No students found."}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {school && (
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
      {school && schoolClasses && (
        <>
            <ImportStudentsDialog 
                isOpen={isImportStudentsDialogOpen}
                onOpenChange={setIsImportStudentsDialogOpen}
                school={school}
                schoolClasses={schoolClasses}
                onImportCompleted={fetchSchoolData}
            />
             <ImportFeeTransactionsDialog
                isOpen={isImportTransactionsDialogOpen}
                onOpenChange={setIsImportTransactionsDialogOpen}
                schoolId={school.id}
                schoolClasses={schoolClasses}
            />
            <PrintStudentListDialog
              isOpen={isPrintListDialogOpen}
              onOpenChange={setIsPrintListDialogOpen}
              school={school}
              schoolClasses={schoolClasses}
              allStudents={allStudents}
            />
        </>
      )}
    </>
  );
}
