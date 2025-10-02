
// src/app/school/dashboard/[schoolId]/reports/student-requirements/page.tsx
"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getSchoolById, getSchoolSubcollectionItems, getAllStudentRequirementStatuses } from '@/services/schoolService';
import type { School, Student, PhysicalRequirement, StudentRequirementStatus, SchoolClass } from '@/types/school';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from '@/components/ui/input'; // Added Input import
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Filter, PackageSearch, ShieldAlert, UserCircle, Search as SearchIcon } from 'lucide-react'; // Added SearchIcon
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const ALL_CLASSES_SENTINEL = "_ALL_CLASSES_";

interface StudentWithRequirements extends Student {
  detailedRequirements: Array<PhysicalRequirement & { status?: StudentRequirementStatus, calculatedBalance: number }>;
}

const getInitials = (firstName?: string, lastName?: string) => {
  if (!firstName && !lastName) return "S";
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
};

export default function StudentRequirementsReportPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [physicalRequirements, setPhysicalRequirements] = useState<PhysicalRequirement[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [allRequirementStatuses, setAllRequirementStatuses] = useState<Record<string, Record<string, StudentRequirementStatus>>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isAdminForSchool, setIsAdminForSchool] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>(ALL_CLASSES_SENTINEL);
  const [searchTerm, setSearchTerm] = useState(""); // State for search term

  const fetchReportData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" });
        router.push(`/school/dashboard/${schoolId}`);
        setIsAdminForSchool(false);
        return;
      }
      setSchool(fetchedSchool);
      setIsAdminForSchool(true);

      const [studentsData, requirementsData, classesData] = await Promise.all([
        getSchoolSubcollectionItems<Student>(schoolId, 'students'),
        getSchoolSubcollectionItems<PhysicalRequirement>(schoolId, 'physicalRequirements'),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
      ]);
      setAllStudents(studentsData);
      setPhysicalRequirements(requirementsData);
      setSchoolClasses(classesData);

      const statuses: Record<string, Record<string, StudentRequirementStatus>> = {};
      for (const student of studentsData) {
        const studentStatuses = await getAllStudentRequirementStatuses(schoolId, student.id);
        statuses[student.id] = studentStatuses.reduce((acc, st) => {
          acc[st.requirementId] = st;
          return acc;
        }, {} as Record<string, StudentRequirementStatus>);
      }
      setAllRequirementStatuses(statuses);

    } catch (error) {
      console.error("Error fetching student requirements report data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load report data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const filteredStudentsWithRequirements = useMemo((): StudentWithRequirements[] => {
    if (isLoading || !allStudents.length || !physicalRequirements.length) return [];

    let studentsToProcess = allStudents;

    // Filter by class
    if (selectedClassId !== ALL_CLASSES_SENTINEL) {
      studentsToProcess = studentsToProcess.filter(s => s.classId === selectedClassId);
    }

    // Filter by search term
    if (searchTerm.trim() !== "") {
      const lowerSearchTerm = searchTerm.toLowerCase();
      studentsToProcess = studentsToProcess.filter(s =>
        s.firstName.toLowerCase().includes(lowerSearchTerm) ||
        s.lastName.toLowerCase().includes(lowerSearchTerm) ||
        (s.middleName && s.middleName.toLowerCase().includes(lowerSearchTerm)) ||
        s.studentRegistrationNumber.toLowerCase().includes(lowerSearchTerm)
      );
    }

    return studentsToProcess.map(student => {
      const applicableCompulsoryReqs = physicalRequirements
        .filter(req =>
          req.isCompulsory &&
          (
            (req.assignmentType === 'class' && req.applicableClassIds?.includes(student.classId)) ||
            req.assignmentType === 'optional_general' 
          )
        );

      const detailedRequirements = applicableCompulsoryReqs.map(req => {
        const status = allRequirementStatuses[student.id]?.[req.id];
        const unitPrice = req.price || 0;
        const qtyNeeded = req.quantityPerStudent || 1;
        const qtyProvided = status?.quantityProvided || 0;
        const amountPaid = status?.amountPaid || 0;

        const physicalQtyStillDue = Math.max(0, qtyNeeded - qtyProvided);
        const valueOfPhysicalItemsStillDue = physicalQtyStillDue * unitPrice;
        const netMonetaryBalanceDue = Math.max(0, valueOfPhysicalItemsStillDue - amountPaid);
        
        return { ...req, status, calculatedBalance: netMonetaryBalanceDue };
      });
      return { ...student, detailedRequirements };
    });
  }, [allStudents, physicalRequirements, selectedClassId, searchTerm, allRequirementStatuses, isLoading]);


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
              <CardTitle className="text-2xl flex items-center"><Users className="mr-3 h-6 w-6 text-primary"/>Student Requirements Report</CardTitle>
              <CardDescription>Overview of compulsory requirement statuses for students in {school?.name || 'the school'}.</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-auto sm:min-w-[200px]">
                <Input
                  type="search"
                  placeholder="Search student name/reg..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
                <SearchIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <div className="w-full sm:w-auto sm:min-w-[200px]">
                <Select
                  value={selectedClassId}
                  onValueChange={(value) => setSelectedClassId(value)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <Filter className="mr-2 h-4 w-4 text-muted-foreground"/>
                    <SelectValue placeholder="Filter by Class: All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CLASSES_SENTINEL}>All Classes</SelectItem>
                    {schoolClasses.map(cls => (
                      <SelectItem key={cls.id} value={cls.id}>{cls.name} {cls.code ? `(${cls.code})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredStudentsWithRequirements.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <PackageSearch className="h-12 w-12 mx-auto mb-3"/>
              <p>{searchTerm ? "No students match your search criteria." : "No students or requirements data to display for the selected class."}</p>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full space-y-3">
              {filteredStudentsWithRequirements.map((student) => (
                <AccordionItem key={student.id} value={student.id} className="border bg-card rounded-lg shadow-sm">
                  <AccordionTrigger className="px-4 py-3 hover:bg-muted/50 rounded-t-lg">
                    <div className="flex items-center gap-3">
                       <Avatar className="h-9 w-9">
                          <AvatarImage src={student.photoUrl || undefined} alt={`${student.firstName} ${student.lastName}`} data-ai-hint="student avatar" />
                          <AvatarFallback>{getInitials(student.firstName, student.lastName)}</AvatarFallback>
                        </Avatar>
                      <div>
                        <div className="font-medium text-primary">{student.firstName} {student.middleName} {student.lastName}</div>
                        <div className="text-xs text-muted-foreground">Reg No: {student.studentRegistrationNumber} | Class: {schoolClasses.find(c => c.id === student.classId)?.name || 'N/A'}</div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 py-3 border-t">
                    {student.detailedRequirements.length === 0 ? (
                       <p className="text-sm text-muted-foreground py-2">No compulsory requirements applicable or assigned to this student.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Requirement</TableHead>
                              <TableHead className="text-right text-xs">Qty Needed</TableHead>
                              <TableHead className="text-right text-xs">Qty Provided</TableHead>
                              <TableHead className="text-right text-xs">Phys. Balance</TableHead>
                              <TableHead className="text-right text-xs">Amount Paid (UGX)</TableHead>
                              <TableHead className="text-right text-xs font-semibold">Monetary Bal. (UGX)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {student.detailedRequirements.map((req) => {
                              const status = req.status;
                              const qtyNeeded = req.quantityPerStudent || 1;
                              const qtyProvided = status?.quantityProvided || 0;
                              const amountPaid = status?.amountPaid || 0;
                              const physBalance = Math.max(0, qtyNeeded - qtyProvided);
                              return (
                                <TableRow key={req.id}>
                                  <TableCell className="text-xs py-1.5">{req.name}</TableCell>
                                  <TableCell className="text-right text-xs py-1.5">{qtyNeeded}</TableCell>
                                  <TableCell className="text-right text-xs py-1.5">{qtyProvided}</TableCell>
                                  <TableCell className="text-right text-xs py-1.5">{physBalance}</TableCell>
                                  <TableCell className="text-right text-xs py-1.5">{amountPaid.toFixed(2)}</TableCell>
                                  <TableCell className="text-right text-xs py-1.5 font-semibold">{req.calculatedBalance.toFixed(2)}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

