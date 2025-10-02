
// src/app/school/dashboard/[schoolId]/academics/grading-scales/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolSubcollectionItems, addSchoolSubcollectionItem, deleteSchoolSubcollectionItem, updateSchoolSubcollectionItem } from '@/services';
import type { GradingScale, Grade, Division } from '@/types/school';
import { Scaling, PlusCircle, Trash2, Edit, Loader2, Check, Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const ugandanPleGrades: Partial<Grade>[] = [
  { name: 'D1', value: 1, lowerBound: 80, upperBound: 100, comment: 'Excellent' },
  { name: 'D2', value: 2, lowerBound: 70, upperBound: 79, comment: 'Very Good' },
  { name: 'C3', value: 3, lowerBound: 60, upperBound: 69, comment: 'Good' },
  { name: 'C4', value: 4, lowerBound: 55, upperBound: 59, comment: 'Average' },
  { name: 'C5', value: 5, lowerBound: 50, upperBound: 54, comment: 'Fair' },
  { name: 'C6', value: 6, lowerBound: 45, upperBound: 49, comment: 'Pass' },
  { name: 'P7', value: 7, lowerBound: 35, upperBound: 44, comment: 'Pass' },
  { name: 'P8', value: 8, lowerBound: 20, upperBound: 34, comment: 'Pass' },
  { name: 'F9', value: 9, lowerBound: 0, upperBound: 19, comment: 'Fail' },
];

const ugandanPleDivisions: Partial<Division>[] = [
    { id: 'div1', name: 'Division 1', minAggregate: 4, maxAggregate: 12 },
    { id: 'div2', name: 'Division 2', minAggregate: 13, maxAggregate: 23 },
    { id: 'div3', name: 'Division 3', minAggregate: 24, maxAggregate: 30 },
    { id: 'div4', name: 'Division 4', minAggregate: 31, maxAggregate: 34 },
    { id: 'divU', name: 'Ungraded', minAggregate: 35, maxAggregate: 36 },
];


export default function ManageGradingScalesPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingScale, setEditingScale] = useState<GradingScale | null>(null);
  
  // Form state for new/editing scale
  const [scaleName, setScaleName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [failValue, setFailValue] = useState<string>('9');
  const [grades, setGrades] = useState<Partial<Grade>[]>([{ name: 'D1', value: 1, lowerBound: 80, upperBound: 100, comment: 'Excellent' }]);
  const [divisions, setDivisions] = useState<Partial<Division>[]>([{ id: 'div1', name: 'Division 1', minAggregate: 4, maxAggregate: 12 }]);
  
  const fetchGradingScales = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const data = await getSchoolSubcollectionItems<GradingScale>(schoolId, 'gradingScales');
      setGradingScales(data);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load grading scales." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast]);

  useEffect(() => {
    fetchGradingScales();
  }, [fetchGradingScales]);
  
  const resetForm = () => {
    setEditingScale(null);
    setScaleName('');
    setIsDefault(false);
    setFailValue('9');
    setGrades([{ name: 'D1', value: 1, lowerBound: 80, upperBound: 100, comment: 'Excellent' }]);
    setDivisions([{ id: 'div1', name: 'Division 1', minAggregate: 4, maxAggregate: 12 }]);
  };

  const handleEditClick = (scale: GradingScale) => {
    setEditingScale(scale);
    setScaleName(scale.name);
    setIsDefault(scale.isDefault);
    setFailValue(String(scale.failValue || 9));
    setGrades(scale.grades || []);
    setDivisions(scale.divisions || []);
  };
  
  const handleGradeChange = (index: number, field: keyof Grade, value: string | number) => {
    const newGrades = [...grades];
    (newGrades[index] as any)[field] = value;
    setGrades(newGrades);
  };
  const handleDivisionChange = (index: number, field: keyof Division, value: string | number) => {
    const newDivisions = [...divisions];
    (newDivisions[index] as any)[field] = value;
    setDivisions(newDivisions);
  };

  const addGradeRow = () => setGrades([...grades, { name: '', value: grades.length + 1, lowerBound: 0, upperBound: 0, comment: '' }]);
  const removeGradeRow = (index: number) => setGrades(grades.filter((_, i) => i !== index));
  const addDivisionRow = () => setDivisions([...divisions, { id: `div${divisions.length + 1}`, name: '', minAggregate: 0, maxAggregate: 0 }]);
  const removeDivisionRow = (index: number) => setDivisions(divisions.filter((_, i) => i !== index));

  const handleLoadUgandanPLE = () => {
    setScaleName("Ugandan PLE Standard");
    setFailValue('9');
    setGrades(ugandanPleGrades);
    setDivisions(ugandanPleDivisions);
    toast({title: "Template Loaded", description: "Ugandan PLE Grading Scale has been loaded into the form."});
  };

  const handleSubmit = async () => {
    if (!scaleName) {
      toast({ variant: "destructive", title: "Missing Name", description: "Grading scale name is required." });
      return;
    }
    setIsSubmitting(true);
    try {
      const finalGrades = grades.map((g, i) => ({ ...g, id: g.id || `grade-${i}`, value: Number(g.value) || 0 })) as Grade[];
      const finalDivisions = divisions.map((d, i) => ({ ...d, id: d.id || `div-${i}` })) as Division[];
      
      const scaleData: Omit<GradingScale, 'id' | 'createdAt' | 'updatedAt'> = {
        name: scaleName,
        isDefault,
        grades: finalGrades,
        divisions: finalDivisions,
        failValue: parseInt(failValue, 10) || 9,
      };

      if (editingScale) {
        await updateSchoolSubcollectionItem(schoolId, 'gradingScales', editingScale.id, scaleData);
        toast({ title: "Scale Updated" });
      } else {
        await addSchoolSubcollectionItem(schoolId, 'gradingScales', scaleData);
        toast({ title: "Scale Created" });
      }
      resetForm();
      fetchGradingScales();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleDelete = async (scaleId: string) => {
     try {
      await deleteSchoolSubcollectionItem(schoolId, 'gradingScales', scaleId);
      toast({ title: "Scale Deleted" });
      fetchGradingScales();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: error.message });
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
            <div className="flex justify-between items-start">
                 <div>
                    <CardTitle className="text-2xl flex items-center">
                        <Scaling className="mr-3 h-6 w-6 text-primary"/>
                        {editingScale ? `Edit "${editingScale.name}"` : 'Create New Grading Scale'}
                    </CardTitle>
                    <CardDescription>Define how marks are translated into grades and how aggregates determine divisions.</CardDescription>
                </div>
                <Button onClick={handleLoadUgandanPLE} variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4"/> Load Ugandan PLE Scale
                </Button>
            </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <Input className="flex-grow min-w-[200px]" placeholder="Scale Name (e.g., PLE Standard)" value={scaleName} onChange={e => setScaleName(e.target.value)} disabled={isSubmitting} />
            <div className="flex items-center space-x-2">
              <Switch id="is-default-scale" checked={isDefault} onCheckedChange={setIsDefault} disabled={isSubmitting} />
              <Label htmlFor="is-default-scale">Set as Default</Label>
            </div>
             <div>
              <Label htmlFor="fail-value">Failing Grade Value*</Label>
              <Input id="fail-value" className="w-24" type="number" placeholder="e.g. 9" value={failValue} onChange={e => setFailValue(e.target.value)} disabled={isSubmitting} />
            </div>
          </div>
          <Separator />
          <div>
            <Label className="font-semibold text-lg">Grades & Mark Ranges</Label>
            <div className="space-y-2 mt-2">
                <div className="grid grid-cols-6 gap-2 text-xs font-medium text-muted-foreground px-1">
                    <span>Grade Name*</span><span>Value*</span><span>Min Mark %*</span><span>Max Mark %*</span><span className="col-span-2">Comment (Optional)</span>
                </div>
              {grades.map((grade, index) => (
                <div key={index} className="grid grid-cols-6 gap-2 items-center">
                  <Input placeholder="D1" value={grade.name || ''} onChange={e => handleGradeChange(index, 'name', e.target.value)} />
                  <Input type="number" placeholder="1" value={grade.value || ''} onChange={e => handleGradeChange(index, 'value', parseInt(e.target.value))} />
                  <Input type="number" placeholder="80" value={grade.lowerBound || ''} onChange={e => handleGradeChange(index, 'lowerBound', parseInt(e.target.value))} />
                  <Input type="number" placeholder="100" value={grade.upperBound || ''} onChange={e => handleGradeChange(index, 'upperBound', parseInt(e.target.value))} />
                  <div className="flex items-center gap-1 col-span-2">
                    <Input placeholder="Excellent" value={grade.comment || ''} onChange={e => handleGradeChange(index, 'comment', e.target.value)} />
                    <Button variant="ghost" size="icon" onClick={() => removeGradeRow(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addGradeRow}><PlusCircle className="h-4 w-4 mr-1"/>Add Grade Row</Button>
            </div>
          </div>
           <Separator />
          <div>
            <Label className="font-semibold text-lg">Divisions & Aggregate Ranges</Label>
             <div className="space-y-2 mt-2">
                <div className="grid grid-cols-4 gap-2 text-xs font-medium text-muted-foreground px-1">
                    <span>Division Name*</span><span>Min Aggregate*</span><span>Max Aggregate*</span><span/>
                </div>
                {divisions.map((division, index) => (
                    <div key={index} className="grid grid-cols-4 gap-2 items-center">
                    <Input placeholder={`Division ${index + 1}`} value={division.name || ''} onChange={e => handleDivisionChange(index, 'name', e.target.value)} />
                    <Input type="number" placeholder="4" value={division.minAggregate || ''} onChange={e => handleDivisionChange(index, 'minAggregate', parseInt(e.target.value))} />
                    <Input type="number" placeholder="12" value={division.maxAggregate || ''} onChange={e => handleDivisionChange(index, 'maxAggregate', parseInt(e.target.value))} />
                    <Button variant="ghost" size="icon" onClick={() => removeDivisionRow(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                    </div>
                ))}
                 <Button variant="outline" size="sm" onClick={addDivisionRow}><PlusCircle className="h-4 w-4 mr-1"/>Add Division Row</Button>
             </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : (editingScale ? <Edit className="mr-2 h-4 w-4"/> : <PlusCircle className="mr-2 h-4 w-4"/>)}
              {editingScale ? 'Update Scale' : 'Create Scale'}
            </Button>
            {editingScale && <Button variant="outline" onClick={resetForm}>Cancel Edit</Button>}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader><CardTitle>Existing Grading Scales</CardTitle></CardHeader>
        <CardContent>
          {gradingScales.length === 0 ? <p className="text-sm text-muted-foreground">No grading scales defined yet.</p> : (
            <ul className="space-y-3">
              {gradingScales.map(scale => (
                <li key={scale.id} className="border p-3 rounded-md">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">{scale.name} {scale.isDefault && <Badge className="ml-2">Default</Badge>}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEditClick(scale)}><Edit className="h-4 w-4 mr-1"/>Edit</Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(scale.id)}><Trash2 className="h-4 w-4 mr-1"/>Delete</Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
