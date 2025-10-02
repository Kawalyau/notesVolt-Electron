
// src/app/school/dashboard/[schoolId]/schoolpay/export-students/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react'; // Added useMemo
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, updateStudentInSchool } from '@/services/schoolService';
import { firestore, functions } from '@/config/firebase';
import { httpsCallable } from 'firebase/functions';
import { serverTimestamp, where, Timestamp } from 'firebase/firestore';
import type { School, Student, SchoolClass, AppTimestamp } from '@/types/school';
import { format, parseISO, isValid as isDateValid, isSameDay } from 'date-fns'; // Added isSameDay, isValid
import * as XLSX from 'xlsx';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Users, Filter, RefreshCcw, AlertTriangle, ShieldAlert, Download, Upload, CalendarDays } from 'lucide-react'; // Added CalendarDays
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ImportSchoolPayIdsDialog } from '@/components/school/import-schoolpay-ids-dialog';
import { DatePicker } from '@/components/ui/date-picker'; // Import DatePicker

interface StudentToExport extends Student {
  schoolPaySyncAttemptStatus?: 'pending' | 'success' | 'failed';
  schoolPaySyncAttemptMessage?: string;
  displayClassCode?: string;
  displayFormattedDOB?: string;
  displayGender?: 'M' | 'F' | 'O';
}

export default function ExportStudentsToSchoolPayPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [studentsToDisplay, setStudentsToDisplay] = useState<StudentToExport[]>([]); 
  const [allStudentsForSchool, setAllStudentsForSchool] = useState<Student[]>([]); 

  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [admissionDateFilter, setAdmissionDateFilter] = useState<Date | undefined>(); // State for DatePicker
  const [isLoadingSchoolData, setIsLoadingSchoolData] = useState(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImportSchoolPayIdsDialogOpen, setIsImportSchoolPayIdsDialogOpen] = useState(false);


  const fetchSchoolAndClasses = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoadingSchoolData(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" }); router.push(`/school/dashboard/${schoolId}`); return;
      }
      setSchool(fetchedSchool);
      const [classes, allStudents] = await Promise.all([
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        getSchoolSubcollectionItems<Student>(schoolId, 'students')
      ]);
      setSchoolClasses(classes.sort((a, b) => (a.class || "").localeCompare(b.class || "")));
      setAllStudentsForSchool(allStudents);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load school or class data." });
      console.error("Error fetching school/class data:", error);
    } finally {
      setIsLoadingSchoolData(false);
    }
  }, [schoolId, user, toast, router]);

  useEffect(() => {
    if (!authLoading) fetchSchoolAndClasses();
  }, [authLoading, fetchSchoolAndClasses]);

  const handleLoadStudents = async () => {
    if (!selectedClassId) { toast({ title: "Select a Class", description: "Please choose a class to load students." }); return; }
    if (!school) { toast({ variant: "destructive", title: "Error", description: "School data not available." }); return; }

    setIsLoadingStudents(true);
    setStudentsToDisplay([]); 
    try {
      const studentsWithoutIdInClass = allStudentsForSchool.filter(s => s.classId === selectedClassId && !s.schoolPayStudentId);
      
      const studentsWithDisplayData = studentsWithoutIdInClass.map(s => {
        const studentClass = schoolClasses.find(c => c.id === s.classId);
        let formattedDob: string | null = null;
        try {
          if (s.dateOfBirth) {
            const dob = typeof s.dateOfBirth === 'string' ? parseISO(s.dateOfBirth) : (s.dateOfBirth as Timestamp).toDate();
            if(isDateValid(dob)) formattedDob = format(dob, 'yyyy-MM-dd');
          }
        } catch (e) { console.warn("Could not format DOB for student", s.id, s.dateOfBirth); }
        
        let displayGender: 'M' | 'F' | 'O' | undefined = undefined;
        if (s.gender) {
            const lowerGender = s.gender.toLowerCase();
            if (lowerGender === 'male') displayGender = 'M';
            else if (lowerGender === 'female') displayGender = 'F';
            else if (lowerGender === 'other') displayGender = 'O';
        }

        return {
          ...s,
          schoolPaySyncAttemptStatus: s.schoolPaySyncStatus?.toLowerCase() as StudentToExport['schoolPaySyncAttemptStatus'] || 'pending',
          schoolPaySyncAttemptMessage: s.schoolPaySyncMessage || undefined,
          displayClassCode: studentClass?.code || studentClass?.class || "N/A_ERR",
          displayFormattedDOB: formattedDob || "N/A_ERR", 
          displayGender: displayGender || 'O', 
        };
      });
      setStudentsToDisplay(studentsWithDisplayData);
      if (studentsWithDisplayData.length === 0) {
        toast({ title: "No Students Found", description: "No students in this class are pending SchoolPay ID assignment or all have IDs already." });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load students for the selected class." });
      console.error("Error loading students:", error);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const handleSyncAllStudents = async () => {
    if (!school || studentsToDisplay.length === 0) {
      toast({ title: "No Students", description: "No students loaded to sync." }); return;
    }
    if (!school.schoolPayConfig?.schoolCode || !school.schoolPayConfig?.password) {
      toast({ variant: "destructive", title: "SchoolPay Not Configured", description: "Please set up SchoolPay School Code and Password in settings." }); return;
    }
    setIsSyncing(true);
    toast({ title: "Bulk Sync Started", description: `Attempting to sync ${studentsToDisplay.length} students with SchoolPay...`});
    const syncFunction = httpsCallable(functions, 'syncStudentWithSchoolPay');

    const updatedStudentsList = [...studentsToDisplay];

    for (let i = 0; i < updatedStudentsList.length; i++) {
      const student = updatedStudentsList[i];

      const classCode = student.displayClassCode;
      const dobForApi = student.displayFormattedDOB;
      const genderForApi = student.displayGender;

      if (classCode === "N/A_ERR" || dobForApi === "N/A_ERR") {
        updatedStudentsList[i] = { ...student, schoolPaySyncAttemptStatus: 'failed', schoolPaySyncAttemptMessage: 'Missing critical class or DOB for API.' };
        setStudentsToDisplay([...updatedStudentsList]);
        continue;
      }

      const payload = {
        schoolId: school.id,
        studentRegistrationNumber: student.studentRegistrationNumber,
        firstName: student.firstName,
        middleName: student.middleName || "",
        lastName: student.lastName,
        classCode: classCode,
        guardianPhone: student.guardianPhone || "",
        gender: genderForApi,
        dateOfBirth: dobForApi,
      };

      try {
        const result = await syncFunction(payload);
        const { success, message } = result.data as { success: boolean; message: string };
        updatedStudentsList[i] = { ...student, schoolPaySyncAttemptStatus: success ? 'success' : 'failed', schoolPaySyncAttemptMessage: message };

        await updateStudentInSchool(schoolId, student.id, {
            schoolPaySyncedAt: serverTimestamp() as AppTimestamp,
            schoolPaySyncStatus: success ? 'Success' : 'Failed',
            schoolPaySyncMessage: message,
        });
      } catch (error: any) {
        const errorMessage = error.message || "Cloud function call failed.";
        updatedStudentsList[i] = { ...student, schoolPaySyncAttemptStatus: 'failed', schoolPaySyncAttemptMessage: errorMessage };
        if (student.id && schoolId) { 
            await updateStudentInSchool(schoolId, student.id, {
                schoolPaySyncedAt: serverTimestamp() as AppTimestamp,
                schoolPaySyncStatus: 'Failed',
                schoolPaySyncMessage: errorMessage,
            }).catch(updateError => console.error("Failed to update student doc after sync error:", updateError));
        }
      }
      setStudentsToDisplay([...updatedStudentsList]); 
    }
    toast({ title: "Sync Complete", description: "All selected students processed. Check status column for details." });
    setIsSyncing(false);
  };

  const handleExportForSchoolPay = () => {
    const studentsForActualExport = displayableStudents; // Use the filtered list
    if (studentsForActualExport.length === 0) {
      toast({ title: "No Students", description: "No students matching criteria (or none needing SchoolPay IDs) to export." });
      return;
    }

    const dataForExport = studentsForActualExport.map(student => {
      let dobForExport: string | null = null;
      try {
        if (student.dateOfBirth) {
          const dob = typeof student.dateOfBirth === 'string' ? parseISO(student.dateOfBirth) : (student.dateOfBirth as Timestamp).toDate();
          if (isDateValid(dob)) dobForExport = format(dob, 'yyyy-MM-dd');
        }
      } catch (e) { console.warn("Could not format DOB for export for student", student.id, student.dateOfBirth); }
      
      let genderForExport: 'M' | 'F' | 'O' | null = null; 
      if (student.gender) {
        const lowerGender = student.gender.toLowerCase();
        if (lowerGender === 'male') genderForExport = 'M';
        else if (lowerGender === 'female') genderForExport = 'F';
        else if (lowerGender === 'other') genderForExport = 'O';
      }
      
      let dayBoardingForExport: 'D' | 'B' = 'D'; 
      if (student.dayBoardingStatus) {
          const lowerStatus = String(student.dayBoardingStatus).toLowerCase();
          if (lowerStatus === 'boarder' || lowerStatus === 'boarding') {
              dayBoardingForExport = 'B';
          }
      }

      return {
        last_name: student.lastName || null,
        first_name: student.firstName || null,
        middle_name: student.middleName || null,
        date_of_birth: dobForExport,
        reg_no: student.studentRegistrationNumber || null,
        gender: genderForExport,
        student_email: student.email || null,
        student_phone: student.phoneNumber || null,
        nationality: "Uganda", 
        disability: false, 
        disability_nature: student.disabilityNature || null,
        guardian_name: student.guardianName || null,
        guardian_relation: student.guardianRelation || null,
        guardian_email: student.guardianEmail || null,
        guardian_phone: student.guardianPhone || null,
        day_boarding: dayBoardingForExport,
      };
    });
    
    const headers = [
        "last_name", "first_name", "middle_name", "date_of_birth", "reg_no", "gender",
        "student_email", "student_phone", "nationality", "disability", "disability_nature",
        "guardian_name", "guardian_relation", "guardian_email", "guardian_phone", "day_boarding"
    ];

    const worksheet = XLSX.utils.json_to_sheet(dataForExport, { header: headers, skipHeader: false });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "StudentsForSchoolPay");
    XLSX.writeFile(workbook, `SchoolPay_Export_Students_Without_IDs_${school?.name?.replace(/\s+/g, '_')}_${selectedClassId ? schoolClasses.find(c=>c.id === selectedClassId)?.class : 'AllClasses'}_${format(new Date(), 'yyyyMMddHHmmss')}.xlsx`);
    toast({ title: "Export Successful", description: "Student list (without SchoolPay IDs) exported." });
  };


  const getStatusBadgeVariant = (status?: StudentToExport['schoolPaySyncAttemptStatus'] | Student['schoolPaySyncStatus']) => {
    const lowerStatus = status?.toLowerCase();
    if (lowerStatus === 'success') return 'default'; 
    if (lowerStatus === 'failed') return 'destructive'; 
    return 'secondary'; 
  };

  const displayableStudents = useMemo(() => {
    if (!admissionDateFilter) return studentsToDisplay;
    return studentsToDisplay.filter(student => {
      if (!student.admissionDate) return false; // Ensure admissionDate exists
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
  }, [studentsToDisplay, admissionDateFilter]);

  if (isLoadingSchoolData || authLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-15rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
   if (!school) {
     return <div className="text-center p-6"><ShieldAlert className="h-12 w-12 mx-auto mb-3 text-destructive"/>School data not found or access denied.</div>;
   }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
            <div>
              <CardTitle className="text-2xl flex items-center"><Users className="mr-3 h-6 w-6 text-primary"/>Export Students to SchoolPay</CardTitle>
              <CardDescription>Select a class, load students currently lacking a SchoolPay ID, then sync or export the list.</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button onClick={handleExportForSchoolPay} variant="outline" size="sm" disabled={displayableStudents.length === 0 || isSyncing}>
                <Download className="mr-2 h-4 w-4"/> Export List (Without IDs)
              </Button>
              <Button onClick={() => setIsImportSchoolPayIdsDialogOpen(true)} variant="outline" size="sm">
                <Upload className="mr-2 h-4 w-4"/> Import SchoolPay IDs
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="flex-grow sm:max-w-xs">
              <Label htmlFor="class-select" className="text-sm font-medium text-muted-foreground">Select Class*</Label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId} disabled={schoolClasses.length === 0}>
                <SelectTrigger id="class-select" className="h-9 mt-1">
                  <SelectValue placeholder={schoolClasses.length === 0 ? "No classes defined" : "Choose a class"} />
                </SelectTrigger>
                <SelectContent>
                  {schoolClasses.map(cls => <SelectItem key={cls.id} value={cls.id}>{cls.code ? `${cls.class} (${cls.code})` : cls.class}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-grow sm:max-w-xs">
              <Label htmlFor="admission-date-filter" className="text-sm font-medium text-muted-foreground">Filter by Admission Date</Label>
              <DatePicker date={admissionDateFilter} onDateChange={setAdmissionDateFilter} buttonClassName="h-9 mt-1 w-full" />
            </div>
            <Button onClick={handleLoadStudents} disabled={!selectedClassId || isLoadingStudents || isSyncing} className="h-9 w-full sm:w-auto">
              {isLoadingStudents ? <Loader2 className="animate-spin mr-2"/> : <Filter className="mr-2 h-4 w-4"/>}
              {isLoadingStudents ? "Loading..." : "Load Students (Without IDs)"}
            </Button>
          </div>

          {isLoadingStudents && <div className="flex justify-center py-4"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}

          {displayableStudents.length > 0 && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button onClick={handleSyncAllStudents} disabled={isSyncing || isLoadingStudents} className="bg-primary hover:bg-primary/90">
                  {isSyncing ? <Loader2 className="animate-spin mr-2"/> : <RefreshCcw className="mr-2 h-4 w-4"/>}
                  {isSyncing ? "Syncing All..." : `Sync All (${displayableStudents.length}) with SchoolPay`}
                </Button>
              </div>
              <div className="overflow-x-auto border rounded-md">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Student Name</TableHead>
                    <TableHead className="text-xs">Reg. No.</TableHead>
                    <TableHead className="text-xs">Class Code (API)</TableHead>
                    <TableHead className="text-xs">DOB (API)</TableHead>
                    <TableHead className="text-xs">Gender (API)</TableHead>
                    <TableHead className="text-xs">Current SchoolPay ID</TableHead>
                    <TableHead className="text-xs">Sync Status (This Session)</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {displayableStudents.map(student => (
                      <TableRow key={student.id}>
                        <TableCell className="text-xs font-medium">{student.firstName} {student.lastName}</TableCell>
                        <TableCell className="text-xs">{student.studentRegistrationNumber}</TableCell>
                        <TableCell className="text-xs">{student.displayClassCode}</TableCell>
                        <TableCell className="text-xs">{student.displayFormattedDOB}</TableCell>
                        <TableCell className="text-xs">{student.displayGender}</TableCell>
                        <TableCell className="text-xs">{student.schoolPayStudentId || 'Not Set'}</TableCell>
                        <TableCell className="text-xs">
                           <Badge variant={getStatusBadgeVariant(student.schoolPaySyncAttemptStatus)} className="capitalize">
                            {student.schoolPaySyncAttemptStatus || 'Pending'}
                           </Badge>
                           {student.schoolPaySyncAttemptMessage && <p className="text-[10px] text-muted-foreground truncate max-w-[150px]" title={student.schoolPaySyncAttemptMessage}>{student.schoolPaySyncAttemptMessage}</p>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          {displayableStudents.length === 0 && !isLoadingStudents && selectedClassId && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {admissionDateFilter ? "No students found matching the selected class and admission date that are missing a SchoolPay ID." : "No students found for the selected class that are missing a SchoolPay ID."}
            </p>
          )}
           {(!school?.schoolPayConfig?.schoolCode || !school?.schoolPayConfig?.password) && (
             <div className="flex items-center text-sm text-destructive mt-2">
                <AlertTriangle className="inline h-4 w-4 mr-1"/>
                SchoolPay School Code or Password not configured in school settings. Syncing will fail.
             </div>
          )}
        </CardContent>
      </Card>
      <ImportSchoolPayIdsDialog
        isOpen={isImportSchoolPayIdsDialogOpen}
        onOpenChange={setIsImportSchoolPayIdsDialogOpen}
        schoolId={schoolId}
        allStudents={allStudentsForSchool}
        schoolClasses={schoolClasses} 
        onImportCompleted={() => {
          fetchSchoolAndClasses().then(() => {
            if (selectedClassId) {
              handleLoadStudents();
            }
          });
        }}
      />
    </div>
  );
}
