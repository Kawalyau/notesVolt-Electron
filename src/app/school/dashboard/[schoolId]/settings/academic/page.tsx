// src/app/school/dashboard/[schoolId]/settings/academic/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { 
  getSchoolById, 
  updateSchoolData, 
  getSchoolSubcollectionItems, 
  addSchoolSubcollectionItem, 
  deleteSchoolSubcollectionItem,
  updateSchoolTerm
} from '@/services';
import { firestore } from '@/config/firebase'; // Firestore needed for serverTimestamp if used directly
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import type { School, AcademicSettingsFormValues, SchoolClass, SchoolSubject, SchoolStream, SchoolAcademicYear, PhysicalRequirement, NewPhysicalRequirementState, SchoolTerm } from '@/types/school';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, BookOpen, PlusCircle, Trash2, Tag, PackageSearch, LayoutList, CalendarDays, Clock, Lock, Unlock, Upload } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { ImportSchoolClassesDialog } from '@/components/school/import-school-classes-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';


// Zod schema for general academic settings form
const academicSettingsFormSchema = z.object({
  currentAcademicYearId: z.string().optional().nullable(),
  currentTerm: z.string().max(50, "Term name too long").optional().nullable(),
  termStructure: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
});

interface SubcollectionManagerProps<T extends { id: string; name?: string; class?: string; subject?: string; year?: string; code?: string; academicYearId?: string; academicYearName?: string; isClosed?: boolean; }> {
  title: string;
  description?: string;
  subcollectionName: 'schoolClasses' | 'schoolSubjects' | 'schoolStreams' | 'schoolAcademicYears' | 'schoolTerms';
  schoolId: string;
  itemDisplayField: keyof T;
  itemNameSingular: string;
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  newItemName: string;
  setNewItemName: (value: string) => void;
  additionalInputFields?: Array<{ name: string; label: string; placeholder?: string; value: string; onChange: (value: string) => void; type?: string; options?: Array<{value: string; label: string}>; componentType?: 'input' | 'select'}>;
  onAddItemCustomLogic?: (name: string, additionalInputs: Record<string, string>) => Promise<any>;
  onImportClick?: () => void;
  onToggleItemStatus?: (itemId: string, currentStatus: boolean) => Promise<void>;
}

function SubcollectionManager<T extends { id: string; name?: string; class?: string; subject?: string; year?: string; code?: string; academicYearId?: string; academicYearName?: string; isClosed?: boolean; }>({
  title, description, subcollectionName, schoolId, itemDisplayField, itemNameSingular,
  items, setItems, newItemName, setNewItemName, additionalInputFields, onAddItemCustomLogic, onImportClick, onToggleItemStatus
}: SubcollectionManagerProps<T>) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState<string | null>(null); // Stores ID of item being processed or 'add'

  const handleAddItem = async () => {
    const mainNameValue = newItemName.trim();
    let allAdditionalInputsEmpty = true;
    const additionalData = additionalInputFields?.reduce((acc, field) => {
      if (field.value.trim()) allAdditionalInputsEmpty = false;
      acc[field.name] = field.value.trim();
      return acc;
    }, {} as Record<string, string>) || {};

    if (!mainNameValue && (!additionalInputFields || allAdditionalInputsEmpty)) {
      toast({ variant: "destructive", description: `${itemNameSingular} details cannot be empty.` });
      return;
    }
    setIsProcessing('add');
    try {
      let dataToAdd: any = {};
      if (subcollectionName === 'schoolClasses') { dataToAdd['class'] = mainNameValue; }
      else if (subcollectionName === 'schoolSubjects') { dataToAdd['subject'] = mainNameValue; }
      else if (subcollectionName === 'schoolAcademicYears') { dataToAdd['year'] = mainNameValue; }
      else if (subcollectionName === 'schoolTerms') { dataToAdd['name'] = mainNameValue; } 
      else { dataToAdd[itemDisplayField as string] = mainNameValue; }
      
      Object.assign(dataToAdd, additionalData);

      let docId: string;
      if (onAddItemCustomLogic) { docId = await onAddItemCustomLogic(mainNameValue, additionalData); }
      else { docId = await addSchoolSubcollectionItem(schoolId, subcollectionName, dataToAdd); }
      
      const fullNewItem: T = { id: docId, ...dataToAdd } as T;
      if (!fullNewItem.name && fullNewItem[itemDisplayField as keyof T]) { (fullNewItem as any).name = String(fullNewItem[itemDisplayField as keyof T]); }
      
      setItems(prev => [...prev, fullNewItem].sort((a, b) => String(a[itemDisplayField as keyof T] || a.name || '').localeCompare(String(b[itemDisplayField as keyof T] || b.name || ''))));
      setNewItemName('');
      additionalInputFields?.forEach(field => field.onChange(''));
      toast({ title: `${itemNameSingular} Added` });
    } catch (error: any) {
      toast({ variant: "destructive", title: `Add Error for ${itemNameSingular}`, description: error.message });
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDeleteItem = async (itemId: string, displayValue: string | undefined) => {
    setIsProcessing(itemId);
    try {
      await deleteSchoolSubcollectionItem(schoolId, subcollectionName, itemId);
      setItems(prev => prev.filter(item => item.id !== itemId));
      toast({ title: `${itemNameSingular} Deleted`, description: `"${displayValue || 'Item'}" removed.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: `Delete Error for ${itemNameSingular}`, description: error.message });
    } finally {
      setIsProcessing(null);
    }
  };

  const handleToggleStatus = async (itemId: string, currentStatus: boolean) => {
    if (onToggleItemStatus) {
      setIsProcessing(itemId);
      try {
        await onToggleItemStatus(itemId, currentStatus);
        // Parent component will handle refetching/updating items array
        toast({title: "Term Status Updated"});
      } catch (error: any) {
        toast({ variant: "destructive", title: "Status Update Failed", description: error.message});
      } finally {
        setIsProcessing(null);
      }
    }
  };


  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row justify-between items-start">
        <div>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        {onImportClick && (
          <Button onClick={onImportClick} variant="outline" size="sm" className="ml-auto">
            <Upload className="mr-2 h-4 w-4"/> Import
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4 items-end">
          <div className="flex-grow min-w-[150px]">
            <Label htmlFor={`new-${subcollectionName}-name`}>{itemNameSingular} Name*</Label>
            <Input id={`new-${subcollectionName}-name`} value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder={`Enter new ${itemNameSingular.toLowerCase()} name`} disabled={!!isProcessing} className="mt-1" />
          </div>
          {additionalInputFields?.map(field => (
            <div key={field.name} className="flex-grow min-w-[100px]">
              <Label htmlFor={`new-${subcollectionName}-${field.name}`}>{field.label}</Label>
              {field.componentType === 'select' && field.options ? (
                <Select value={field.value} onValueChange={field.onChange} disabled={!!isProcessing || field.options.length === 0}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder={field.placeholder || `Select ${field.label.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.length === 0 && <SelectItem value="_EMPTY_OPTIONS_" disabled>No options available</SelectItem>}
                    {field.options.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input id={`new-${subcollectionName}-${field.name}`} type={field.type || "text"} value={field.value} onChange={(e) => field.onChange(e.target.value)} placeholder={field.placeholder || field.label} disabled={!!isProcessing} className="mt-1 h-9" />
              )}
            </div>
          ))}
          <Button onClick={handleAddItem} disabled={!!isProcessing} className="shrink-0 h-9 self-end">
            {isProcessing === 'add' ? <Loader2 className="animate-spin h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
          </Button>
        </div>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">No {itemNameSingular.toLowerCase()}s defined yet.</p> : (
          <ul className="space-y-2 max-h-60 overflow-y-auto">
            {items.map(item => (
              <li key={item.id} className="flex justify-between items-center p-2 bg-muted/50 rounded-md text-sm">
                <div className="flex flex-col">
                  <span>
                    {String(item[itemDisplayField as keyof T] || item.name || 'Unnamed Item')}
                    {item.code ? ` (${item.code})` : ''}
                    {subcollectionName === 'schoolTerms' && item.academicYearName ? <span className="text-xs text-muted-foreground"> (Year: {item.academicYearName})</span> : ''}
                  </span>
                  {subcollectionName === 'schoolTerms' && (
                    <Badge variant={item.isClosed ? "destructive" : "default"} className="mt-1 w-fit text-xs">
                      {item.isClosed ? "Closed" : "Open"}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {subcollectionName === 'schoolTerms' && onToggleItemStatus && (
                     <Button variant="outline" size="xs" onClick={() => handleToggleStatus(item.id, item.isClosed || false)} disabled={isProcessing === item.id} className="h-7 px-2">
                      {isProcessing === item.id ? <Loader2 className="animate-spin h-3 w-3"/> : (item.isClosed ? <Unlock className="h-3 w-3 mr-1"/> : <Lock className="h-3 w-3 mr-1"/>)}
                      {item.isClosed ? "Re-open" : "Close Term"}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item.id, String(item[itemDisplayField as keyof T] || item.name))} disabled={isProcessing === item.id} className="h-7 w-7">
                    {isProcessing === item.id ? <Loader2 className="animate-spin h-4 w-4" /> : <Trash2 className="text-destructive h-4 w-4" />}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const initialPhysicalRequirementState: NewPhysicalRequirementState = {
  name: '', description: '', category: '', price: 0, quantityPerStudent: 1, unit: 'item',
  assignmentType: 'class', isCompulsory: true, allowPhysicalProvision: false, applicableClassIds: [], notes: ''
};

export default function AcademicSettingsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingMainForm, setIsSubmittingMainForm] = useState(false);

  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [newClassName, setNewClassName] = useState('');
  const [newClassCode, setNewClassCode] = useState('');
  const [isImportClassesDialogOpen, setIsImportClassesDialogOpen] = useState(false);

  const [schoolSubjects, setSchoolSubjects] = useState<SchoolSubject[]>([]);
  const [newSubjectName, setNewSubjectName] = useState('');
  
  const [schoolStreams, setSchoolStreams] = useState<SchoolStream[]>([]);
  const [newStreamName, setNewStreamName] = useState('');

  const [schoolAcademicYears, setSchoolAcademicYears] = useState<SchoolAcademicYear[]>([]);
  const [newAcademicYearName, setNewAcademicYearName] = useState('');

  const [schoolTerms, setSchoolTerms] = useState<SchoolTerm[]>([]);
  const [newTermName, setNewTermName] = useState('');
  const [selectedAcademicYearForNewTerm, setSelectedAcademicYearForNewTerm] = useState('');
  const [termToToggleClose, setTermToToggleClose] = useState<SchoolTerm | null>(null);


  const [physicalRequirements, setPhysicalRequirements] = useState<PhysicalRequirement[]>([]);
  const [newPhysicalRequirement, setNewPhysicalRequirement] = useState<NewPhysicalRequirementState>(initialPhysicalRequirementState);
  const [isAddingPhysicalReq, setIsAddingPhysicalReq] = useState(false);

  const form = useForm<AcademicSettingsFormValues>({
    resolver: zodResolver(academicSettingsFormSchema),
    defaultValues: {
      currentAcademicYearId: "", currentTerm: "", termStructure: "3-Terms", timezone: "Africa/Kampala",
    },
  });
  
  const fetchSubcollectionData = useCallback(async () => {
    if (!schoolId) return;
    try {
      const [classesData, subjectsData, streamsData, academicYearsData, physReqData, termsData] = await Promise.all([
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        getSchoolSubcollectionItems<SchoolSubject>(schoolId, 'schoolSubjects'),
        getSchoolSubcollectionItems<SchoolStream>(schoolId, 'schoolStreams'),
        getSchoolSubcollectionItems<SchoolAcademicYear>(schoolId, 'schoolAcademicYears'),
        getSchoolSubcollectionItems<PhysicalRequirement>(schoolId, 'physicalRequirements'),
        getSchoolSubcollectionItems<SchoolTerm>(schoolId, 'schoolTerms'),
      ]);
      setSchoolClasses(classesData.sort((a, b) => (a.class || "").localeCompare(b.class || "")));
      setSchoolSubjects(subjectsData.sort((a, b) => (a.subject || "").localeCompare(b.subject || "")));
      setSchoolStreams(streamsData.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
      const sortedAcademicYears = academicYearsData.sort((a, b) => (b.year || "").localeCompare(a.year || ""));
      setSchoolAcademicYears(sortedAcademicYears);
      
      const termsWithYearNames = termsData.map(term => ({
        ...term,
        academicYearName: sortedAcademicYears.find(ay => ay.id === term.academicYearId)?.year || 'N/A'
      })).sort((a,b) => `${a.academicYearName} ${a.name}`.localeCompare(`${b.academicYearName} ${b.name}`));
      setSchoolTerms(termsWithYearNames);

      setPhysicalRequirements(physReqData.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    } catch (error) {
      console.error("Error fetching subcollection data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load academic configuration lists." });
    }
  }, [schoolId, toast]);

  useEffect(() => {
    if (!schoolId || !user) return;

    setIsLoading(true);
    getSchoolById(schoolId)
      .then(fetchedSchool => {
        if (fetchedSchool) {
          if (!fetchedSchool.adminUids.includes(user.uid)) {
            toast({ variant: "destructive", title: "Access Denied" });
            router.push('/school/auth'); return;
          }
          setSchool(fetchedSchool);
          form.reset({
            currentAcademicYearId: fetchedSchool.currentAcademicYearId || "",
            currentTerm: fetchedSchool.currentTerm || "",
            termStructure: fetchedSchool.termStructure || "3-Terms",
            timezone: fetchedSchool.timezone || "Africa/Kampala",
          });
          fetchSubcollectionData(); 
        } else {
          toast({ variant: "destructive", title: "Not Found" });
          router.push('/school/auth');
        }
      })
      .catch(err => {
        console.error("Error loading school data:", err);
        toast({ variant: "destructive", title: "Error loading data" });
      })
      .finally(() => setIsLoading(false));
  }, [schoolId, user, router, toast, form, fetchSubcollectionData]);

  const onSubmitMainForm = async (data: AcademicSettingsFormValues) => {
    if (!user || !school) return;
    setIsSubmittingMainForm(true);
    try {
      const schoolDataToUpdate: Partial<School> = {
        currentAcademicYearId: data.currentAcademicYearId || null,
        currentTerm: data.currentTerm || null,
        termStructure: data.termStructure || null,
        timezone: data.timezone || null,
      };
      await updateSchoolData(schoolId, schoolDataToUpdate);
      toast({ title: "Academic Settings Updated" });
      setSchool(prev => prev ? { ...prev, ...schoolDataToUpdate } : null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setIsSubmittingMainForm(false);
    }
  };

  const handleAddPhysicalRequirement = async () => {
    if (!newPhysicalRequirement.name.trim()) {
      toast({ variant: "destructive", title: "Validation Error", description: "Requirement name cannot be empty."});
      return;
    }
    setIsAddingPhysicalReq(true);
    try {
      const dataToAdd: Omit<PhysicalRequirement, 'id' | 'createdAt' | 'updatedAt'> = {
        ...newPhysicalRequirement,
        price: Number(newPhysicalRequirement.price) || 0,
        quantityPerStudent: Number(newPhysicalRequirement.quantityPerStudent) || 1,
        applicableClassIds: newPhysicalRequirement.assignmentType === 'class' ? (newPhysicalRequirement.applicableClassIds || []) : [],
      };
      const docId = await addSchoolSubcollectionItem(schoolId, 'physicalRequirements', dataToAdd);
      setPhysicalRequirements(prev => [...prev, { id: docId, ...dataToAdd } as PhysicalRequirement].sort((a,b) => (a.name || "").localeCompare(b.name || "")));
      setNewPhysicalRequirement(initialPhysicalRequirementState);
      toast({ title: "Physical Requirement Added" });
    } catch (error:any) {
      toast({ variant: "destructive", title: "Add Error", description: error.message });
    } finally {
      setIsAddingPhysicalReq(false);
    }
  };

  const handleDeletePhysicalRequirement = async (reqId: string, reqName: string) => {
    setIsAddingPhysicalReq(true);
    try {
      await deleteSchoolSubcollectionItem(schoolId, 'physicalRequirements', reqId);
      setPhysicalRequirements(prev => prev.filter(r => r.id !== reqId));
      toast({ title: "Physical Requirement Deleted", description: `"${reqName}" removed.`});
    } catch (error: any) {
      toast({variant: "destructive", title: "Delete Error", description: error.message});
    } finally {
      setIsAddingPhysicalReq(false);
    }
  };

  const confirmToggleTermStatus = (term: SchoolTerm) => {
    setTermToToggleClose(term);
  };

  const executeToggleTermStatus = async () => {
    if (!termToToggleClose || !school) return;
    const newStatus = !termToToggleClose.isClosed;
    setIsSubmittingMainForm(true);
    try {
      await updateSchoolTerm(schoolId, termToToggleClose.id, { isClosed: newStatus });
      toast({ title: "Term Status Updated", description: `Term "${termToToggleClose.name}" is now ${newStatus ? 'Closed' : 'Open'}.` });
      
      if (newStatus && school.currentTerm === termToToggleClose.name && school.currentAcademicYearId === termToToggleClose.academicYearId) {
        await updateSchoolData(schoolId, { currentTerm: null });
        setSchool(prev => prev ? { ...prev, currentTerm: null } : null);
        form.setValue("currentTerm", "");
        toast({title: "School's Current Term Cleared", description: "Please select a new active term."});
      }
      fetchSubcollectionData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Error", description: error.message });
    } finally {
      setTermToToggleClose(null);
      setIsSubmittingMainForm(false);
    }
  };
  
  const watchedCurrentAcademicYearId = form.watch("currentAcademicYearId");
  
  const availableTermsForSelectedYear = schoolTerms.filter(term => 
    term.academicYearId === watchedCurrentAcademicYearId && !term.isClosed
  );


  if (isLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  if (!school) return null;

  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><BookOpen className="mr-3 h-6 w-6 text-primary"/>General Academic Settings</CardTitle>
          <CardDescription>Manage current academic year, term, and timezone.</CardDescription>
        </CardHeader>
        <Form {...form}> 
          <form onSubmit={form.handleSubmit(onSubmitMainForm)}>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="currentAcademicYearId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Academic Year*</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""} disabled={schoolAcademicYears.length === 0}>
                          <FormControl><SelectTrigger><SelectValue placeholder={schoolAcademicYears.length === 0 ? "No academic years defined below" : "Select current academic year"} /></SelectTrigger></FormControl>
                          <SelectContent>
                            {schoolAcademicYears.map(ay => <SelectItem key={ay.id} value={ay.id}>{ay.year}</SelectItem>)}
                          </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="currentTerm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Term* (Select from Open Terms)</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value || ""} 
                          disabled={!watchedCurrentAcademicYearId || availableTermsForSelectedYear.length === 0}
                        >
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue 
                                      placeholder={!watchedCurrentAcademicYearId 
                                          ? "Select academic year first" 
                                          : (availableTermsForSelectedYear.length === 0 
                                              ? "No open terms for selected year" 
                                              : "Select current term")
                                      } 
                                    />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {availableTermsForSelectedYear.map(term => <SelectItem key={term.id} value={term.name}>{term.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="termStructure" render={({ field }) => (
                    <FormItem><FormLabel>Term Structure</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Select term structure" /></SelectTrigger></FormControl><SelectContent><SelectItem value="3-Terms">3 Terms (Ugandan Standard)</SelectItem><SelectItem value="2-Semesters">2 Semesters</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="timezone" render={({ field }) => (
                    <FormItem><FormLabel>Timezone</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Select timezone" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Africa/Kampala">Africa/Kampala (EAT)</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isSubmittingMainForm || isLoading} className="bg-primary hover:bg-primary/90">
                {isSubmittingMainForm ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>}
                Save General Settings
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      <Separator className="my-8"/>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SubcollectionManager 
            items={schoolClasses} 
            setItems={setSchoolClasses} 
            newItemName={newClassName} 
            setNewItemName={setNewClassName}
            title="Manage School Classes" 
            description="Define classes (e.g., P1, S1)." 
            subcollectionName="schoolClasses" 
            schoolId={schoolId} 
            itemDisplayField="class" 
            itemNameSingular="Class"
            additionalInputFields={[{ name: 'code', label: 'Class Code (Optional)', placeholder: 'e.g., P1R', value: newClassCode, onChange: setNewClassCode }]}
            onAddItemCustomLogic={async (name, additionalInputs) => addSchoolSubcollectionItem(schoolId, 'schoolClasses', { class: name, code: additionalInputs['code'] || null })}
            onImportClick={() => setIsImportClassesDialogOpen(true)}
        />
        
        <SubcollectionManager 
            items={schoolSubjects} 
            setItems={setSchoolSubjects} 
            newItemName={newSubjectName} 
            setNewItemName={setNewSubjectName}
            title="Manage School Subjects" 
            description="List subjects taught." 
            subcollectionName="schoolSubjects" 
            schoolId={schoolId} 
            itemDisplayField="subject" 
            itemNameSingular="Subject" 
            onAddItemCustomLogic={async (name) => addSchoolSubcollectionItem(schoolId, 'schoolSubjects', { subject: name })} />
        
        <SubcollectionManager 
            items={schoolStreams} 
            setItems={setSchoolStreams} 
            newItemName={newStreamName} 
            setNewItemName={setNewStreamName}
            title="Manage School Streams" 
            description="Define streams if classes are parallel (e.g., Red, Blue)." 
            subcollectionName="schoolStreams" 
            schoolId={schoolId} 
            itemDisplayField="name" 
            itemNameSingular="Stream" />
        
        <SubcollectionManager 
            items={schoolAcademicYears} 
            setItems={setSchoolAcademicYears} 
            newItemName={newAcademicYearName} 
            setNewItemName={setNewAcademicYearName}
            title="Manage Academic Years" 
            description="Define academic years (e.g., 2024)." 
            subcollectionName="schoolAcademicYears" 
            schoolId={schoolId} 
            itemDisplayField="year" 
            itemNameSingular="Academic Year"
            onAddItemCustomLogic={async (yearName) => addSchoolSubcollectionItem(schoolId, 'schoolAcademicYears', { year: yearName })} />

        <SubcollectionManager
          items={schoolTerms}
          setItems={setSchoolTerms}
          newItemName={newTermName}
          setNewItemName={setNewTermName}
          title="Manage School Terms"
          description="Define terms for academic years (e.g., Term 1, Term 2). Closed terms cannot be used for new transactions."
          subcollectionName="schoolTerms"
          schoolId={schoolId}
          itemDisplayField="name"
          itemNameSingular="Term"
          additionalInputFields={[{ 
            name: 'academicYearId', 
            label: 'For Academic Year*', 
            placeholder: 'Select Academic Year', 
            value: selectedAcademicYearForNewTerm, 
            onChange: setSelectedAcademicYearForNewTerm,
            componentType: 'select',
            options: schoolAcademicYears.map(ay => ({ value: ay.id, label: ay.year }))
          }]}
          onAddItemCustomLogic={async (name, additionalInputs) => {
            if (!additionalInputs['academicYearId']) {
              toast({ variant: "destructive", title: "Validation Error", description: "Please select an academic year for the term."});
              throw new Error("Academic Year ID is required for a term.");
            }
            return addSchoolSubcollectionItem(schoolId, 'schoolTerms', { 
              name: name, 
              academicYearId: additionalInputs['academicYearId'],
              isClosed: false, // Default to open
              academicYearName: schoolAcademicYears.find(ay => ay.id === additionalInputs['academicYearId'])?.year || 'N/A' 
            });
          }}
          onToggleItemStatus={(termId, currentIsClosed) => { // Pass this to SubcollectionManager
              const termToUpdate = schoolTerms.find(t => t.id === termId);
              if(termToUpdate) confirmToggleTermStatus(termToUpdate);
              return Promise.resolve(); 
          }}
        />
      </div>

      <Separator className="my-8"/>

      <Card className="shadow-lg">
        <CardHeader><CardTitle className="text-xl flex items-center"><PackageSearch className="mr-3 h-6 w-6 text-primary"/>Manage Physical Requirements</CardTitle><CardDescription>Define items students need and their costs/provision details.</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-4 p-4 border rounded-md bg-muted/10">
            <h3 className="font-semibold text-md">Add New Physical Requirement:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label htmlFor="physReqName">Requirement Name*</Label><Input id="physReqName" value={newPhysicalRequirement.name} onChange={e => setNewPhysicalRequirement(p => ({...p, name: e.target.value}))} disabled={isAddingPhysicalReq || isLoading} className="mt-1" /></div>
              <div><Label htmlFor="physReqCategory">Category</Label><Input id="physReqCategory" value={newPhysicalRequirement.category} onChange={e => setNewPhysicalRequirement(p => ({...p, category: e.target.value}))} disabled={isAddingPhysicalReq || isLoading} className="mt-1"/></div>
              <div><Label htmlFor="physReqPrice">Price (UGX)</Label><Input id="physReqPrice" type="number" value={newPhysicalRequirement.price} onChange={e => setNewPhysicalRequirement(p => ({...p, price: parseFloat(e.target.value) || 0}))} disabled={isAddingPhysicalReq || isLoading} className="mt-1"/></div>
              <div><Label htmlFor="physReqQuantity">Quantity per Student</Label><Input id="physReqQuantity" type="number" value={newPhysicalRequirement.quantityPerStudent} onChange={e => setNewPhysicalRequirement(p => ({...p, quantityPerStudent: parseInt(e.target.value, 10) || 1}))} disabled={isAddingPhysicalReq || isLoading} className="mt-1"/></div>
              <div><Label htmlFor="physReqUnit">Unit</Label><Input id="physReqUnit" value={newPhysicalRequirement.unit} onChange={e => setNewPhysicalRequirement(p => ({...p, unit: e.target.value}))} disabled={isAddingPhysicalReq || isLoading} placeholder="e.g. item, set, book" className="mt-1"/></div>
              <div className="md:col-span-2"><Label htmlFor="physReqDescription">Description</Label><Textarea id="physReqDescription" value={newPhysicalRequirement.description} onChange={e => setNewPhysicalRequirement(p => ({...p, description: e.target.value}))} disabled={isAddingPhysicalReq || isLoading} rows={2} className="mt-1"/></div>
              
              <div className="md:col-span-2 space-y-2">
                  <Label>Assignment Type*</Label>
                  <Select value={newPhysicalRequirement.assignmentType} onValueChange={(value) => setNewPhysicalRequirement(prev => ({ ...prev, assignmentType: value as NewPhysicalRequirementState['assignmentType'], applicableClassIds: value !== 'class' ? [] : prev.applicableClassIds }))} disabled={isAddingPhysicalReq || isLoading}>
                      <SelectTrigger><SelectValue placeholder="Select assignment type" /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="class">Class-wide (Assign to specific classes)</SelectItem>
                          <SelectItem value="optional_general">Optional (General - Available to all students)</SelectItem>
                          {/* <SelectItem value="individual_specific" disabled>Specific Individuals (TBD)</SelectItem> */}
                      </SelectContent>
                  </Select>
              </div>

              {newPhysicalRequirement.assignmentType === 'class' && (
                <div className="md:col-span-2 space-y-2">
                  <Label>Applicable Classes* (if Class-wide)</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1 p-2 border rounded-md max-h-32 overflow-y-auto">
                    {schoolClasses.map(cls => (
                      <div key={cls.id} className="flex items-center space-x-2">
                        <Checkbox id={`phys_req_class_${cls.id}`} checked={(newPhysicalRequirement.applicableClassIds || []).includes(cls.id)} onCheckedChange={checked => { setNewPhysicalRequirement(prev => ({...prev, applicableClassIds: checked ? [...(prev.applicableClassIds || []), cls.id] : (prev.applicableClassIds || []).filter(id => id !== cls.id)}));}} disabled={isAddingPhysicalReq || isLoading}/>
                        <Label htmlFor={`phys_req_class_${cls.id}`} className="text-sm font-normal">{cls.class} {cls.code ? `(${cls.code})` : ''}</Label>
                      </div>
                    ))}
                    {schoolClasses.length === 0 && <p className="text-xs text-muted-foreground">No classes defined yet.</p>}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 md:col-span-1">
                <Switch id="isCompulsory" checked={newPhysicalRequirement.isCompulsory} onCheckedChange={checked => setNewPhysicalRequirement(p => ({...p, isCompulsory: checked ? true : false}))} disabled={isAddingPhysicalReq}/>
                <Label htmlFor="isCompulsory">Is this requirement compulsory?</Label>
              </div>
              <div className="flex items-center gap-2 md:col-span-1">
                <Switch id="allowPhysicalProvision" checked={newPhysicalRequirement.allowPhysicalProvision} onCheckedChange={checked => setNewPhysicalRequirement(p => ({...p, allowPhysicalProvision: checked ? true : false}))} disabled={isAddingPhysicalReq}/>
                <Label htmlFor="allowPhysicalProvision">Allow physical provision?</Label>
              </div>
              <div className="md:col-span-2"><Label htmlFor="physReqNotes">Notes</Label><Textarea id="physReqNotes" value={newPhysicalRequirement.notes} onChange={e => setNewPhysicalRequirement(p => ({...p, notes: e.target.value}))} disabled={isAddingPhysicalReq || isLoading} rows={2} className="mt-1"/></div>
            </div>
            <Button onClick={handleAddPhysicalRequirement} disabled={isAddingPhysicalReq || isLoading || !newPhysicalRequirement.name.trim()} className="mt-3">
              {isAddingPhysicalReq ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <PlusCircle className="h-4 w-4 mr-2"/>} Add Requirement
            </Button>
          </div>
          <div className="mt-6">
            <h3 className="font-semibold text-md mb-2">Existing Physical Requirements:</h3>
            {physicalRequirements.length === 0 ? <p className="text-sm text-muted-foreground">No physical requirements defined yet.</p> : (
              <ul className="space-y-2 max-h-80 overflow-y-auto">
                {physicalRequirements.map(req => (
                  <li key={req.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 bg-muted/50 rounded-md text-sm gap-2">
                    <div>
                      <strong className="block">{req.name}</strong>
                      <span className="text-xs text-muted-foreground block">{req.description || 'No description'}</span>
                      <span className="text-xs text-muted-foreground block">
                        Price: UGX {req.price?.toFixed(2) || '0.00'} | Qty: {req.quantityPerStudent || 1} {req.unit || 'item'} | Comp: {req.isCompulsory ? 'Yes':'No'} | Phys. Prov: {req.allowPhysicalProvision ? 'Yes':'No'}
                      </span>
                       <span className="text-xs text-muted-foreground block">Assign: {req.assignmentType}{req.assignmentType === 'class' && req.applicableClassIds?.length ? ` (${req.applicableClassIds.map(cid => schoolClasses.find(c=>c.id===cid)?.class || cid).join(', ')})`:''}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDeletePhysicalRequirement(req.id, req.name)} disabled={isAddingPhysicalReq || isLoading}><Trash2 className="text-destructive h-4 w-4" /></Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
      
      <ImportSchoolClassesDialog 
        isOpen={isImportClassesDialogOpen} 
        onOpenChange={setIsImportClassesDialogOpen} 
        schoolId={schoolId}
        onImportCompleted={fetchSubcollectionData}
      />
      
      <AlertDialog open={!!termToToggleClose} onOpenChange={() => setTermToToggleClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {termToToggleClose?.isClosed ? "re-open" : "close"} the term "{termToToggleClose?.name}" 
              for {termToToggleClose?.academicYearName}? 
              {termToToggleClose?.isClosed ? " Re-opening allows new transactions for this term." : " Closing prevents new transactions for this term."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTermToToggleClose(null)} disabled={isSubmittingMainForm}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeToggleTermStatus} disabled={isSubmittingMainForm}>
              Yes, {termToToggleClose?.isClosed ? "Re-open Term" : "Close Term"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
