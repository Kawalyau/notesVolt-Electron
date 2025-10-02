// src/app/school/dashboard/[schoolId]/fees/manage-student/page.tsx
"use client";

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services/schoolService';
import type { School, Student, SchoolClass } from '@/types/school';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, ShieldAlert, UserCircle, Search as SearchIcon } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';

const getInitials = (firstName?: string, lastName?: string) => {
  if (!firstName && !lastName) return "S";
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
};

export default function SelectStudentForFeesPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdminForSchool, setIsAdminForSchool] = useState(false);

  useEffect(() => {
    if (authLoading || !user || !schoolId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const schoolData = await getSchoolById(schoolId);
        if (schoolData && schoolData.adminUids.includes(user.uid)) {
          setIsAdminForSchool(true);
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
        toast({ variant: "destructive", title: "Error", description: "Failed to load data." });
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [schoolId, user, authLoading, router, toast]);

  const filteredStudents = useMemo(() => {
    if (!searchTerm) return [];
    const lowerSearchTerm = searchTerm.toLowerCase();
    return allStudents.filter(student =>
      `${student.firstName} ${student.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
      student.studentRegistrationNumber.toLowerCase().includes(lowerSearchTerm)
    );
  }, [allStudents, searchTerm]);

  const getClassName = (classId: string) => {
    return schoolClasses.find(c => c.id === classId)?.class || 'N/A';
  };

  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  if (!isAdminForSchool) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar bg-background p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">You do not have permission to access this module.</p>
        <Button onClick={() => router.push(`/school/dashboard/${schoolId}`)} variant="outline">Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Student to Manage Fees</CardTitle>
        <CardDescription>Search for a student by name or registration number to view and manage their fee transactions.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative mb-4">
          <Input
            type="search"
            placeholder="Start typing to search for a student..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
          <SearchIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        </div>
        
        <div className="overflow-x-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {searchTerm && isLoading ? (
                <TableRow><TableCell colSpan={3} className="text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
              ) : searchTerm && filteredStudents.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No students match your search.</TableCell></TableRow>
              ) : searchTerm ? (
                filteredStudents.map(student => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={student.photoUrl || undefined} />
                          <AvatarFallback>{getInitials(student.firstName, student.lastName)}</AvatarFallback>
                        </Avatar>
                        <span>{`${student.firstName} ${student.lastName}`} ({student.studentRegistrationNumber})</span>
                      </div>
                    </TableCell>
                    <TableCell>{getClassName(student.classId)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/school/dashboard/${schoolId}/fees/manage-student/${student.id}`}>
                          Manage Fees
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                 <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Please type in the search box to find a student.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
