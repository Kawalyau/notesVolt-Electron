
// src/app/school/dashboard/[schoolId]/nursery/reports/page.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, getStudentExamProfile } from '@/services';
import type { School, Student, SchoolClass, NurseryAssessment, NurseryCompetence, NurseryGradeLevel, NurseryStudentReport, SchoolAcademicYear, Exam, StudentExamProfile } from '@/types/school';
import { Loader2, Baby, Filter, Printer, FileText, Settings2, Sparkles, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, where } from 'firebase/firestore';
import { firestore } from '@/config/firebase';
import Image from 'next/image';
import { format } from 'date-fns';
import { generateReportCardComments, type ReportCardCommentsInput } from '@/ai/flows/generate-report-card-comments-flow';
import { Badge } from '@/components/ui/badge';


interface ReportCardData {
    student: Student;
    assessmentName: string;
    term: string;
    academicYear: string;
    teacherComment?: string;
    principalComment?: string;
    results: Array<{
        category: string;
        competences: Array<{
            name: string;
            gradeLevel?: NurseryGradeLevel;
        }>;
    }>;
    primaryMarks?: StudentExamProfile | null;
}

const DEFAULT_GRADE_SCALE_ID = 'default_scale';

const getGradeBadgeVariant = (grade: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (!grade) return 'outline';
  const gradeUpper = grade.toUpperCase();
  if (gradeUpper.startsWith('D')) return 'default'; // Distinctions
  if (gradeUpper.startsWith('C')) return 'secondary'; // Credits
  if (gradeUpper.startsWith('P')) return 'outline'; // Passes
  if (gradeUpper.startsWith('F')) return 'destructive'; // Fails
  return 'outline';
};

export default function NurseryReportPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const printAreaRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [school, setSchool] = useState<School | null>(null);
  const [assessments, setAssessments] = useState<NurseryAssessment[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [competences, setCompetences] = useState<NurseryCompetence[]>([]);
  const [gradeLevels, setGradeLevels] = useState<NurseryGradeLevel[]>([]);
  const [academicYears, setAcademicYears] = useState<SchoolAcademicYear[]>([]);
  const [primaryExams, setPrimaryExams] = useState<Exam[]>([]);
  
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  
  const [reportCards, setReportCards] = useState<ReportCardData[]>([]);
  const [isGeneratingComments, setIsGeneratingComments] = useState(false);


  const fetchInitialData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const gradeScaleDocRef = doc(firestore, `schools/${schoolId}/nurseryGradeScales`, DEFAULT_GRADE_SCALE_ID);
      const gradeScaleSnap = await getDoc(gradeScaleDocRef);
      if (!gradeScaleSnap.exists()) {
        await setDoc(gradeScaleDocRef, { name: 'Default Nursery Scale', createdAt: serverTimestamp() });
      }

      const [fetchedSchool, assessmentData, classData, competenceData, fetchedGradeLevels, academicYearsData, primaryExamsData] = await Promise.all([
        getSchoolById(schoolId),
        getSchoolSubcollectionItems<NurseryAssessment>(schoolId, 'nurseryAssessments'),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        getSchoolSubcollectionItems<NurseryCompetence>(schoolId, 'nurseryCompetences'),
        getSchoolSubcollectionItems<NurseryGradeLevel>(schoolId, `nurseryGradeScales/${DEFAULT_GRADE_SCALE_ID}/levels`),
        getSchoolSubcollectionItems<SchoolAcademicYear>(schoolId, 'schoolAcademicYears'),
        getSchoolSubcollectionItems<Exam>(schoolId, 'exams'), // Fetch primary exams
      ]);
      setSchool(fetchedSchool);
      setAssessments(assessmentData);
      setSchoolClasses(classData);
      setCompetences(competenceData);
      setGradeLevels(fetchedGradeLevels);
      setAcademicYears(academicYearsData);
      setPrimaryExams(primaryExamsData);

    } catch (error) { toast({ variant: "destructive", title: "Error", description: "Could not load required configuration data." });
    } finally { setIsLoading(false); }
  }, [schoolId, user, toast]);

  useEffect(() => { fetchInitialData(); }, [fetchInitialData]);

  const handleGenerateReports = useCallback(async () => {
    if (!selectedAssessmentId || !selectedClassId || !school) return;
    setIsGenerating(true);
    setReportCards([]);
    
    const assessment = assessments.find(a => a.id === selectedAssessmentId);
    if (!assessment) { toast({ variant: 'destructive', title: 'Error', description: 'Selected assessment not found.'}); setIsGenerating(false); return; }
    
    if (gradeLevels.length === 0) { toast({ variant: 'destructive', title: 'Error', description: 'Nursery grading scale not found.'}); setIsGenerating(false); return; }
    
    const academicYear = academicYears.find(ay => ay.id === assessment.academicYearId)?.year || 'N/A';
    const matchingPrimaryExam = primaryExams.find(ex => ex.id === assessment.examId);

    try {
        const studentsInClass = await getSchoolSubcollectionItems<Student>(schoolId, 'students', [where('classId', '==', selectedClassId), where('status', '==', 'Active')]);

        if (studentsInClass.length === 0) {
            toast({ title: "No Students Found", description: `There are no active students in the selected class.` });
            setIsGenerating(false);
            return;
        }
        
        const allStudentReportDocs = studentsInClass.length > 0 ? await getDocs(query(collection(firestore, `schools/${schoolId}/nurseryStudentReports`), where('__name__', 'in', studentsInClass.map(s=>s.id)))) : { docs: [] };
        
        const allStudentReportsData: Record<string, NurseryStudentReport> = {};
        allStudentReportDocs.docs.forEach(doc => {
            allStudentReportsData[doc.id] = doc.data() as NurseryStudentReport;
        });

        const generatedReportsPromises: Promise<ReportCardData>[] = studentsInClass.map(async (student) => {
            const studentReportData = allStudentReportsData[student.id];
            const studentAssessmentData = studentReportData?.assessments?.[selectedAssessmentId];
            const studentResults = studentAssessmentData?.results || {};

            const competencesForReport = assessment.competenceIds
                .map(id => competences.find(c => c.id === id))
                .filter((c): c is NurseryCompetence => !!c);

            const resultsByCategory = competencesForReport.reduce((acc, comp) => {
                const category = comp.category || "Uncategorized";
                if (!acc[category]) acc[category] = [];
                
                const gradeLevelId = studentResults[comp.id];
                const gradeLevel = gradeLevels.find(gl => gl.id === gradeLevelId);
                acc[category].push({ name: comp.name, gradeLevel });
                return acc;
            }, {} as Record<string, Array<{name: string, gradeLevel?: NurseryGradeLevel}>>);
            
            let primaryMarks: StudentExamProfile | null = null;
            if (matchingPrimaryExam) {
              primaryMarks = await getStudentExamProfile(schoolId, matchingPrimaryExam.id, student.id);
            }

            return {
                student,
                assessmentName: assessment.name,
                term: assessment.term,
                academicYear,
                teacherComment: studentAssessmentData?.teacherComment,
                principalComment: studentAssessmentData?.principalComment,
                results: Object.entries(resultsByCategory).map(([category, competences]) => ({ category, competences })),
                primaryMarks,
            };
        });

        const generatedReports = await Promise.all(generatedReportsPromises);
        setReportCards(generatedReports);

    } catch (error: any) { 
        console.error("Error generating reports:", error);
        toast({ variant: "destructive", title: "Error", description: `Failed to generate reports. ${error.message}`});
    } finally { 
        setIsGenerating(false); 
    }
  }, [selectedAssessmentId, selectedClassId, schoolId, assessments, gradeLevels, competences, school, academicYears, primaryExams, toast]);

  const handleGenerateComments = async () => {
    if (reportCards.length === 0) return;
    setIsGeneratingComments(true);
    toast({
      title: "Generating AI Comments",
      description: `Please wait while we generate comments for ${reportCards.length} students...`,
    });
    
    try {
      const studentDataForApi = reportCards.map((row) => {
        const subjectsPerformance = row.primaryMarks?.scores
          .map(scoreData => ({ 
              subjectName: scoreData.subjectName || 'Unknown', 
              grade: scoreData.grade || 'N/A'
          })) || [];

        return {
          studentId: row.student.id,
          studentName: `${row.student.firstName} ${row.student.lastName}`,
          division: row.primaryMarks?.division || 'N/A',
          aggregate: row.primaryMarks?.aggregate || 0,
          subjectsPerformance,
        };
      });

      const result = await generateReportCardComments({ students: studentDataForApi });

      const commentsMap = new Map(result.comments.map(c => [c.studentId, c]));

      const updatedReportData = reportCards.map(row => {
        const comments = commentsMap.get(row.student.id);
        return comments ? {
          ...row,
          principalComment: comments.principalComment,
          classTeacherComment: comments.classTeacherComment,
        } : row;
      });

      setReportCards(updatedReportData);
      toast({
        title: "Comments Generated Successfully",
        description: "Personalized comments have been added to all student reports.",
      });

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Comment Generation Failed",
        description: `An error occurred while generating comments: ${error.message}`
      });
    } finally {
      setIsGeneratingComments(false);
    }
  };

  const handlePrint = () => {
    const printContent = printAreaRef.current;
    if (printContent) {
      const printWindow = window.open('', '_blank', 'height=800,width=1200');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Nursery Reports - ${school?.name || 'School'}</title>
              <style>
                @media print {
                  @page { size: A4 portrait; margin: 0.5in; }
                  body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; font-family: 'Century Gothic', sans-serif; color: #333; }
                  .report-card-container { page-break-after: always !important; border: 2px solid #4a90e2; padding: 20px; background: white; border-radius: 10px; }
                  .no-print { display: none !important; }
                  .report-header { text-align: center; border-bottom: 2px solid #4a90e2; padding-bottom: 10px; margin-bottom: 15px; }
                  .report-header img { max-height: 80px; margin-bottom: 10px; object-fit: contain; }
                  .report-header h2 { margin: 5px 0; font-size: 1.6rem; color: #4a90e2; }
                  .report-header h3 { margin: 0; font-size: 1.1rem; }
                  .student-info { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 15px; font-size: 0.9rem; margin-bottom: 15px; padding: 10px; background-color: #f0f4f8 !important; border-radius: 5px;}
                  .student-info p { margin: 0; }
                  .section-title { font-weight: bold; font-size: 1.2rem; margin-top: 15px; margin-bottom: 5px; color: #4a90e2; border-bottom: 1px solid #4a90e2; padding-bottom: 3px; }
                  .competence-category h4 { background-color: #4a90e2 !important; color: white !important; padding: 8px; font-size: 1.1rem; border-radius: 5px 5px 0 0; margin-bottom: 0; }
                  .competence-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 15px; border: 1px solid #ddd; border-top: none; padding: 10px; border-radius: 0 0 5px 5px; }
                  .competence-item { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px dotted #ccc; font-size: 0.9rem; }
                  .competence-item:last-child { border-bottom: none; }
                  .grade-badge { padding: 2px 8px; border-radius: 12px; font-weight: bold; color: white; }
                  .marks-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9rem; }
                  .marks-table th, .marks-table td { border: 1px solid #ccc; padding: 5px; text-align: left; }
                  .marks-table th { background-color: #f0f4f8 !important; }
                  .marks-table .summary-row td { font-weight: bold; border-top: 2px solid #333; }
                  .comments-section { margin-top: 20px; font-size: 0.9rem; }
                  .comment-box { border-top: 1px solid #ccc; padding-top: 5px; margin-top: 2px; min-height: 40px; }
                  .footer { text-align: center; font-size: 0.75rem; color: #888; margin-top: 20px; }
                }
              </style>
            </head>
            <body>${printAreaRef.current?.innerHTML || ''}</body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
      }
    }
  };


  return (
    <div className="space-y-6">
      <Card className="no-print">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><Baby className="mr-3 h-6 w-6 text-primary"/>Nursery Progress Reports</CardTitle>
          <CardDescription>Generate and print colorful, competence-based reports for nursery students.</CardDescription>
          <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t items-end">
            <div className="flex-grow"><Label>Select Assessment</Label><Select value={selectedAssessmentId} onValueChange={setSelectedAssessmentId}><SelectTrigger><SelectValue placeholder="Choose an assessment..." /></SelectTrigger><SelectContent>{assessments.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex-grow"><Label>Select Class</Label><Select value={selectedClassId} onValueChange={setSelectedClassId} disabled={!selectedAssessmentId}><SelectTrigger><SelectValue placeholder="Choose a class..." /></SelectTrigger><SelectContent>{schoolClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.class}</SelectItem>)}</SelectContent></Select></div>
            <Button onClick={handleGenerateReports} disabled={isGenerating || isLoading || !selectedAssessmentId || !selectedClassId}>
              {isGenerating ? <Loader2 className="animate-spin mr-2"/> : <FileText className="mr-2 h-4 w-4"/>} Generate
            </Button>
            <Button onClick={handleGenerateComments} disabled={reportCards.length === 0 || isGeneratingComments} variant="outline">
              {isGeneratingComments ? <Loader2 className="animate-spin mr-2"/> : <Sparkles className="mr-2 h-4 w-4"/>} AI Comments
            </Button>
            <Button onClick={handlePrint} disabled={reportCards.length === 0} variant="outline">
              <Printer className="mr-2 h-4 w-4"/> Print Reports
            </Button>
          </div>
        </CardHeader>
      </Card>

      {isGenerating && <div className="flex justify-center p-8"><Loader2 className="animate-spin h-10 w-10 text-primary"/></div>}

      <div ref={printAreaRef} className="space-y-8">
        {reportCards.map(report => (
          <div key={report.student.id} className="report-card-container bg-white p-6 border rounded-lg shadow-md">
            <header className="report-header">
              {school?.badgeImageUrl && <Image src={school.badgeImageUrl} alt="School Badge" width={80} height={80} className="mx-auto" data-ai-hint="school logo"/>}
              <h2 className="text-2xl font-bold text-primary">{school?.name}</h2>
              <p>{school?.motto}</p>
              <h3 className="text-lg font-semibold mt-2">{report.assessmentName}</h3>
            </header>
            
            <section className="student-info bg-muted/50 p-3 rounded-md grid grid-cols-2 gap-x-4">
              <div className="flex items-center gap-3 col-span-2">
                 {report.student.photoUrl && <Image src={report.student.photoUrl} alt="student photo" width={60} height={60} className="rounded-full border-2 border-primary object-cover" data-ai-hint="student photo"/>}
                 <div>
                    <p><strong>Learner's Name:</strong> {report.student.firstName} {report.student.lastName}</p>
                    <p><strong>Class:</strong> {schoolClasses.find(c => c.id === report.student.classId)?.class}</p>
                 </div>
              </div>
              <p><strong>Academic Year:</strong> {report.academicYear}</p>
              <p><strong>Term:</strong> {report.term}</p>
            </section>
            
            <h4 className="section-title">Competence Assessment</h4>
            <section className="space-y-4 mt-4">
              {report.results.map(categoryData => (
                <div key={categoryData.category} className="competence-category">
                  <h4 className="font-bold text-md text-primary-foreground bg-primary p-2 rounded-t-md">{categoryData.category}</h4>
                  <div className="competence-grid border border-t-0 p-3 rounded-b-md">
                    {categoryData.competences.map(comp => (
                      <div key={comp.name} className="competence-item flex justify-between items-center py-1 border-b">
                        <span className="text-sm">{comp.name}</span>
                        {comp.gradeLevel ? (
                          <span className="grade-badge text-xs font-bold text-white px-2 py-1 rounded-full" style={{ backgroundColor: comp.gradeLevel.color }}>
                            {comp.gradeLevel.name}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">-</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {report.primaryMarks && report.primaryMarks.scores.length > 0 && (
              <>
                <h4 className="section-title">Subject Marks</h4>
                <table className="marks-table w-full border-collapse mt-2 text-sm">
                  <thead>
                    <tr><th className="border p-2 bg-muted/50">Subject</th><th className="border p-2 bg-muted/50 text-center">Score</th><th className="border p-2 bg-muted/50 text-center">Grade</th></tr>
                  </thead>
                  <tbody>
                    {report.primaryMarks.scores.map(score => (
                      <tr key={score.examSubjectId}>
                        <td className="border p-2">{score.subjectName}</td>
                        <td className="border p-2 text-center">{score.score ?? '-'}</td>
                        <td className="border p-2 text-center"><Badge variant={getGradeBadgeVariant(score.grade || '')}>{score.grade || '-'}</Badge></td>
                      </tr>
                    ))}
                    <tr className="summary-row font-bold">
                      <td colSpan={2} className="border p-2 text-right">Aggregate</td>
                      <td className="border p-2 text-center">{report.primaryMarks.aggregate ?? 'N/A'}</td>
                    </tr>
                    <tr className="summary-row font-bold">
                      <td colSpan={2} className="border p-2 text-right">Division</td>
                      <td className="border p-2 text-center">{report.primaryMarks.division ?? 'N/A'}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            <section className="comments-section mt-6 space-y-4">
              <div>
                <h4 className="font-semibold">Class Teacher's Remark:</h4>
                <div className="comment-box p-2 border-t mt-1 min-h-[50px]">
                  {report.teacherComment || <p className="text-muted-foreground italic text-sm">No comment provided.</p>}
                </div>
              </div>
              <div>
                <h4 className="font-semibold">Principal's Remark:</h4>
                <div className="comment-box p-2 border-t mt-1 min-h-[40px]">
                   {report.principalComment || <p className="text-muted-foreground italic text-sm">No comment provided.</p>}
                </div>
              </div>
            </section>

             <footer className="footer mt-6 pt-4 border-t text-xs text-gray-500">
                <p className="text-center">Generated on: {format(new Date(), "PPpp")}</p>
             </footer>
          </div>
        ))}
      </div>
    </div>
  );
}

