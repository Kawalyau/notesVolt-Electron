// src/app/school/dashboard/[schoolId]/academics/marks-entry/page.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolSubcollectionItems, updateStudentExamProfile } from '@/services';
import type { School, Exam, SchoolClass, Student, GradingScale, StudentExamProfile, ExamSubject } from '@/types/school';
import { Loader2, FileSignature, Filter, Save, AlertTriangle, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { query as firestoreQuery, where, doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { firestore } from '@/config/firebase';
import { format, parseISO } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";


export default function MarksEntryPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(true); // For initial filter data
  const [isLoadingStudents, setIsLoadingStudents] = useState(false); // For student list
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Data for filters
  const [exams, setExams] = useState<Exam[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [examSubjects, setExamSubjects] = useState<ExamSubject[]>([]);
  const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);

  // Selected filters
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  
  // Data for table
  const [studentsInClass, setStudentsInClass] = useState<Student[]>([]);
  const [studentScores, setStudentScores] = useState<Record<string, Record<string, string | number>>>({}); // { studentId: { subjectId: score } }

  const fetchInitialData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const [examData, classData, scaleData] = await Promise.all([
        getSchoolSubcollectionItems<Exam>(schoolId, 'exams'),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        getSchoolSubcollectionItems<GradingScale>(schoolId, 'gradingScales'),
      ]);
      setExams(examData);
      setSchoolClasses(classData);
      setGradingScales(scaleData);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load page data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Fetch subjects for the selected exam
  useEffect(() => {
    const fetchExamSubjects = async () => {
      if (!selectedExamId) { setExamSubjects([]); return; }
      try {
        const subjects = await getSchoolSubcollectionItems<ExamSubject>(schoolId, `exams/${selectedExamId}/subjects`);
        setExamSubjects(subjects.sort((a,b) => (a.subjectName || "").localeCompare(b.subjectName || "")));
      } catch (error) {
        toast({variant: "destructive", title: "Error", description: "Could not fetch subjects for this exam."});
      }
    };
    fetchExamSubjects();
  }, [selectedExamId, schoolId, toast]);

  // Fetch students and their existing marks ONLY when both filters are set
  useEffect(() => {
    const fetchStudentsAndMarks = async () => {
      if (!selectedExamId || !selectedClassId) {
        setStudentsInClass([]);
        setStudentScores({});
        return;
      }
      setIsLoadingStudents(true);
      try {
        const studentQueryConstraints = [where('classId', '==', selectedClassId), where('status', '==', 'Active')];
        const students = await getSchoolSubcollectionItems<Student>(schoolId, 'students', studentQueryConstraints);
        setStudentsInClass(students.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)));
        
        if (students.length === 0) {
            setStudentScores({});
            setIsLoadingStudents(false);
            return;
        }

        const scores: Record<string, Record<string, string | number>> = {};
        for (const student of students) {
          const profileDocRef = doc(firestore, `schools/${schoolId}/exams/${selectedExamId}/studentProfiles`, student.id);
          const profileSnap = await getDoc(profileDocRef);
          scores[student.id] = {};
          if (profileSnap.exists()) {
            const profileData = profileSnap.data() as StudentExamProfile;
            profileData.scores.forEach(s => {
              if(s.examSubjectId && s.score !== null && s.score !== undefined) {
                 scores[student.id][s.examSubjectId] = s.score;
              }
            });
          }
        }
        setStudentScores(scores);

      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Failed to load students or marks." });
      } finally {
        setIsLoadingStudents(false);
      }
    };
    fetchStudentsAndMarks();
  }, [selectedExamId, selectedClassId, schoolId, toast]);


  const handleScoreChange = (studentId: string, subjectId: string, score: string) => {
    setStudentScores(prev => ({ 
        ...prev, 
        [studentId]: { 
            ...(prev[studentId] || {}), 
            [subjectId]: score 
        } 
    }));
  };

  const getGradeForScore = (score: number | string | undefined, maxScore: number): { grade: string, value: number, comment?: string } | null => {
    const scoreNum = typeof score === 'string' ? parseFloat(score) : score;
    if (scoreNum === undefined || isNaN(scoreNum) || scoreNum > maxScore || scoreNum < 0) return null;
    
    const exam = exams.find(e => e.id === selectedExamId);
    if (!exam) return null;
    const scale = gradingScales.find(s => s.id === exam.defaultGradingScaleId);
    if (!scale) return null;

    const percentage = (scoreNum / maxScore) * 100;
    const gradeInfo = scale.grades.find(g => percentage >= g.lowerBound && percentage <= g.upperBound);
    return gradeInfo ? { grade: gradeInfo.name, value: gradeInfo.value, comment: gradeInfo.comment } : null;
  };
  
  const handleSaveChanges = async () => {
    if (!selectedExamId || !studentsInClass.length) return;
    setIsSubmitting(true);
    const exam = exams.find(e => e.id === selectedExamId);
    if (!exam) {
        toast({ variant: "destructive", title: "Error", description: "Could not find the selected exam details." });
        setIsSubmitting(false);
        return;
    }

    try {
      const promises = studentsInClass.map(async (student) => {
        const profileDocRef = doc(firestore, `schools/${schoolId}/exams/${exam.id}/studentProfiles`, student.id);
        const studentScoresForUpdate = studentScores[student.id] || {};
        
        const newScores = examSubjects.map(subject => {
            const scoreValue = studentScoresForUpdate[subject.id];
            const newScore = (scoreValue !== '' && scoreValue !== undefined && !isNaN(Number(scoreValue))) ? Number(scoreValue) : null;
            if (newScore !== null && (newScore < 0 || newScore > subject.maxScore)) {
              throw new Error(`Invalid score for ${student.firstName} in ${subject.subjectName}. Score must be between 0 and ${subject.maxScore}.`);
            }
            const gradeInfo = getGradeForScore(newScore, subject.maxScore);
            return {
                examSubjectId: subject.id,
                subjectName: subject.subjectName,
                isCoreSubject: subject.isCoreSubject,
                score: newScore,
                grade: gradeInfo?.grade || null,
                gradeValue: gradeInfo?.value || null,
            };
        });

        // Recalculate aggregate and division
        const examScale = gradingScales.find(s => s.id === exam.defaultGradingScaleId);
        if(!examScale) throw new Error("Grading Scale not found");
        let aggregate = 0;
        let hasFailed = false;
        const failValue = examScale.failValue || 9;

        newScores.filter(s => s.isCoreSubject).forEach(score => {
          if (score.gradeValue !== null && score.gradeValue !== undefined) {
            aggregate += score.gradeValue;
            if (score.gradeValue >= failValue) hasFailed = true;
          }
        });

        let division: string | null = null;
        if(hasFailed) {
            division = examScale.divisions.find(d => d.name.toLowerCase().includes('ungraded') || d.minAggregate > 34)?.name || 'Ungraded';
        } else {
            division = examScale.divisions.find(d => aggregate >= d.minAggregate && aggregate <= d.maxAggregate)?.name || 'Ungraded';
        }

        const dataToSave: Omit<StudentExamProfile, 'id'|'createdAt'> = {
            studentId: student.id, examId: exam.id, scores: newScores,
            aggregate: newScores.filter(s => s.isCoreSubject).length > 0 ? aggregate : null,
            division: newScores.filter(s => s.isCoreSubject).length > 0 ? division : null,
            updatedAt: serverTimestamp(),
        };
        const existingProfile = await getDoc(profileDocRef);
        if(existingProfile.exists()){
          return updateDoc(profileDocRef, dataToSave);
        } else {
          return setDoc(profileDocRef, { ...dataToSave, createdAt: serverTimestamp() });
        }
      });
      
      await Promise.all(promises);
      toast({ title: "Marks Saved", description: "All entered marks for the class have been updated." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintBlankMarksheet = () => {
    const printContent = printRef.current;
    if (printContent) {
      const printWindow = window.open('', '_blank', 'height=800,width=1200');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Blank Marksheet</title>
              <style>
                @media print {
                  @page { size: A4 landscape; margin: 0.5in; }
                  body { font-family: Arial, sans-serif; }
                  .report-header { text-align: center; margin-bottom: 20px; }
                  h1,h2,p { margin:0; }
                  table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 9pt; }
                  th, td { border: 1px solid #000; padding: 6px; text-align: left; }
                  th { background-color: #f2f2f2; }
                  .subject-header { writing-mode: vertical-rl; text-orientation: mixed; white-space: nowrap; }
                  .name-col { min-width: 150px; }
                }
              </style>
            </head>
            <body>
              ${printContent.innerHTML}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
      }
    }
  };


  if (isLoading) { return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>; }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
            <div>
                <CardTitle className="text-2xl flex items-center"><FileSignature className="mr-3 h-6 w-6 text-primary"/>Marks Entry</CardTitle>
                <CardDescription>Select an exam and class to enter all subject marks for students at once.</CardDescription>
            </div>
            <Button onClick={handlePrintBlankMarksheet} variant="outline" size="sm" disabled={!selectedExamId || !selectedClassId || studentsInClass.length === 0}>
                <Printer className="mr-2 h-4 w-4"/>Print Blank Marksheet
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-grow"><Label>Exam</Label><Select value={selectedExamId} onValueChange={setSelectedExamId}><SelectTrigger><SelectValue placeholder="Select Exam" /></SelectTrigger><SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.term})</SelectItem>)}</SelectContent></Select></div>
            <div className="flex-grow"><Label>Class</Label><Select value={selectedClassId} onValueChange={setSelectedClassId}><SelectTrigger><SelectValue placeholder="Select Class" /></SelectTrigger><SelectContent>{schoolClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.class}</SelectItem>)}</SelectContent></Select></div>
          </div>
        </CardContent>
      </Card>
      
      {selectedExamId && selectedClassId && (
        <Card>
          <CardHeader>
            <CardTitle>Enter Marks for {schoolClasses.find(c=>c.id === selectedClassId)?.class}</CardTitle>
            <CardDescription>Exam: {exams.find(e=>e.id === selectedExamId)?.name}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStudents ? <div className="flex justify-center"><Loader2 className="animate-spin h-8 w-8"/></div> :
             studentsInClass.length === 0 ? <p className="text-muted-foreground">No students found in the selected class.</p> :
             examSubjects.length === 0 ? <p className="text-muted-foreground">No subjects have been added to this exam yet.</p> : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-card z-10 font-bold">Student Name</TableHead>
                      {examSubjects.map(subject => <TableHead key={subject.id} className="text-center subject-header">{subject.subjectName}<br/>({subject.maxScore})</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studentsInClass.map(student => (
                      <TableRow key={student.id}>
                        <TableCell className="font-medium sticky left-0 bg-card z-10 whitespace-nowrap">{student.firstName} {student.lastName}</TableCell>
                        {examSubjects.map(subject => (
                          <TableCell key={subject.id} className="min-w-[70px]">
                            <Input
                              type="number"
                              placeholder="-"
                              value={studentScores[student.id]?.[subject.id] ?? ''}
                              onChange={e => handleScoreChange(student.id, subject.id, e.target.value)}
                              max={subject.maxScore}
                              min="0"
                              className="w-16 h-8 text-center"
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={handleSaveChanges} disabled={isSubmitting || isLoadingStudents || studentsInClass.length === 0 || examSubjects.length === 0}>
              {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 h-4 w-4"/>}
              Save All Changes
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Hidden div for printing blank marksheet */}
      <div className="hidden">
        <div ref={printRef}>
          <div className="report-header">
            <h1>{exams.find(e=>e.id === selectedExamId)?.name} - Blank Marksheet</h1>
            <p><strong>Class:</strong> {schoolClasses.find(c=>c.id === selectedClassId)?.class}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th className="name-col">Student Name</th>
                {examSubjects.map(subject => <th key={subject.id} className="text-center">{subject.subjectName} ({subject.maxScore})</th>)}
              </tr>
            </thead>
            <tbody>
              {studentsInClass.map(student => (
                <tr key={student.id}>
                  <td className="name-col">{student.firstName} {student.lastName}</td>
                  {examSubjects.map(subject => <td key={subject.id}></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
