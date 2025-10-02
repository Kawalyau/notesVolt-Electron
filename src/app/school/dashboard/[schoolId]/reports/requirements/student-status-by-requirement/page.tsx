
// src/app/school/dashboard/[schoolId]/reports/requirements/student-status-by-requirement/page.tsx
"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getSchoolById, getSchoolSubcollectionItems, getStudentRequirementStatus } from '@/services/schoolService';
import type { School, Student, PhysicalRequirement, StudentRequirementStatus, SchoolClass } from '@/types/school';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, Filter, Users, ShieldAlert, UserCircle, PackageSearch } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface StudentReportItem extends Student {
  requirementStatus?: StudentRequirementStatus;
  calculatedPhysicalBalance: number;
  calculatedMonetaryBalance: number;
}

const getInitials = (firstName?: string, lastName?: string) => {
  if (!firstName && !lastName) return "S";
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
};


export default function StudentStatusByRequirementReportPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [allPhysicalRequirements, setAllPhysicalRequirements] = useState<PhysicalRequirement[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminForSchool, setIsAdminForSchool] = useState(false);
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<StudentReportItem[]>([]);

  const fetchInitialData = useCallback(async () => {
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
      setAllPhysicalRequirements(requirementsData);
      setSchoolClasses(classesData);

    } catch (error) {
      console.error("Error fetching initial data for report:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load initial report data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    const generateReportForSelectedRequirement = async () => {
      if (!selectedRequirementId || !allStudents.length || !allPhysicalRequirements.length) {
        setReportData([]);
        return;
      }
      setIsLoading(true);
      const selectedReq = allPhysicalRequirements.find(r => r.id === selectedRequirementId);
      if (!selectedReq) {
        setReportData([]);
        setIsLoading(false);
        return;
      }

      const applicableStudents = allStudents.filter(student => {
        if (selectedReq.assignmentType === 'class' && selectedReq.applicableClassIds?.includes(student.classId)) return true;
        if (selectedReq.assignmentType === 'optional_general') return true;
        // Add 'individual_specific' logic if assignment mechanism exists
        return false;
      });

      const studentReportItems: StudentReportItem[] = await Promise.all(
        applicableStudents.map(async student => {
          const status = await getStudentRequirementStatus(schoolId, student.id, selectedReq.id);
          const unitPrice = selectedReq.price || 0;
          const qtyNeeded = selectedReq.quantityPerStudent || 1;
          const qtyProvided = status?.quantityProvided || 0;
          const amountPaid = status?.amountPaid || 0;

          const physicalQtyStillDue = Math.max(0, qtyNeeded - qtyProvided);
          const valueOfPhysicalItemsStillDue = physicalQtyStillDue * unitPrice;
          const netMonetaryBalanceDue = Math.max(0, valueOfPhysicalItemsStillDue - amountPaid);

          return {
            ...student,
            requirementStatus: status || undefined,
            calculatedPhysicalBalance: physicalQtyStillDue,
            calculatedMonetaryBalance: netMonetaryBalanceDue,
          };
        })
      );
      setReportData(studentReportItems);
      setIsLoading(false);
    };

    generateReportForSelectedRequirement();
  }, [selectedRequirementId, allStudents, allPhysicalRequirements, schoolId, schoolClasses]);


  if (authLoading || (isLoading && !school)) { // Show loader until school is loaded
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

  const selectedReqDetails = allPhysicalRequirements.find(r => r.id === selectedRequirementId);

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex-grow">
              <CardTitle className="text-2xl flex items-center"><FileText className="mr-3 h-6 w-6 text-primary"/>Student Status (Per Requirement)</CardTitle>
              <CardDescription>Select a requirement to view its status for all applicable students in {school?.name || 'the school'}.</CardDescription>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[250px]">
              <Select
                value={selectedRequirementId || ""}
                onValueChange={(value) => setSelectedRequirementId(value === "_NONE_" ? null : value)}
                disabled={isLoading || allPhysicalRequirements.length === 0}
              >
                <SelectTrigger className="h-9 text-sm">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground"/>
                  <SelectValue placeholder="Select a Requirement Item" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={"_NONE_"}>-- Select a Requirement --</SelectItem>
                  {allPhysicalRequirements.map(req => (
                    <SelectItem key={req.id} value={req.id}>
                      {req.name} {req.category ? `(${req.category})` : ''}
                    </SelectItem>
                  ))}
                   {allPhysicalRequirements.length === 0 && <SelectItem value="_EMPTY_" disabled>No requirements defined</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && selectedRequirementId ? (
             <div className="flex justify-center items-center py-10"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
          ) : !selectedRequirementId ? (
            <div className="text-center py-10 text-muted-foreground">
                <PackageSearch className="h-12 w-12 mx-auto mb-3"/>
                <p>Please select a requirement item from the dropdown above to view the report.</p>
            </div>
          ) : reportData.length === 0 ? (
             <div className="text-center py-10 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3"/>
                <p>No students are assigned or applicable to the selected requirement: <span className="font-semibold text-foreground">{selectedReqDetails?.name}</span>.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
               <h3 className="text-lg font-semibold mb-3">Report for: <span className="text-primary">{selectedReqDetails?.name}</span></h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Reg. No.</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-center">Qty Needed</TableHead>
                    <TableHead className="text-center">Qty Provided</TableHead>
                    <TableHead className="text-center">Phys. Bal.</TableHead>
                    <TableHead className="text-right">Amt Paid (UGX)</TableHead>
                    <TableHead className="text-right">Mon. Bal. (UGX)</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((studentItem) => {
                    const reqStatus = studentItem.requirementStatus;
                    const className = schoolClasses.find(c => c.id === studentItem.classId)?.name || 'N/A';
                    return (
                      <TableRow key={studentItem.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={studentItem.photoUrl || undefined} alt={`${studentItem.firstName} ${studentItem.lastName}`} />
                              <AvatarFallback>{getInitials(studentItem.firstName, studentItem.lastName)}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-xs">{studentItem.firstName} {studentItem.lastName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{studentItem.studentRegistrationNumber}</TableCell>
                        <TableCell className="text-xs">{className}</TableCell>
                        <TableCell className="text-center text-xs">{selectedReqDetails?.quantityPerStudent || 1}</TableCell>
                        <TableCell className="text-center text-xs">{reqStatus?.quantityProvided || 0}</TableCell>
                        <TableCell className="text-center text-xs font-semibold">{studentItem.calculatedPhysicalBalance}</TableCell>
                        <TableCell className="text-right text-xs">{(reqStatus?.amountPaid || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right text-xs font-semibold">{studentItem.calculatedMonetaryBalance.toFixed(2)}</TableCell>
                        <TableCell className="text-center text-xs">{reqStatus?.status || 'Pending'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

