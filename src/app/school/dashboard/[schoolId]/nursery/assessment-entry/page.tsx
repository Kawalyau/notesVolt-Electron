
// src/app/school/dashboard/[schoolId]/nursery/assessment-entry/page.tsx

"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolSubcollectionItems, updateStudentExamProfile } from '@/services';
import type { SchoolClass, Student, NurseryAssessment, NurseryCompetence, NurseryGradeLevel, NurseryStudentReport, Exam, ExamSubject, GradingScale, StudentExamProfile } from '@/types/school';
import { Loader2, Baby, Filter, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { query as firestoreQuery, where, doc, getDoc, setDoc, serverTimestamp, collection, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
import { firestore } from '@/config/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const DEFAULT_GRADE_SCALE_ID = 'default_scale';

export default function NurseryAssessmentEntryPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);

  // Configuration Data
  const [assessments, setAssessments] = useState<NurseryAssessment[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [competences, setCompetences] = useState<NurseryCompetence[]>([]);
  const [gradeLevels, setGradeLevels] = useState<NurseryGradeLevel[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);

  // Filter selections
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  
  // Data for entry tables
  const [students, setStudents] = useState<Student[]>([]);
  const [studentAssessments, setStudentAssessments] = useState<Record<string, Record<string, string>>>({}); // { studentId: { competenceId: gradeLevelId } }
  const [studentExamScores, setStudentExamScores] = useState<Record<string, Record<string, string | number>>>({}); // { studentId: { examSubjectId: score } }
  
  const selectedAssessment = useMemo(() => assessments.find(a => a.id === selectedAssessmentId), [assessments, selectedAssessmentId]);
  const linkedPrimaryExam = useMemo(() => exams.find(e => e.id === selectedAssessment?.examId), [exams, selectedAssessment]);
  const [linkedExamSubjects, setLinkedExamSubjects] = useState<ExamSubject[]>([]);


  const fetchInitialData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const [assessmentData, classData, competenceData, fetchedGradeLevels, examsData, scalesData] = await Promise.all([
        getSchoolSubcollectionItems<NurseryAssessment>(schoolId, 'nurseryAssessments'),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        getSchoolSubcollectionItems<NurseryCompetence>(schoolId, 'nurseryCompetences'),
        getSchoolSubcollectionItems<NurseryGradeLevel>(schoolId, `nurseryGradeScales/${DEFAULT_GRADE_SCALE_ID}/levels`),
        getSchoolSubcollectionItems<Exam>(schoolId, 'exams'),
        getSchoolSubcollectionItems<GradingScale>(schoolId, 'gradingScales'),
      ]);
      setAssessments(assessmentData);
      setSchoolClasses(classData.sort((a,b)=>(a.class || "").localeCompare(b.class || "")));
      setCompetences(competenceData);
      setGradeLevels(fetchedGradeLevels);
      setExams(examsData);
      setGradingScales(scalesData);

    } catch (error) { toast({ variant: "destructive", title: "Error", description: "Could not load page configuration data." });
    } finally { setIsLoading(false); }
  }, [schoolId, user, toast]);

  useEffect(() => { fetchInitialData(); }, [fetchInitialData]);

  // Fetch subjects for the selected linked exam
  useEffect(() => {
    const fetchExamSubjects = async () => {
      if (!linkedPrimaryExam) { setLinkedExamSubjects([]); return; }
      try {
        const subjects = await getSchoolSubcollectionItems<ExamSubject>(schoolId, `exams/${linkedPrimaryExam.id}/subjects`);
        setLinkedExamSubjects(subjects);
      } catch (error) { toast({variant: "destructive", title: "Error", description: "Could not fetch subjects for the linked exam."}); }
    };
    fetchExamSubjects();
  }, [linkedPrimaryExam, schoolId, toast]);
  
  // Fetch students and their saved results when filters change
  useEffect(() => {
    const fetchStudentsAndResults = async () => {
      if (!selectedClassId || !selectedAssessmentId) { 
        setStudents([]); 
        setStudentAssessments({}); 
        setStudentExamScores({});
        return; 
      }
      
      setIsLoadingStudents(true);
      try {
        const studentQueryConstraints = [where('classId', '==', selectedClassId), where('status', '==', 'Active')];
        const fetchedStudents = await getSchoolSubcollectionItems<Student>(schoolId, 'students', studentQueryConstraints);
        setStudents(fetchedStudents.sort((a,b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)));

        if (fetchedStudents.length === 0) {
            setStudentAssessments({});
            setStudentExamScores({});
            setIsLoadingStudents(false);
            return;
        }
        
        const competenceResults: Record<string, Record<string, string>> = {};
        const examScoreResults: Record<string, Record<string, string | number>> = {};

        for (const student of fetchedStudents) {
            // Fetch Competence Results
            const reportDocRef = doc(firestore, `schools/${schoolId}/nurseryStudentReports`, student.id);
            const reportSnap = await getDoc(reportDocRef);
            if(reportSnap.exists()){
                const reportData = reportSnap.data() as NurseryStudentReport;
                competenceResults[student.id] = reportData?.assessments?.[selectedAssessmentId]?.results || {};
            } else {
                 competenceResults[student.id] = {};
            }
            
            // Fetch Primary Exam Score Results
            if(linkedPrimaryExam) {
              const profileDocRef = doc(firestore, `schools/${schoolId}/exams/${linkedPrimaryExam.id}/studentProfiles`, student.id);
              const profileSnap = await getDoc(profileDocRef);
              if (profileSnap.exists()) {
                const profileData = profileSnap.data() as StudentExamProfile;
                const scores: Record<string, string | number> = {};
                profileData.scores.forEach(s => {
                  if (s.examSubjectId && s.score !== null) scores[s.examSubjectId] = s.score!;
                });
                examScoreResults[student.id] = scores;
              } else {
                examScoreResults[student.id] = {};
              }
            }
        }
        setStudentAssessments(competenceResults);
        setStudentExamScores(examScoreResults);

      } catch (error) { toast({ variant: "destructive", title: "Error", description: "Failed to load students or their marks." });
      } finally { setIsLoadingStudents(false); }
    };
    fetchStudentsAndResults();
  }, [selectedClassId, selectedAssessmentId, schoolId, toast, linkedPrimaryExam]);

  const handleCompetenceAssessmentChange = (studentId: string, competenceId: string, gradeLevelId: string) => {
    setStudentAssessments(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), [competenceId]: gradeLevelId }}));
  };
  
  const handleScoreChange = (studentId: string, examSubjectId: string, score: string) => {
    setStudentExamScores(prev => ({...prev, [studentId]: {...(prev[studentId] || {}), [examSubjectId]: score } }));
  };

  const getGradeForScore = (score: number | string | undefined, maxScore: number): { grade: string, value: number, comment?: string } | null => {
    const scoreNum = typeof score === 'string' ? parseFloat(score) : score;
    if (scoreNum === undefined || isNaN(scoreNum) || scoreNum > maxScore || scoreNum < 0) return null;
    if (!linkedPrimaryExam) return null;
    const scale = gradingScales.find(s => s.id === linkedPrimaryExam.defaultGradingScaleId);
    if (!scale) return null;

    const percentage = (scoreNum / maxScore) * 100;
    const gradeInfo = scale.grades.find(g => percentage >= g.lowerBound && percentage <= g.upperBound);
    return gradeInfo ? { grade: gradeInfo.name, value: gradeInfo.value, comment: gradeInfo.comment } : null;
  };

  const handleSaveChanges = async () => {
    if (!selectedAssessmentId || students.length === 0) return;
    setIsSubmitting(true);
    
    try {
      const competenceBatch = writeBatch(firestore);
      students.forEach(student => {
          const reportDocRef = doc(firestore, `schools/${schoolId}/nurseryStudentReports`, student.id);
          const resultsForStudent = studentAssessments[student.id] || {};
          const assessmentFieldPath = `assessments.${selectedAssessmentId}.results`;
          const updatePayload = { [assessmentFieldPath]: resultsForStudent, studentId: student.id, updatedAt: serverTimestamp() };
          competenceBatch.set(reportDocRef, updatePayload, { merge: true });
      });
      await competenceBatch.commit();

      if(linkedPrimaryExam) {
        for(const student of students) {
          for(const subject of linkedExamSubjects) {
            const scoreValue = studentExamScores[student.id]?.[subject.id];
            if (scoreValue !== undefined) { // Process only if there's an entry (even empty string)
                const newScore = (scoreValue !== '' && !isNaN(Number(scoreValue))) ? Number(scoreValue) : null;
                if (newScore !== null && (newScore < 0 || newScore > subject.maxScore)) {
                  toast({variant: "destructive", title: `Invalid score for ${student.firstName}`, description: `Score must be between 0 and ${subject.maxScore}.`});
                  continue; 
                }
                await updateStudentExamProfile(schoolId, linkedPrimaryExam.id, student.id, {
                  examSubjectId: subject.id, newScore, subjectDetails: subject,
                  examDetails: linkedPrimaryExam, gradingScales: gradingScales
                });
            }
          }
        }
      }

      toast({ title: "Assessments Saved", description: "All entered data has been successfully saved."});
    } catch (error: any) {
        toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const assessmentCompetences = useMemo(() => {
    if (!selectedAssessment) return [];
    return selectedAssessment.competenceIds
      .map(id => competences.find(c => c.id === id))
      .filter((c): c is NurseryCompetence => !!c);
  }, [selectedAssessment, competences]);
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><Baby className="mr-3 h-6 w-6 text-primary"/>Nursery Assessment & Marks Entry</CardTitle>
          <CardDescription>Select an assessment and class to enter competence levels and any linked academic marks.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-grow"><Label>Assessment</Label><Select value={selectedAssessmentId} onValueChange={setSelectedAssessmentId} disabled={isLoading}><SelectTrigger><SelectValue placeholder="Select Assessment" /></SelectTrigger><SelectContent>{assessments.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex-grow"><Label>Class</Label><Select value={selectedClassId} onValueChange={setSelectedClassId} disabled={isLoading}><SelectTrigger><SelectValue placeholder="Select Class" /></SelectTrigger><SelectContent>{schoolClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.class}</SelectItem>)}</SelectContent></Select></div>
          </div>
        </CardContent>
      </Card>
      
      {isLoadingStudents ? <div className="flex justify-center p-8"><Loader2 className="animate-spin h-10 w-10 text-primary"/></div> : 
       !selectedAssessmentId || !selectedClassId ? null :
       students.length === 0 ? <p className="text-muted-foreground text-center py-6">No active students found in the selected class.</p> : (
        <>
          {assessmentCompetences.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Competence Assessment</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                    <TableHeader><TableRow>
                        <TableHead className="sticky left-0 bg-card z-10">Student Name</TableHead>
                        {assessmentCompetences.map(comp => <TableHead key={comp.id} className="text-center">{comp.name}</TableHead>)}
                    </TableRow></TableHeader>
                    <TableBody>
                        {students.map(student => (
                            <TableRow key={student.id}>
                                <TableCell className="font-medium sticky left-0 bg-card z-10 whitespace-nowrap">{student.firstName} {student.lastName}</TableCell>
                                {assessmentCompetences.map(comp => (
                                    <TableCell key={comp.id}>
                                        <Select
                                            value={studentAssessments[student.id]?.[comp.id] || ""}
                                            onValueChange={(value) => handleCompetenceAssessmentChange(student.id, comp.id, value)}
                                        >
                                            <SelectTrigger className="w-full text-xs h-8"><SelectValue placeholder="-" /></SelectTrigger>
                                            <SelectContent>
                                                {gradeLevels.map(level => (
                                                    <SelectItem key={level.id} value={level.id}>{level.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {linkedPrimaryExam && linkedExamSubjects.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Academic Marks for: {linkedPrimaryExam.name}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-card z-10">Student Name</TableHead>
                      {linkedExamSubjects.map(sub => <TableHead key={sub.id} className="text-center">{sub.subjectName} (/{sub.maxScore})</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map(student => (
                      <TableRow key={student.id}>
                        <TableCell className="font-medium sticky left-0 bg-card z-10 whitespace-nowrap">{student.firstName} {student.lastName}</TableCell>
                        {linkedExamSubjects.map(subject => {
                          const score = studentExamScores[student.id]?.[subject.id] ?? '';
                          const gradeInfo = getGradeForScore(score, subject.maxScore);
                          return (
                            <TableCell key={subject.id} className="min-w-[120px]">
                              <div className="flex items-center gap-1">
                                <Input type="number" placeholder="-" value={score} onChange={e => handleScoreChange(student.id, subject.id, e.target.value)} max={subject.maxScore} min="0" className="w-16 h-8 text-center" />
                                {gradeInfo && <Badge variant={gradeInfo.value >= (gradingScales.find(gs => gs.id === linkedPrimaryExam.defaultGradingScaleId)?.failValue || 9) ? 'destructive' : 'default'}>{gradeInfo.grade}</Badge>}
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end sticky bottom-4">
            <Button onClick={handleSaveChanges} disabled={isSubmitting || isLoadingStudents} size="lg" className="shadow-lg">
              {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 h-5 w-5"/>}
              Save All Changes
            </Button>
          </div>
        </>
       )}
    </div>
  );
}
