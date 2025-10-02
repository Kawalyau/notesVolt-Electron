
// src/app/school/dashboard/[schoolId]/academics/report-configs/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, addSchoolSubcollectionItem, deleteSchoolSubcollectionItem, updateSchoolSubcollectionItem } from '@/services';
import type { School, ReportConfiguration, Exam, SchoolAcademicYear, SchoolTerm, GradingScale } from '@/types/school';
import { Settings2, PlusCircle, Trash2, Edit, Loader2, AlertTriangle, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const reportConfigSchema = z.object({
  name: z.string().min(3, "Configuration name is required."),
  academicYearId: z.string().min(1, "Academic Year is required."),
  term: z.string().min(1, "Term is required."),
  gradingScaleId: z.string().min(1, "Grading Scale is required."),
  sources: z.array(z.object({
    examId: z.string().min(1, "Exam selection is required."),
    weight: z.preprocess(
      (val) => parseFloat(String(val)),
      z.number().min(1, "Weight must be > 0").max(100, "Weight must be <= 100")
    )
  })).min(1, "At least one source exam is required.")
}).refine(data => {
    const totalWeight = data.sources.reduce((sum, source) => sum + (source.weight || 0), 0);
    return Math.abs(totalWeight - 100) < 0.1; // Allow for floating point precision
}, {
    message: "Total weight of all sources must be exactly 100%.",
    path: ["sources"],
});

type ReportConfigFormValues = z.infer<typeof reportConfigSchema>;

export default function ManageReportConfigsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ReportConfiguration | null>(null);
  
  const [reportConfigs, setReportConfigs] = useState<ReportConfiguration[]>([]);
  const [availableExams, setAvailableExams] = useState<Exam[]>([]);
  const [academicYears, setAcademicYears] = useState<SchoolAcademicYear[]>([]);
  const [schoolTerms, setSchoolTerms] = useState<SchoolTerm[]>([]);
  const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);
  
  const form = useForm<ReportConfigFormValues>({
    resolver: zodResolver(reportConfigSchema),
    defaultValues: { name: "", academicYearId: "", term: "", gradingScaleId: "", sources: [{ examId: "", weight: 0 }] }
  });
  const { fields, append, remove, update } = useFieldArray({ control: form.control, name: "sources" });
  const watchedSources = form.watch("sources");
  const totalWeight = watchedSources.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);

  const fetchData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const [configs, exams, years, terms, scales] = await Promise.all([
        getSchoolSubcollectionItems<ReportConfiguration>(schoolId, 'reportConfigurations'),
        getSchoolSubcollectionItems<Exam>(schoolId, 'exams'),
        getSchoolSubcollectionItems<SchoolAcademicYear>(schoolId, 'schoolAcademicYears'),
        getSchoolSubcollectionItems<SchoolTerm>(schoolId, 'schoolTerms'),
        getSchoolSubcollectionItems<GradingScale>(schoolId, 'gradingScales'),
      ]);
      setReportConfigs(configs);
      setAvailableExams(exams);
      setAcademicYears(years);
      setSchoolTerms(terms);
      setGradingScales(scales);
    } catch (error) { toast({ variant: "destructive", title: "Error", description: "Could not load required data." }); }
    finally { setIsLoading(false); }
  }, [schoolId, user, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleEditClick = (config: ReportConfiguration) => {
    setEditingConfig(config);
    form.reset({
      name: config.name,
      academicYearId: config.academicYearId,
      term: config.term,
      gradingScaleId: config.gradingScaleId,
      sources: config.sources.map(s => ({ examId: s.examId, weight: s.weight }))
    });
  };

  const resetForm = () => { setEditingConfig(null); form.reset({ name: "", academicYearId: "", term: "", gradingScaleId: "", sources: [{ examId: "", weight: 0 }] }); };

  const handleSubmit = async (values: ReportConfigFormValues) => {
    setIsSubmitting(true);
    try {
      const configData: Omit<ReportConfiguration, 'id' | 'createdAt' | 'updatedAt'> = {
        name: values.name,
        academicYearId: values.academicYearId,
        term: values.term,
        gradingScaleId: values.gradingScaleId,
        sources: values.sources.map(s => ({ ...s, examName: availableExams.find(e => e.id === s.examId)?.name || 'Unknown' }))
      };
      if (editingConfig) {
        await updateSchoolSubcollectionItem(schoolId, 'reportConfigurations', editingConfig.id, configData);
        toast({ title: "Configuration Updated" });
      } else {
        await addSchoolSubcollectionItem(schoolId, 'reportConfigurations', configData);
        toast({ title: "Configuration Created" });
      }
      resetForm();
      fetchData();
    } catch (error: any) { toast({ variant: "destructive", title: "Save Failed", description: error.message }); }
    finally { setIsSubmitting(false); }
  };

  const handleDelete = async (configId: string) => {
    if (!window.confirm("Are you sure you want to delete this report configuration?")) return;
    try {
      await deleteSchoolSubcollectionItem(schoolId, 'reportConfigurations', configId);
      toast({ title: "Configuration Deleted" });
      fetchData();
    } catch (error: any) { toast({ variant: "destructive", title: "Delete Failed", description: error.message }); }
  };

  if (isLoading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Settings2 className="mr-3 h-6 w-6 text-primary"/>
            {editingConfig ? 'Edit Report Configuration' : 'Create New Report Configuration'}
          </CardTitle>
          <CardDescription>
            Define how accumulated reports are generated by combining marks from multiple exams with specific percentage weights.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Config Name*</FormLabel><FormControl><Input {...field} placeholder="e.g., Term 1 Final Report"/></FormControl><FormMessage/></FormItem>)}/>
                <FormField control={form.control} name="academicYearId" render={({ field }) => (<FormItem><FormLabel>Academic Year*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Year"/></SelectTrigger></FormControl><SelectContent>{academicYears.map(y => <SelectItem key={y.id} value={y.id}>{y.year}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
                <FormField control={form.control} name="term" render={({ field }) => (<FormItem><FormLabel>Term*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Term"/></SelectTrigger></FormControl><SelectContent>{schoolTerms.map(t => <SelectItem key={t.id} value={t.name}>{t.name} ({t.academicYearName})</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
              </div>
              <FormField control={form.control} name="gradingScaleId" render={({ field }) => (<FormItem><FormLabel>Final Grading Scale*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Grading Scale"/></SelectTrigger></FormControl><SelectContent>{gradingScales.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
              <div className="space-y-2 pt-2 border-t">
                <FormLabel className="font-semibold text-base">Source Exams & Weights</FormLabel>
                {fields.map((field, index) => (
                    <div key={field.id} className="flex items-end gap-2 p-2 border-l-2">
                        <FormField control={form.control} name={`sources.${index}.examId`} render={({ field: lineField }) => (<FormItem className="flex-grow"><FormLabel className="text-xs">Exam*</FormLabel><Select onValueChange={lineField.onChange} value={lineField.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Exam"/></SelectTrigger></FormControl><SelectContent>{availableExams.map(e=><SelectItem key={e.id} value={e.id}>{e.name} ({e.term})</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
                        <FormField control={form.control} name={`sources.${index}.weight`} render={({ field: lineField }) => (<FormItem><FormLabel className="text-xs">Weight (%)*</FormLabel><FormControl><Input {...lineField} type="number" placeholder="e.g., 50"/></FormControl><FormMessage/></FormItem>)}/>
                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                    </div>
                ))}
                <div className="flex justify-between items-center">
                    <Button type="button" size="sm" variant="outline" onClick={() => append({ examId: "", weight: 0 })}><PlusCircle className="mr-1 h-4 w-4"/>Add Source Exam</Button>
                    <div className={`font-semibold text-sm p-2 rounded-md ${totalWeight !== 100 ? 'text-destructive bg-destructive/10' : 'text-green-600 bg-green-500/10'}`}>
                        {totalWeight !== 100 && <AlertTriangle className="inline h-4 w-4 mr-1"/>}
                        Total Weight: {totalWeight}%
                    </div>
                </div>
                 {form.formState.errors.sources && <FormMessage>{form.formState.errors.sources.root?.message}</FormMessage>}
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 h-4 w-4"/>}{editingConfig ? "Update Configuration" : "Save Configuration"}</Button>
                {editingConfig && <Button variant="outline" onClick={resetForm}>Cancel Edit</Button>}
              </div>
            </CardContent>
          </form>
        </Form>
      </Card>
      <Card>
        <CardHeader><CardTitle>Existing Report Configurations</CardTitle></CardHeader>
        <CardContent>
          {reportConfigs.length === 0 ? <p className="text-sm text-muted-foreground">No report configurations created yet.</p> : (
            <div className="space-y-2">{reportConfigs.map(config => (
                <div key={config.id} className="border p-3 rounded-md">
                  <div className="flex justify-between items-center"><span className="font-semibold">{config.name}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEditClick(config)}><Edit className="mr-1 h-4 w-4"/>Edit</Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(config.id)}><Trash2 className="mr-1 h-4 w-4"/>Delete</Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{academicYears.find(y=>y.id===config.academicYearId)?.year} - {config.term}</p>
                </div>
            ))}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
