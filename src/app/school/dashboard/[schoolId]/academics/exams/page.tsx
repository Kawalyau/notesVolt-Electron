// src/app/school/dashboard/[schoolId]/academics/exams/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { 
  getSchoolById, 
  getSchoolSubcollectionItems, 
  addSchoolSubcollectionItem, 
  deleteSchoolSubcollectionItem, 
  updateSchoolSubcollectionItem 
} from '@/services';
import { addExamSubject, deleteExamSubject } from '@/services/examService';
import type { School, Exam, SchoolAcademicYear, SchoolTerm, GradingScale, SchoolSubject, ExamSubject } from '@/types/school';
import { PenSquare, PlusCircle, Trash2, Edit, Loader2, BookCopy, Settings, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export const dynamic = 'force-dynamic';

export default function ManageExamsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [academicYears, setAcademicYears] = useState<SchoolAcademicYear[]>([]);
  const [schoolTerms, setSchoolTerms] = useState<SchoolTerm[]>([]);
  const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);
  const [masterSubjects, setMasterSubjects] = useState<SchoolSubject[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [examToDelete, setExamToDelete] = useState<Exam | null>(null);
  
  const [examName, setExamName] = useState('');
  const [selectedYearId, setSelectedYearId] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedGradingScaleId, setSelectedGradingScaleId] = useState('');

  // States for managing subjects of the selected exam
  const [selectedExamForSubjectMgmt, setSelectedExamForSubjectMgmt] = useState<Exam | null>(null);
  const [examSubjects, setExamSubjects] = useState<ExamSubject[]>([]);
  const [isSubjectLoading, setIsSubjectLoading] = useState(false);
  const [subjectToAddId, setSubjectToAddId] = useState<string>('');
  const [subjectMaxScore, setSubjectMaxScore] = useState<string>('100');
  const [isSubjectCore, setIsSubjectCore] = useState(false);
  const [isAddingSubject, setIsAddingSubject] = useState(false);

  const fetchPageData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" }); router.push('/school/auth'); return;
      }
      setSchool(fetchedSchool);

      const [examData, yearData, termData, scaleData, masterSubjectsData] = await Promise.all([
        getSchoolSubcollectionItems<Exam>(schoolId, 'exams'),
        getSchoolSubcollectionItems<SchoolAcademicYear>(schoolId, 'schoolAcademicYears'),
        getSchoolSubcollectionItems<SchoolTerm>(schoolId, 'schoolTerms'),
        getSchoolSubcollectionItems<GradingScale>(schoolId, 'gradingScales'),
        getSchoolSubcollectionItems<SchoolSubject>(schoolId, 'schoolSubjects'),
      ]);
      setExams(examData);
      setAcademicYears(yearData);
      setSchoolTerms(termData);
      setGradingScales(scaleData);
      setMasterSubjects(masterSubjectsData);

      if (fetchedSchool.currentAcademicYearId) setSelectedYearId(fetchedSchool.currentAcademicYearId);
      if (fetchedSchool.currentTerm) setSelectedTerm(fetchedSchool.currentTerm);
      const defaultScale = scaleData.find(s => s.isDefault);
      if (defaultScale) setSelectedGradingScaleId(defaultScale.id);

    } catch (error) { toast({ variant: "destructive", title: "Error", description: "Could not load examinations data." });
    } finally { setIsLoading(false); }
  }, [schoolId, user, toast, router]);

  useEffect(() => { fetchPageData(); }, [fetchPageData]);
  
  const fetchExamSubjects = useCallback(async (examId: string) => {
    if (!examId) { setExamSubjects([]); return; }
    setIsSubjectLoading(true);
    try {
      const subjects = await getSchoolSubcollectionItems<ExamSubject>(schoolId, `exams/${examId}/subjects`);
      setExamSubjects(subjects);
    } catch (error) {
        toast({variant: "destructive", title: "Error", description: "Could not load subjects for this exam."});
    } finally { setIsSubjectLoading(false); }
  }, [schoolId, toast]);

  useEffect(() => {
    if (selectedExamForSubjectMgmt) {
      fetchExamSubjects(selectedExamForSubjectMgmt.id);
    } else {
      setExamSubjects([]);
    }
  }, [selectedExamForSubjectMgmt, fetchExamSubjects]);


  const resetForm = () => {
    setEditingExam(null);
    setExamName('');
    setSelectedYearId(school?.currentAcademicYearId || '');
    setSelectedTerm(school?.currentTerm || '');
    const defaultScale = gradingScales.find(s => s.isDefault);
    setSelectedGradingScaleId(defaultScale?.id || '');
    setSelectedExamForSubjectMgmt(null);
  };

  const handleEditClick = (exam: Exam) => {
    setEditingExam(exam);
    setExamName(exam.name);
    setSelectedYearId(exam.academicYearId);
    setSelectedTerm(exam.term);
    setSelectedGradingScaleId(exam.defaultGradingScaleId);
    setSelectedExamForSubjectMgmt(exam);
  };
  
  const handleSubmitExam = async () => {
    if (!examName || !selectedYearId || !selectedTerm || !selectedGradingScaleId) {
      toast({ variant: "destructive", title: "Missing Information", description: "Please fill all required exam fields." });
      return;
    }
    setIsSubmitting(true);
    try {
      const examData: Omit<Exam, 'id' | 'createdAt' | 'updatedAt'> = {
        name: examName, academicYearId: selectedYearId, term: selectedTerm, defaultGradingScaleId: selectedGradingScaleId,
      };

      if (editingExam) {
        await updateSchoolSubcollectionItem(schoolId, 'exams', editingExam.id, examData);
        toast({ title: "Exam Updated Successfully" });
        setSelectedExamForSubjectMgmt({ ...editingExam, ...examData });
      } else {
        const newExamId = await addSchoolSubcollectionItem(schoolId, 'exams', examData);
        toast({ title: "Exam Created Successfully" });
        setSelectedExamForSubjectMgmt({ id: newExamId, ...examData });
        fetchPageData(); // Re-fetch all exams to include the new one in the list
      }
      resetForm();
    } catch (error: any) { toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally { setIsSubmitting(false); }
  };
  
  const executeDeleteExam = async () => {
    if (!examToDelete) return;
    setIsSubmitting(true);
    try {
      await deleteSchoolSubcollectionItem(schoolId, 'exams', examToDelete.id);
      toast({ title: "Exam Deleted" });
      setExamToDelete(null);
      fetchPageData();
      if(selectedExamForSubjectMgmt?.id === examToDelete.id) setSelectedExamForSubjectMgmt(null);
    } catch (error: any) { toast({ variant: "destructive", title: "Delete Failed", description: error.message });
    } finally { setIsSubmitting(false); }
  };

  const handleAddExamSubject = async () => {
    if (!selectedExamForSubjectMgmt || !subjectToAddId) {
        toast({variant: "destructive", title: "Selection Missing", description: "Please select an exam and a subject to add."});
        return;
    }
    const maxScore = parseInt(subjectMaxScore, 10);
    if(isNaN(maxScore) || maxScore <= 0 || maxScore > 200) {
        toast({variant: "destructive", title: "Invalid Max Score", description: "Max score must be a positive number (up to 200)."});
        return;
    }
    const coreSubjectsCount = examSubjects.filter(s => s.isCoreSubject).length;
    if (isSubjectCore && coreSubjectsCount >= 4) {
        toast({variant: "destructive", title: "Gradable Subject Limit Reached", description: "You cannot have more than 4 gradable subjects per exam."});
        return;
    }

    setIsAddingSubject(true);
    try {
        const subjectDetails = masterSubjects.find(s => s.id === subjectToAddId);
        if(!subjectDetails) throw new Error("Master subject not found.");
        
        const newExamSubjectData: Omit<ExamSubject, 'id'|'createdAt'> = {
            subjectId: subjectDetails.id,
            subjectName: subjectDetails.subject,
            isCoreSubject: isSubjectCore,
            maxScore,
        };
        await addExamSubject(schoolId, selectedExamForSubjectMgmt.id, newExamSubjectData);
        toast({title: "Subject Added to Exam"});
        fetchExamSubjects(selectedExamForSubjectMgmt.id);
        setSubjectToAddId('');
        setSubjectMaxScore('100');
        setIsSubjectCore(false);
    } catch (error: any) {
        toast({variant: "destructive", title: "Add Subject Failed", description: error.message});
    } finally {
        setIsAddingSubject(false);
    }
  };
  
  const handleDeleteExamSubject = async (examSubjectId: string) => {
    if (!selectedExamForSubjectMgmt) return;
    try {
        await deleteExamSubject(schoolId, selectedExamForSubjectMgmt.id, examSubjectId);
        toast({title: "Subject Removed from Exam"});
        fetchExamSubjects(selectedExamForSubjectMgmt.id);
    } catch(error: any) {
        toast({variant: "destructive", title: "Remove Subject Failed", description: error.message});
    }
  };
  
  const getYearName = (yearId: string) => academicYears.find(y => y.id === yearId)?.year || yearId;
  const getScaleName = (scaleId: string) => gradingScales.find(s => s.id === scaleId)?.name || scaleId;
  const availableTerms = schoolTerms.filter(t => t.academicYearId === selectedYearId);
  const subjectsAvailableToAdd = masterSubjects.filter(ms => !examSubjects.some(es => es.subjectId === ms.id));

  if (isLoading) { return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>; }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <PenSquare className="mr-3 h-6 w-6 text-primary"/>
            {editingExam ? `Edit Exam: ${editingExam.name}` : 'Create New Exam'}
          </CardTitle>
          <CardDescription>
            Define an examination series, like "Mid-Term" or "Finals", for a specific academic year and term.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input placeholder="Exam Name (e.g., Mid-Term)" value={examName} onChange={e => setExamName(e.target.value)} disabled={isSubmitting} />
          <Select value={selectedYearId} onValueChange={setSelectedYearId} disabled={isSubmitting}>
            <SelectTrigger><SelectValue placeholder="Select Academic Year" /></SelectTrigger>
            <SelectContent>{academicYears.map(y => <SelectItem key={y.id} value={y.id}>{y.year}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={selectedTerm} onValueChange={setSelectedTerm} disabled={!selectedYearId || isSubmitting}>
            <SelectTrigger><SelectValue placeholder="Select Term" /></SelectTrigger>
            <SelectContent>{availableTerms.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={selectedGradingScaleId} onValueChange={setSelectedGradingScaleId} disabled={isSubmitting}>
            <SelectTrigger><SelectValue placeholder="Select Default Grading Scale" /></SelectTrigger>
            <SelectContent>{gradingScales.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex gap-2 lg:col-span-4">
            <Button onClick={handleSubmitExam} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : (editingExam ? <Edit className="mr-2 h-4 w-4"/> : <PlusCircle className="mr-2 h-4 w-4"/>)}
              {editingExam ? 'Update Exam' : 'Create Exam'}
            </Button>
            {editingExam && <Button variant="outline" onClick={resetForm}>Cancel Edit</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Existing Exams</CardTitle></CardHeader>
        <CardContent>
            {exams.length === 0 ? <p className="text-sm text-muted-foreground">No exams created yet.</p> : (
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                <thead><tr className="text-left border-b"><th className="p-2">Exam Name</th><th className="p-2">Academic Context</th><th className="p-2">Default Scale</th><th className="p-2 text-right">Actions</th></tr></thead>
                <tbody>
                {exams.map(exam => (
                    <tr key={exam.id} className={`border-b ${selectedExamForSubjectMgmt?.id === exam.id ? 'bg-primary/10' : ''}`}>
                    <td className="p-2 font-medium">{exam.name}</td><td className="p-2">{getYearName(exam.academicYearId)} - {exam.term}</td><td className="p-2">{getScaleName(exam.defaultGradingScaleId)}</td>
                    <td className="p-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleEditClick(exam)}><Edit className="h-4 w-4 mr-1"/>Edit Details</Button>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedExamForSubjectMgmt(exam)}><Settings className="h-4 w-4 mr-1"/>Manage Subjects</Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setExamToDelete(exam)}><Trash2 className="h-4 w-4 mr-1"/>Delete Exam</Button>
                    </td></tr>
                ))}
                </tbody></table>
            </div>
            )}
        </CardContent>
      </Card>
      
      {selectedExamForSubjectMgmt && (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center"><BookCopy className="mr-3 h-5 w-5 text-primary"/>Manage Subjects for "{selectedExamForSubjectMgmt.name}"</CardTitle>
                <CardDescription>Add subjects from your master list to this exam, set their max scores, and mark which ones are core/gradable for aggregate calculation.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="p-4 border rounded-lg bg-muted/30 space-y-3 mb-6">
                     <h4 className="font-semibold">Add Subject to Exam</h4>
                     <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-2"><Label>Subject</Label><Select value={subjectToAddId} onValueChange={setSubjectToAddId}><SelectTrigger><SelectValue placeholder="Select a subject..." /></SelectTrigger><SelectContent>{subjectsAvailableToAdd.map(s => <SelectItem key={s.id} value={s.id}>{s.subject}</SelectItem>)}</SelectContent></Select></div>
                        <div><Label>Max Score</Label><Input value={subjectMaxScore} onChange={e => setSubjectMaxScore(e.target.value)} type="number" placeholder="100"/></div>
                        <div className="flex items-center space-x-2"><Switch id="is-core" checked={isSubjectCore} onCheckedChange={setIsSubjectCore} /><Label htmlFor="is-core">Core/Gradable Subject</Label></div>
                     </div>
                     <Button onClick={handleAddExamSubject} disabled={!subjectToAddId || isAddingSubject}>
                        {isAddingSubject ? <Loader2 className="animate-spin mr-2"/> : <PlusCircle className="mr-2 h-4 w-4"/>} Add Subject
                     </Button>
                </div>

                <Separator className="my-4"/>

                <h4 className="font-semibold mb-2">Subjects in This Exam</h4>
                {isSubjectLoading ? <Loader2 className="animate-spin"/> : examSubjects.length === 0 ? <p className="text-sm text-muted-foreground">No subjects added to this exam yet.</p> : (
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="border-b"><th className="p-2 text-left">Subject</th><th className="p-2 text-center">Max Score</th><th className="p-2 text-center">Is Gradable?</th><th className="p-2 text-right">Actions</th></tr></thead>
                            <tbody>
                            {examSubjects.map(es => (
                                <tr key={es.id} className="border-b"><td className="p-2">{es.subjectName}</td><td className="p-2 text-center">{es.maxScore}</td><td className="p-2 text-center">{es.isCoreSubject ? 'Yes' : 'No'}</td>
                                <td className="p-2 text-right"><Button variant="ghost" size="icon" onClick={() => handleDeleteExamSubject(es.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button></td></tr>
                            ))}
                            </tbody>
                        </table>
                     </div>
                )}
                 {examSubjects.filter(s => s.isCoreSubject).length > 4 && (
                    <div className="mt-2 text-destructive text-sm flex items-center gap-1"><AlertTriangle className="h-4 w-4"/>Warning: More than 4 core/gradable subjects selected. This may affect aggregate calculations.</div>
                 )}
            </CardContent>
        </Card>
      )}

      <AlertDialog open={!!examToDelete} onOpenChange={() => setExamToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the exam "{examToDelete?.name}". This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteExam} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
                {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : null} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
