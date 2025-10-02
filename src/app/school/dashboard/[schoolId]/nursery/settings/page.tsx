
// src/app/school/dashboard/[schoolId]/nursery/settings/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { 
  getSchoolSubcollectionItems, 
  addSchoolSubcollectionItem, 
  deleteSchoolSubcollectionItem 
} from '@/services';
import type { SchoolAcademicYear, SchoolTerm, NurseryGradeLevel, NurseryCompetence, NurseryAssessment, Exam } from '@/types/school';
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc, deleteDoc, writeBatch } from 'firebase/firestore'; 
import { firestore } from '@/config/firebase';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, PlusCircle, Trash2, Settings, Star, Shapes, BookCopy, Palette, DatabaseZap, AlertTriangle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


const DEFAULT_GRADE_SCALE_ID = 'default_scale';

const exampleGradingScale = [
  { name: 'Exceeds', remark: 'Consistently exceeds age-level expectations.', color: '#10B981' },
  { name: 'Meeting', remark: 'Consistently meets age-level expectations.', color: '#3B82F6' },
  { name: 'Progressing', remark: 'Is developing the skill and sometimes shows it.', color: '#FBBF24' },
  { name: 'Beginning', remark: 'Is just beginning to learn the skill.', color: '#F97316' },
  { name: 'Needs Support', remark: 'Needs more support and practice in this area.', color: '#EF4444' },
];

const exampleCompetences = [
    { category: 'Social Skills', name: 'Initiates play with others independently' },
    { category: 'Social Skills', name: 'Resolves minor conflicts using words or gestures' },
    { category: 'Social Skills', name: 'Participates in group activities with enthusiasm' },
    { category: 'Social Skills', name: 'Shows empathy by comforting peers or responding to their emotions' },
    { category: 'Emotional Regulation', name: 'Calms self after frustration with minimal adult intervention' },
    { category: 'Emotional Regulation', name: 'Expresses disappointment or frustration appropriately' },
    { category: 'Listening & Speaking', name: 'Responds to multi-step instructions accurately' },
    { category: 'Listening & Speaking', name: 'Engages in back-and-forth conversations' },
    { category: 'Reading Readiness', name: 'Understands that print conveys meaning' },
    { category: 'Reading Readiness', name: 'Recognizes own name in print' },
    { category: 'Writing Readiness', name: 'Traces lines, shapes, or letters' },
    { category: 'Writing Readiness', name: 'Attempts to write simple letters or numbers' },
    { category: 'Number Sense', name: 'Compares quantities using terms like "more" or "less"' },
    { category: 'Number Sense', name: 'Recognizes numbers 1-20' },
    { category: 'Gross Motor Skills', name: 'Balances on one foot' },
    { category: 'Gross Motor Skills', name: 'Kicks a ball with accuracy' },
    { category: 'Fine Motor Skills', name: 'Builds with blocks or connectors' },
    { category: 'Fine Motor Skills', name: 'Uses utensils with minimal spilling' },
    { category: 'Self-Help Skills', name: 'Manages personal belongings' },
    { category: 'Self-Help Skills', name: 'Follows classroom routines' },
];


function CompetenceManager({
  schoolId,
  items,
  setItems,
  newItemName,
  setNewItemName,
  newCategory,
  setNewCategory
}: {
  schoolId: string;
  items: NurseryCompetence[];
  setItems: React.Dispatch<React.SetStateAction<NurseryCompetence[]>>;
  newItemName: string; setNewItemName: (v: string) => void;
  newCategory: string; setNewCategory: (v: string) => void;
}) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const handleAddItem = async () => {
    if (!newItemName.trim() || !newCategory.trim()) {
      toast({ variant: "destructive", description: "Category and Competence Name are required." });
      return;
    }
    setIsProcessing('add');
    try {
      const dataToAdd = { name: newItemName.trim(), category: newCategory.trim() };
      const docId = await addSchoolSubcollectionItem(schoolId, 'nurseryCompetences', dataToAdd);
      setItems(prev => [...prev, { id: docId, ...dataToAdd }].sort((a,b) => (a.category||"").localeCompare(b.category||"") || (a.name||"").localeCompare(b.name||"")));
      setNewItemName(''); setNewCategory('');
      toast({ title: "Competence Added" });
    } catch (error: any) {
      toast({ variant: "destructive", title: `Add Error`, description: error.message });
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDeleteItem = async (itemId: string, name?: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name || 'item'}"?`)) return;
    setIsProcessing(itemId);
    try {
      await deleteSchoolSubcollectionItem(schoolId, 'nurseryCompetences', itemId);
      setItems(prev => prev.filter(item => item.id !== itemId));
      toast({ title: "Competence Deleted" });
    } catch (error: any) {
      toast({ variant: "destructive", title: `Delete Error`, description: error.message });
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader><CardTitle className="text-lg flex items-center"><Shapes className="mr-2 h-5 w-5"/>Manage Competences</CardTitle></CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 mb-4">
            <div className='flex-grow'><Label htmlFor="new-competence-category">Category*</Label><Input id="new-competence-category" value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="e.g., Social Skills" disabled={!!isProcessing} className="mt-1" /></div>
            <div className='flex-grow'><Label htmlFor="new-competence-name">Competence Name*</Label><Input id="new-competence-name" value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="e.g., Shares with others" disabled={!!isProcessing} className="mt-1" /></div>
            <Button onClick={handleAddItem} disabled={!!isProcessing} className="shrink-0 self-end">
                {isProcessing === 'add' ? <Loader2 className="animate-spin h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
            </Button>
        </div>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">No items defined yet.</p> : (
          <ScrollArea className="h-48 border rounded-md">
            <ul className="p-2 space-y-1">
              {items.map(item => (
                <li key={item.id} className="flex justify-between items-center p-2 bg-muted/50 rounded-md text-sm">
                   <p><span className="text-xs text-muted-foreground">{item.category}: </span>{item.name}</p>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item.id, item.name)} disabled={isProcessing === item.id}>
                    {isProcessing === item.id ? <Loader2 className="animate-spin h-4 w-4" /> : <Trash2 className="text-destructive h-4 w-4" />}
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}


export default function NurserySettingsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);

  // Data states
  const [exams, setExams] = useState<Exam[]>([]);
  const [gradeLevels, setGradeLevels] = useState<NurseryGradeLevel[]>([]);
  const [competences, setCompetences] = useState<NurseryCompetence[]>([]);
  const [assessments, setAssessments] = useState<NurseryAssessment[]>([]);

  // Form states for adding items
  const [newGradeLevelName, setNewGradeLevelName] = useState('');
  const [newGradeLevelRemark, setNewGradeLevelRemark] = useState('');
  const [newGradeLevelColor, setNewGradeLevelColor] = useState('#4CAF50');
  const [isProcessingGrade, setIsProcessingGrade] = useState<string | null>(null);

  const [newCompetenceCategory, setNewCompetenceCategory] = useState('');
  const [newCompetenceName, setNewCompetenceName] = useState('');

  const [selectedExamIdForAssessment, setSelectedExamIdForAssessment] = useState('');
  const [selectedCompetenceIds, setSelectedCompetenceIds] = useState<Record<string, boolean>>({});
  const [isAddingAssessment, setIsAddingAssessment] = useState(false);

  // State for example data loading
  const [isSeedingData, setIsSeedingData] = useState(false);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);

  const fetchAllData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const gradeScaleDocRef = doc(firestore, `schools/${schoolId}/nurseryGradeScales`, DEFAULT_GRADE_SCALE_ID);
      const gradeScaleSnap = await getDoc(gradeScaleDocRef);
      if (!gradeScaleSnap.exists()) {
        await setDoc(gradeScaleDocRef, { name: 'Default Nursery Scale', createdAt: serverTimestamp() });
      }

      const [examsData, gradesData, competencesData, assessmentsData] = await Promise.all([
        getSchoolSubcollectionItems<Exam>(schoolId, 'exams'),
        getSchoolSubcollectionItems<NurseryGradeLevel>(schoolId, `nurseryGradeScales/${DEFAULT_GRADE_SCALE_ID}/levels`),
        getSchoolSubcollectionItems<NurseryCompetence>(schoolId, 'nurseryCompetences'),
        getSchoolSubcollectionItems<NurseryAssessment>(schoolId, 'nurseryAssessments'),
      ]);
      setExams(examsData);
      setGradeLevels(gradesData);
      setCompetences(competencesData.sort((a,b) => (a.category || "").localeCompare(b.category || "") || (a.name || "").localeCompare(b.name || "")));
      setAssessments(assessmentsData);

    } catch (error) { toast({ variant: "destructive", title: "Error", description: "Could not load academic configuration lists." });
    } finally { setIsLoading(false); }
  }, [schoolId, user, toast]);

  useEffect(() => { fetchAllData() }, [fetchAllData]);

  const handleAddGradeLevel = async () => {
    if (!newGradeLevelName.trim()) {
        toast({variant: "destructive", title: "Missing Name", description: "Grade level name is required."});
        return;
    }
    setIsProcessingGrade('add');
    try {
        const gradeData = { 
            name: newGradeLevelName.trim(), 
            remark: newGradeLevelRemark.trim(), 
            color: newGradeLevelColor
        };
        const gradesCollectionRef = collection(firestore, `schools/${schoolId}/nurseryGradeScales/${DEFAULT_GRADE_SCALE_ID}/levels`);
        const docRef = await addDoc(gradesCollectionRef, gradeData);
        setGradeLevels(prev => [...prev, { id: docRef.id, ...gradeData }]);
        setNewGradeLevelName(''); setNewGradeLevelRemark(''); setNewGradeLevelColor('#4CAF50');
        toast({title: "Grade Level Added"});
    } catch (error: any) {
        toast({variant: "destructive", title: "Error", description: error.message});
    } finally {
        setIsProcessingGrade(null);
    }
  };

  const handleDeleteGradeLevel = async (levelId: string, levelName?: string) => {
    if (!window.confirm(`Are you sure you want to delete grade level "${levelName || 'item'}"?`)) return;
    setIsProcessingGrade(levelId);
    try {
        const levelDocRef = doc(firestore, `schools/${schoolId}/nurseryGradeScales/${DEFAULT_GRADE_SCALE_ID}/levels`, levelId);
        await deleteDoc(levelDocRef);
        setGradeLevels(prev => prev.filter(l => l.id !== levelId));
        toast({title: "Grade Level Deleted"});
    } catch (error: any) {
         toast({variant: "destructive", title: "Delete Error", description: error.message});
    } finally {
        setIsProcessingGrade(null);
    }
  };

  const handleAddAssessment = async () => {
    const includedCompetenceIds = Object.entries(selectedCompetenceIds).filter(([_, checked]) => checked).map(([id, _]) => id);
    const selectedExam = exams.find(e => e.id === selectedExamIdForAssessment);
    
    if (!selectedExam || includedCompetenceIds.length === 0) {
        toast({variant: "destructive", title: "Missing Information", description: "Please select an exam and at least one competence."});
        return;
    }
    setIsAddingAssessment(true);
    try {
        const assessmentData: Omit<NurseryAssessment, 'id'> = {
            name: `${selectedExam.name} - Nursery Assessment`,
            academicYearId: selectedExam.academicYearId,
            term: selectedExam.term,
            examId: selectedExam.id, // Link to the primary/secondary exam
            competenceIds: includedCompetenceIds,
            gradeScaleId: DEFAULT_GRADE_SCALE_ID,
        };
        await addSchoolSubcollectionItem(schoolId, 'nurseryAssessments', assessmentData);
        toast({title: "Assessment Created"});
        setSelectedExamIdForAssessment('');
        setSelectedCompetenceIds({});
        fetchAllData();
    } catch(error: any) {
        toast({variant: "destructive", title: "Error", description: error.message});
    } finally {
        setIsAddingAssessment(false);
    }
  };

  const handleDeleteAssessment = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete assessment "${name}"?`)) return;
    try {
        await deleteSchoolSubcollectionItem(schoolId, 'nurseryAssessments', id);
        toast({title: "Assessment Deleted"});
        fetchAllData();
    } catch(error: any) {
         toast({variant: "destructive", title: "Delete Error", description: error.message});
    }
  };

  const handleSeedData = async () => {
    setShowSeedConfirm(false);
    setIsSeedingData(true);
    toast({ title: "Loading Example Data...", description: "This may take a moment." });

    try {
      const batch = writeBatch(firestore);
      const gradeScaleDocRef = doc(firestore, `schools/${schoolId}/nurseryGradeScales`, DEFAULT_GRADE_SCALE_ID);
      const gradeScaleSnap = await getDoc(gradeScaleDocRef);
      if(!gradeScaleSnap.exists()) {
        batch.set(gradeScaleDocRef, { name: 'Default Nursery Scale', createdAt: serverTimestamp() });
      }

      const gradeLevelsCollectionRef = collection(gradeScaleDocRef, 'levels');
      exampleGradingScale.forEach(grade => {
        const newGradeRef = doc(gradeLevelsCollectionRef);
        batch.set(newGradeRef, grade);
      });

      const competencesCollectionRef = collection(firestore, `schools/${schoolId}/nurseryCompetences`);
      exampleCompetences.forEach(comp => {
        const newCompRef = doc(competencesCollectionRef);
        batch.set(newCompRef, comp);
      });

      await batch.commit();
      toast({ title: "Success", description: "Example templates have been loaded." });
      await fetchAllData();
    } catch (error: any) {
      console.error("Error seeding nursery data:", error);
      toast({ variant: "destructive", title: "Seeding Failed", description: error.message });
    } finally {
      setIsSeedingData(false);
    }
  };

  const canSeedData = gradeLevels.length === 0 && competences.length === 0;

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader className="flex flex-row justify-between items-start">
            <div>
                <CardTitle className="text-2xl flex items-center">
                    <Settings className="mr-3 h-6 w-6 text-primary"/>
                    Nursery Assessment Settings
                </CardTitle>
                <CardDescription>
                    Configure the building blocks for your nursery progress reports: grading, competences, and assessment sheets.
                </CardDescription>
            </div>
            {canSeedData && (
              <div className="text-right">
                <Button variant="outline" size="sm" onClick={() => setShowSeedConfirm(true)} disabled={isSeedingData}>
                    {isSeedingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <DatabaseZap className="mr-2 h-4 w-4" />}
                    {isSeedingData ? "Loading..." : "Load Example Templates"}
                </Button>
              </div>
            )}
        </CardHeader>
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-lg flex items-center"><Palette className="mr-2 h-5 w-5"/>Manage Nursery Grading Scale</CardTitle></CardHeader>
            <CardContent>
                <div className="flex flex-col gap-2 mb-4">
                    <div className='flex items-end gap-2'>
                        <div className='flex-grow'><Label htmlFor="new-grade-name">Grade Name*</Label><Input id="new-grade-name" value={newGradeLevelName} onChange={e => setNewGradeLevelName(e.target.value)} disabled={!!isProcessingGrade} /></div>
                        <div className='flex-grow'><Label htmlFor="new-grade-remark">Remark</Label><Input id="new-grade-remark" value={newGradeLevelRemark} onChange={e => setNewGradeLevelRemark(e.target.value)} disabled={!!isProcessingGrade}/></div>
                        <div><Label htmlFor="new-grade-color">Color</Label><Input id="new-grade-color" type="color" value={newGradeLevelColor} onChange={e => setNewGradeLevelColor(e.target.value)} disabled={!!isProcessingGrade} className="p-1 h-9"/></div>
                        <Button onClick={handleAddGradeLevel} disabled={!!isProcessingGrade} className="shrink-0 self-end">
                            {isProcessingGrade === 'add' ? <Loader2 className="animate-spin h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
                 {gradeLevels.length === 0 ? <p className="text-sm text-muted-foreground">No grade levels defined yet.</p> : (
                  <ScrollArea className="h-48 border rounded-md">
                    <ul className="p-2 space-y-1">
                      {gradeLevels.map(item => (
                        <li key={item.id} className="flex justify-between items-center p-2 bg-muted/50 rounded-md text-sm">
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: item.color }}></div>
                            <div>{item.name}<span className="text-xs text-muted-foreground"> - "{item.remark}"</span></div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteGradeLevel(item.id, item.name)} disabled={isProcessingGrade === item.id}>
                            {isProcessingGrade === item.id ? <Loader2 className="animate-spin h-4 w-4" /> : <Trash2 className="text-destructive h-4 w-4" />}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
            </CardContent>
        </Card>

        <CompetenceManager 
            items={competences} 
            setItems={setCompetences} 
            newItemName={newCompetenceName} 
            setNewItemName={setNewCompetenceName}
            newCategory={newCompetenceCategory}
            setNewCategory={setNewCompetenceCategory}
            schoolId={schoolId} 
         />
      </div>

      <Separator className="my-8"/>
      
      <Card className="shadow-lg">
          <CardHeader><CardTitle className="text-xl flex items-center"><BookCopy className="mr-3 h-5 w-5 text-primary"/>Manage Assessments</CardTitle></CardHeader>
          <CardContent>
              <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                  <h3 className="font-semibold text-lg">Create New Assessment Sheet</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                          <Label>Link to Existing Exam*</Label>
                          <Select value={selectedExamIdForAssessment} onValueChange={setSelectedExamIdForAssessment} disabled={exams.length === 0}>
                            <SelectTrigger><SelectValue placeholder="Select an Exam" /></SelectTrigger>
                            <SelectContent>
                                {exams.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.term})</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground mt-1">This links the nursery assessment to a main school exam for the same period.</p>
                      </div>
                  </div>
                  <div>
                      <Label className="font-semibold">Competences to Include*</Label>
                      <ScrollArea className="h-40 border rounded-md p-2 mt-1">
                          {competences.map(c => (
                              <div key={c.id} className="flex items-center space-x-2"><Checkbox id={`comp-${c.id}`} checked={!!selectedCompetenceIds[c.id]} onCheckedChange={checked => setSelectedCompetenceIds(prev => ({...prev, [c.id]: !!checked}))} /><Label htmlFor={`comp-${c.id}`} className="font-normal text-sm">{c.category}: {c.name}</Label></div>
                          ))}
                      </ScrollArea>
                  </div>
                  <Button onClick={handleAddAssessment} disabled={isAddingAssessment}>{isAddingAssessment ? <Loader2 className="animate-spin mr-2"/> : <PlusCircle className="mr-2 h-4 w-4"/>}Create Assessment Sheet</Button>
              </div>

               <div className="mt-6">
                    <h3 className="font-semibold text-md mb-2">Existing Assessments:</h3>
                    {assessments.length === 0 ? <p className="text-sm text-muted-foreground">No assessments defined yet.</p> : (
                        <div className="space-y-2">
                        {assessments.map(a => (
                            <div key={a.id} className="flex justify-between items-center p-2 bg-muted/50 rounded-md text-sm">
                                <div><span className="font-semibold">{a.name}</span> <span className="text-xs text-muted-foreground">({exams.find(e=>e.id===a.examId)?.term || 'N/A'})</span></div>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteAssessment(a.id, a.name)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                            </div>
                        ))}
                        </div>
                    )}
                </div>
          </CardContent>
      </Card>
      
      <AlertDialog open={showSeedConfirm} onOpenChange={setShowSeedConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5 text-amber-500" /> Confirm Loading Example Data
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will populate your nursery settings with a comprehensive set of example grading levels and competences.
              This action is only recommended for a fresh setup and cannot be undone. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSeedData}>Yes, Load Examples</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
