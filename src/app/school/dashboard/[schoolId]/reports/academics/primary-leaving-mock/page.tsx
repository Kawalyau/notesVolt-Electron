
// src/app/school/dashboard/[schoolId]/reports/academics/primary-leaving-mock/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services';
import type { School, Exam, SchoolClass, Student, GradingScale, StudentExamProfile, AppTimestamp } from '@/types/school';
import { Loader2, BookOpen, ShieldAlert, Printer, Filter, Users, School as SchoolIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import ReactToPrint from 'react-to-print';

const ALL_CLASSES_SENTINEL = "_ALL_CLASSES_";

export default function PrimaryLeavingMockReportPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const printAreaRef = useRef<HTMLDivElement>(null);

  const [school, setSchool] = useState<School | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentProfiles, setStudentProfiles] = useState<StudentExamProfile[]>([]);
  const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const fetchInitialData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" });
        router.push(`/school/dashboard/${schoolId}`); return;
      }
      setSchool(fetchedSchool);

      const [examsData, classesData, studentsData, scalesData] = await Promise.all([
        getSchoolSubcollectionItems<Exam>(schoolId, 'exams'),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        getSchoolSubcollectionItems<Student>(schoolId, 'students', [{ field: 'status', op: '==', value: 'Active'}]),
        getSchoolSubcollectionItems<GradingScale>(schoolId, 'gradingScales'),
      ]);
      setExams(examsData);
      setSchoolClasses(classesData);
      setStudents(studentsData);
      setGradingScales(scalesData);

    } catch (error) {
      console.error("Error fetching report data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load report data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    const fetchStudentProfiles = async () => {
      if (!selectedExamId) {
        setStudentProfiles([]);
        return;
      }
      setIsLoading(true);
      try {
        const profiles = await getSchoolSubcollectionItems<StudentExamProfile>(schoolId, `exams/${selectedExamId}/studentProfiles`);
        setStudentProfiles(profiles);
      } catch (error) {
         console.error(`Error fetching student profiles for exam ${selectedExamId}:`, error);
         toast({ variant: "destructive", title: "Error", description: "Could not load student exam results." });
      } finally {
        setIsLoading(false);
      }
    };
    fetchStudentProfiles();
  }, [selectedExamId, schoolId, toast]);
  
  const getClassName = (classId: string) => schoolClasses.find(c => c.id === classId)?.class || 'N/A';
  const getYearName = (yearId: string) => exams.find(e => e.id === selectedExamId)?.academicYearId ? school?.currentAcademicYearId : 'N/A' // Need to fetch all academic years if not on exam
  const selectedExam = exams.find(e => e.id === selectedExamId);

  const reportData = useMemo(() => {
    return studentProfiles
      .filter(p => {
        const student = students.find(s => s.id === p.studentId);
        return student && (selectedClassId === ALL_CLASSES_SENTINEL || !selectedClassId || student.classId === selectedClassId);
      })
      .map(profile => {
        const student = students.find(s => s.id === profile.studentId);
        return { ...profile, studentDetails: student };
      })
      .sort((a, b) => (a.aggregate || 99) - (b.aggregate || 99));
  }, [studentProfiles, students, selectedClassId]);

  const formatDateSafe = (dateInput: AppTimestamp | undefined) => {
    if (!dateInput) return 'N/A';
    try {
      const date = typeof dateInput === 'string' ? new Date(dateInput) : (dateInput as any).toDate();
      return format(date, "PP");
    } catch (e) { return "Invalid Date"; }
  };

  if (isLoading && studentProfiles.length === 0) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  return (
    <div className="space-y-6">
      <Card className="shadow-lg no-print">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><BookOpen className="mr-3 h-6 w-6 text-primary"/>Primary Leaving Mock Report</CardTitle>
          <CardDescription>Generate and view mock report cards based on the Ugandan Primary grading system.</CardDescription>
          <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t items-end">
            <div className="flex-grow"><Label>Select Exam</Label><Select value={selectedExamId} onValueChange={setSelectedExamId}><SelectTrigger><SelectValue placeholder="Choose an examination" /></SelectTrigger><SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.id}>{e.name} - {e.term}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex-grow"><Label>Filter by Class</Label><Select value={selectedClassId} onValueChange={setSelectedClassId} disabled={!selectedExamId}><SelectTrigger><SelectValue placeholder="All Classes" /></SelectTrigger><SelectContent><SelectItem value={ALL_CLASSES_SENTINEL}>All Classes</SelectItem>{schoolClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.class}</SelectItem>)}</SelectContent></Select></div>
            <ReactToPrint
                trigger={() => {
                    const TriggerButton = React.forwardRef<HTMLButtonElement>((props, ref) => (
                       <Button ref={ref} disabled={reportData.length === 0}><Printer className="mr-2 h-4 w-4"/>Print Reports</Button>
                    ));
                    TriggerButton.displayName = "TriggerButton";
                    return <TriggerButton/>;
                }}
                content={() => printAreaRef.current}
            />
          </div>
        </CardHeader>
      </Card>

      <div ref={printAreaRef} className="print-area space-y-8">
        {reportData.length === 0 && !isLoading && (
            <Card>
                <CardContent className="md:col-span-2 text-center py-10 text-muted-foreground no-print">
                    {selectedExamId ? 'No student results found for the selected exam and class.' : 'Please select an exam to view reports.'}
                </CardContent>
            </Card>
        )}
        {reportData.map(profile => (
            <div key={profile.id} className="report-card">
            <div className="report-header">
                {school?.badgeImageUrl && <Image src={school.badgeImageUrl} alt="School Logo" width={80} height={80} className="mx-auto" />}
                <h2 className="text-lg font-bold uppercase">{school?.name}</h2>
                <p className="text-sm">P.O. Box ???, {school?.district}</p>
                <h3 className="text-base font-semibold mt-2 underline">MOCK EXAMINATION REPORT</h3>
            </div>
            <div className="student-details text-xs my-3 border-y py-2">
                <div className="grid grid-cols-2">
                  <p><strong>NAME:</strong> {profile.studentDetails?.firstName} {profile.studentDetails?.lastName}</p>
                  <p><strong>REG NO:</strong> {profile.studentDetails?.studentRegistrationNumber}</p>
                  <p><strong>CLASS:</strong> {getClassName(profile.studentDetails?.classId || '')}</p>
                  <p><strong>EXAM:</strong> {selectedExam?.name}</p>
                </div>
            </div>
            <table className="results-table text-xs w-full">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="p-1">SUBJECT</th>
                        <th className="p-1 text-center">MARKS</th>
                        <th className="p-1 text-center">GRADE</th>
                        <th className="p-1 text-center">VALUE</th>
                        <th className="p-1">REMARKS</th>
                    </tr>
                </thead>
                <tbody>
                {profile.scores.filter(s => s.isCoreSubject).map(s => (
                  <tr key={s.examSubjectId}>
                    <td className="p-1">{s.subjectName}</td>
                    <td className="p-1 text-center">{s.score ?? 'N/A'}</td>
                    <td className="p-1 text-center">{s.grade ?? 'N/A'}</td>
                    <td className="p-1 text-center">{s.gradeValue ?? 'N/A'}</td>
                    <td className="p-1"></td>
                  </tr>
                ))}
                </tbody>
            </table>
            <div className="summary-section text-sm mt-4 font-semibold">
                <p>AGGREGATES: {profile.aggregate ?? 'N/A'}</p>
                <p>DIVISION: {profile.division ?? 'N/A'}</p>
            </div>
             <div className="footer-section text-xs mt-auto">
                <p><strong>Class Teacher's Comment:</strong> ....................................................................................................</p>
                <p><strong>Head Teacher's Comment:</strong> .......................................................................................................</p>
                <div className="grid grid-cols-2 mt-4">
                  <p><strong>Class Teacher's Signature:</strong> ........................................................</p>
                  <p><strong>Head Teacher's Signature:</strong> .......................................................</p>
                </div>
                <p className="mt-2"><strong>Report generated on:</strong> {formatDateSafe(new Date().toISOString())}</p>
            </div>
            </div>
        ))}
      </div>

    </div>
  );
}
