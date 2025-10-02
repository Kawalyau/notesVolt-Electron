// src/app/school/dashboard/[schoolId]/teachers/directory/page.tsx
"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { getSchoolById, getSchoolSubcollectionItems, deleteSchoolSubcollectionItem } from '@/services/schoolService';
import type { School, Teacher } from '@/types/school';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, PlusCircle, Edit, Trash2, ShieldAlert, UserCircle, Search as SearchIcon, MoreVertical, Banknote } from 'lucide-react';
import { TeacherFormDialog } from '@/components/school/teacher-form-dialog';
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
} from "@/components/ui/dropdown-menu";

const getInitials = (firstName?: string, lastName?: string) => {
  if (!firstName && !lastName) return "S";
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
};

export default function TeacherDirectoryPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminForSchool, setIsAdminForSchool] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchTeachers = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const schoolData = await getSchoolById(schoolId);
      if (schoolData && schoolData.adminUids.includes(user.uid)) {
        setIsAdminForSchool(true);
        const teachersData = await getSchoolSubcollectionItems<Teacher>(schoolId, 'teachers');
        setAllTeachers(teachersData);
      } else {
        setIsAdminForSchool(false);
        toast({ variant: "destructive", title: "Access Denied" });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to load teacher data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast]);

  useEffect(() => {
    if (!authLoading) {
      fetchTeachers();
    }
  }, [authLoading, fetchTeachers]);

  const filteredTeachers = useMemo(() => {
    if (!searchTerm) return allTeachers;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return allTeachers.filter(teacher =>
      `${teacher.firstName} ${teacher.lastName}`.toLowerCase().includes(lowerSearchTerm) ||
      (teacher.email && teacher.email.toLowerCase().includes(lowerSearchTerm))
    );
  }, [allTeachers, searchTerm]);

  const handleAddTeacher = () => {
    setEditingTeacher(null);
    setIsFormOpen(true);
  };

  const handleEditTeacher = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setIsFormOpen(true);
  };

  const handleDeleteTeacher = async (teacherId: string) => {
    if (!window.confirm("Are you sure you want to delete this teacher? This action cannot be undone.")) return;
    try {
      await deleteSchoolSubcollectionItem(schoolId, 'teachers', teacherId);
      toast({ title: "Teacher Deleted", description: "The staff member has been removed from the system." });
      fetchTeachers(); // Re-fetch to update the list
    } catch (error) {
      console.error("Error deleting teacher:", error);
      toast({ variant: "destructive", title: "Delete Failed", description: "Could not remove the teacher." });
    }
  };
  
  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  if (!isAdminForSchool) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar bg-background p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">You do not have permission to manage staff for this school.</p>
        <Button onClick={() => router.push(`/school/dashboard/${schoolId}`)} variant="outline">Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle>Teachers & Staff Directory ({filteredTeachers.length})</CardTitle>
              <CardDescription>Manage all teaching and non-teaching staff.</CardDescription>
            </div>
            <Button onClick={handleAddTeacher} size="sm">
              <PlusCircle className="mr-2 h-4 w-4"/> Add New Staff
            </Button>
          </div>
          <div className="relative mt-4">
            <Input
              type="search"
              placeholder="Search by name or email..."
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
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                     <TableHead className="text-right">Base Salary (UGX)</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTeachers.length > 0 ? filteredTeachers.map(teacher => (
                  <TableRow key={teacher.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={teacher.photoUrl || undefined} />
                          <AvatarFallback>{getInitials(teacher.firstName, teacher.lastName)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm">{`${teacher.firstName} ${teacher.lastName}`}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{teacher.email || 'N/A'}</div>
                      <div className="text-xs text-muted-foreground">{teacher.phone || 'N/A'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={teacher.status === 'Active' ? 'default' : 'secondary'}>{teacher.status}</Badge>
                    </TableCell>
                     <TableCell className="text-right font-mono text-sm">
                        {teacher.baseSalary ? teacher.baseSalary.toLocaleString() : 'Not Set'}
                    </TableCell>
                    <TableCell className="text-right">
                       <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" title="Actions">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Staff Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/school/dashboard/${schoolId}/teachers/${teacher.id}/account`)}>
                              <Banknote className="mr-2 h-4 w-4" /> Payment Account
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditTeacher(teacher)}>
                              <Edit className="mr-2 h-4 w-4" /> Edit Details & Salary
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteTeacher(teacher.id)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete Staff
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No teachers found.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <TeacherFormDialog 
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        schoolId={schoolId}
        initialData={editingTeacher}
        onTeacherSaved={fetchTeachers}
      />
    </div>
  );
}
