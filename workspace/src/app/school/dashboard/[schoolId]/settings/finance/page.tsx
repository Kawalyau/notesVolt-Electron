
// src/app/school/dashboard/[schoolId]/settings/finance/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, updateSchoolData, getSchoolSubcollectionItems, addSchoolSubcollectionItem, deleteSchoolSubcollectionItem, updateChartOfAccountItem, getFeeTransactions, getStudentRequirementAssignmentLogs } from '@/services';
import type { School, SchoolSettingsFormData, FeeItem, FeeItemFormValues, SchoolClass, SchoolAcademicYear, SchoolTerm, ChartOfAccountItem, ChartOfAccountItemFormValues, AccountType, JournalEntry } from '@/types/school';
import { storage, firestore } from '@/config/firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Timestamp, serverTimestamp, collection as firestoreCollection, query as firestoreQuery, where, getDocs as getFirestoreDocs, writeBatch, doc, orderBy } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from '@/components/ui/progress';
import { Loader2, Save, DollarSign, FileText, XCircle, PlusCircle, Trash2, Tag, Upload, Settings, Landmark, Edit, Briefcase, Award } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ImportFeeItemsDialog } from '@/components/school/import-fee-items-dialog';
import { Dialog as ShadcnDialog, DialogTrigger, DialogContent as ShadcnDialogContent, DialogHeader as ShadcnDialogHeader, DialogTitle as ShadcnDialogTitle, DialogFooter as ShadcnDialogFooter, DialogDescription as ShadcnDialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { accountTypeOptions } from '@/types/school';

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_DOC_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const paymentProviderOptions = ["Flutterwave", "Yo! Uganda", "SchoolPay", "PesaPal", "Bank Deposit", "Cash", "Other"];

// Updated schema to include defaultBursaryExpenseAccountId
const generalFinanceSettingsSchema = z.object({
  currency: z.literal('UGX').optional(),
  acceptsMobileMoney: z.boolean().optional(),
  preferredPaymentProvider: z.string().optional(),
  preferredPaymentProviderOther: z.string().optional(),
  feeStructureFile: z.instanceof(File).optional().nullable()
    .refine(file => !file || file.size <= MAX_FILE_SIZE_BYTES, `Max file size ${MAX_FILE_SIZE_MB}MB.`)
    .refine(file => !file || ALLOWED_DOC_TYPES.includes(file.type), `File type not supported.`),
  bankAccountInfo: z.string().optional(),
  defaultCashAccountId: z.string().min(1, "Default Cash/Bank Account is required.").optional().nullable(),
  defaultAccountsReceivableAccountId: z.string().min(1, "Default Accounts Receivable Account is required.").optional().nullable(),
  defaultBursaryExpenseAccountId: z.string().min(1, "Default Bursary/Scholarship Expense Account is required.").optional().nullable(), // Added field
}).superRefine((data, ctx) => {
  if (data.preferredPaymentProvider === "Other" && !data.preferredPaymentProviderOther?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Specify payment provider", path: ["preferredPaymentProviderOther"] });
  }
});

const feeItemFormSchema = z.object({
  name: z.string().min(1, "Fee item name is required"),
  description: z.string().optional(),
  isRecurring: z.boolean().default(true),
  isCompulsory: z.boolean().default(false),
  revenueAccountId: z.string().min(1, "A Revenue Account must be linked to this fee item."),
  classAmounts: z.array(
    z.object({
      classId: z.string().min(1, "Class selection is required"),
      amount: z.preprocess(
        (val) => val === "" ? undefined : parseFloat(String(val)),
        z.number().nonnegative("Amount must be a non-negative number.").optional()
      ).or(z.literal(undefined))
    })
  ).min(1, "At least one class pricing must be added.")
   .refine(items => items.every(item => item.amount !== undefined && item.amount >= 0), {
    message: "All defined class amounts must be valid non-negative numbers.",
    path: ["classAmounts"]
   }),
});

const chartOfAccountItemSchema = z.object({
  accountName: z.string().min(1, "Account name is required"),
  accountType: z.enum(accountTypeOptions, { required_error: "Account type is required" }),
  accountCode: z.string().optional(),
  description: z.string().optional(),
});

interface FileUploadState { preview: string | null; progress: number | null; currentUrl?: string | null; fileName?: string | null; }
const initialFileUploadState: FileUploadState = { preview: null, progress: null, currentUrl: null, fileName: null };

export default function FinanceSettingsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, userProfile: adminProfile } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingGeneralForm, setIsSubmittingGeneralForm] = useState(false);
  const [feeStructureFileState, setFeeStructureFileState] = useState<FileUploadState>(initialFileUploadState);

  const [feeItems, setFeeItems] = useState<FeeItem[]>([]);
  const [isProcessingFeeItem, setIsProcessingFeeItem] = useState(false);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [academicYears, setAcademicYears] = useState<SchoolAcademicYear[]>([]);
  const [schoolTerms, setSchoolTerms] = useState<SchoolTerm[]>([]);
  const [isImportFeeItemsDialogOpen, setIsImportFeeItemsDialogOpen] = useState(false);

  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccountItem[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [isProcessingCoA, setIsProcessingCoA] = useState(false);
  const [editingCoAItem, setEditingCoAItem] = useState<ChartOfAccountItem | null>(null);
  const [isCoADialogOpen, setIsCoADialogOpen] = useState(false);

  const generalForm = useForm<SchoolSettingsFormData>({
    resolver: zodResolver(generalFinanceSettingsSchema),
    defaultValues: {
      currency: 'UGX',
      acceptsMobileMoney: false,
      preferredPaymentProvider: undefined,
      preferredPaymentProviderOther: "",
      feeStructureFile: null,
      bankAccountInfo: "",
      defaultCashAccountId: "",
      defaultAccountsReceivableAccountId: "",
      defaultBursaryExpenseAccountId: "", // Added default value
    },
  });

  const feeItemForm = useForm<FeeItemFormValues>({
    resolver: zodResolver(feeItemFormSchema),
    defaultValues: {
      name: "",
      description: "",
      isRecurring: true,
      isCompulsory: false,
      revenueAccountId: undefined,
      classAmounts: [{ classId: "", amount: "" }],
    },
  });

  const { fields: classAmountFields, append: appendClassAmount, remove: removeClassAmount, replace: replaceClassAmounts } = useFieldArray({
    control: feeItemForm.control,
    name: "classAmounts",
  });

  const coaForm = useForm<ChartOfAccountItemFormValues>({
    resolver: zodResolver(chartOfAccountItemSchema),
    defaultValues: { accountName: "", accountType: undefined, accountCode: "", description: "" },
  });

  const watchedPaymentProvider = generalForm.watch("preferredPaymentProvider");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, setFileState: React.Dispatch<React.SetStateAction<FileUploadState>>, fieldName: keyof SchoolSettingsFormData) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE_BYTES || !ALLOWED_DOC_TYPES.includes(file.type)) {
        generalForm.setError(fieldName as any, { message: `Invalid file (max ${MAX_FILE_SIZE_MB}MB, PDF/DOC allowed).` }); return;
      }
      generalForm.setValue(fieldName as any, file, { shouldValidate: true }); generalForm.clearErrors(fieldName as any);
      setFileState(s => ({ ...s, preview: null, currentUrl: null, fileName: file.name }));
    }
  };

  const removeFile = (setFileState: React.Dispatch<React.SetStateAction<FileUploadState>>, fieldName: keyof SchoolSettingsFormData, currentDbUrlField: keyof School) => {
    generalForm.setValue(fieldName as any, null, { shouldValidate: true });
    setFileState(s => ({ ...s, preview: null, currentUrl: school?.[currentDbUrlField] ? s.currentUrl : null, fileName: school?.[currentDbUrlField] ? s.fileName : null }));
    const fileInput = document.getElementById(fieldName as string) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const fetchInitialPageData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (fetchedSchool) {
        if (!fetchedSchool.adminUids.includes(user.uid)) {
          toast({ variant: "destructive", title: "Access Denied" }); router.push('/school/auth'); return;
        }
        setSchool(fetchedSchool);
        generalForm.reset({
          currency: 'UGX',
          acceptsMobileMoney: fetchedSchool.acceptsMobileMoney ?? false,
          preferredPaymentProvider: fetchedSchool.preferredPaymentProvider || undefined,
          preferredPaymentProviderOther: paymentProviderOptions.includes(fetchedSchool.preferredPaymentProvider || "") ? "" : fetchedSchool.preferredPaymentProvider || "",
          feeStructureFile: null,
          bankAccountInfo: fetchedSchool.bankAccountInfo || "",
          defaultCashAccountId: fetchedSchool.defaultCashAccountId || "",
          defaultAccountsReceivableAccountId: fetchedSchool.defaultAccountsReceivableAccountId || "",
          defaultBursaryExpenseAccountId: fetchedSchool.defaultBursaryExpenseAccountId || "", // Added field
        });
        setFeeStructureFileState(s => ({...s, currentUrl: fetchedSchool.feeStructureUrl, fileName: fetchedSchool.feeStructureUrl ? 'Current Fee Structure' : null }));

        const [classesData, feeItemsData, academicYearsData, termsData, coaData, entriesData] = await Promise.all([
          getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
          getSchoolSubcollectionItems<FeeItem>(schoolId, 'feeItems'),
          getSchoolSubcollectionItems<SchoolAcademicYear>(schoolId, 'schoolAcademicYears'),
          getSchoolSubcollectionItems<SchoolTerm>(schoolId, 'schoolTerms'),
          getSchoolSubcollectionItems<ChartOfAccountItem>(schoolId, 'chartOfAccounts', [orderBy("accountName", "asc")]),
          getSchoolSubcollectionItems<JournalEntry>(schoolId, 'journalEntries'),
        ]);
        setSchoolClasses(classesData.sort((a, b) => (a.class || "").localeCompare(b.class || "")));
        setFeeItems(feeItemsData.sort((a,b)=>(a.name || "").localeCompare(b.name || "")));
        setAcademicYears(academicYearsData.sort((a,b)=>(b.year || "").localeCompare(a.year || "")));
        setSchoolTerms(termsData);
        setChartOfAccounts(coaData);
        setJournalEntries(entriesData);
      } else {
        toast({ variant: "destructive", title: "Not Found" }); router.push('/school/auth');
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error loading data", description: err.message });
      console.error("Error loading finance page data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, router, toast, generalForm]);

  useEffect(() => {
    fetchInitialPageData();
  }, [fetchInitialPageData]);

  const onSubmitGeneralForm = async (data: SchoolSettingsFormData) => {
    if (!user || !school) return;
    setIsSubmittingGeneralForm(true);
    setFeeStructureFileState(s => ({...s, progress: null}));
    try {
      let uploadedFeeStructureUrl: string | null | undefined = school.feeStructureUrl;
      if (data.feeStructureFile) {
        if (school.feeStructureUrl) { try { await deleteObject(ref(storage, school.feeStructureUrl)); } catch (e: any) { console.warn("Old fee structure deletion failed", e);}}
        const path = `school_documents/${schoolId}/fee_structure/${Date.now()}_${data.feeStructureFile.name}`;
        const uploadTask = uploadBytesResumable(ref(storage, path), data.feeStructureFile);
        uploadedFeeStructureUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed', (s) => setFeeStructureFileState(st => ({...st, progress: (s.bytesTransferred/s.totalBytes)*100})), reject, async () => resolve(await getDownloadURL(uploadTask.snapshot.ref)));
        });
      } else if (feeStructureFileState.currentUrl === null && generalForm.getValues('feeStructureFile') === null && !data.feeStructureFile) {
        if(school.feeStructureUrl) {
          try { await deleteObject(ref(storage, school.feeStructureUrl)); }
          catch (e: any) { console.warn("Fee structure deletion from storage failed (on removal):", e); }
        }
        uploadedFeeStructureUrl = null;
      }

      const schoolDataToUpdate: Partial<School> = {
        currency: 'UGX',
        acceptsMobileMoney: data.acceptsMobileMoney ?? false,
        preferredPaymentProvider: data.preferredPaymentProvider === "Other" ? data.preferredPaymentProviderOther : (data.preferredPaymentProvider || null),
        feeStructureUrl: uploadedFeeStructureUrl || null,
        bankAccountInfo: data.bankAccountInfo || null,
        defaultCashAccountId: data.defaultCashAccountId || null,
        defaultAccountsReceivableAccountId: data.defaultAccountsReceivableAccountId || null,
        defaultBursaryExpenseAccountId: data.defaultBursaryExpenseAccountId || null, // Added field
      };
      await updateSchoolData(schoolId, schoolDataToUpdate);
      setSchool(prev => prev ? { ...prev, ...schoolDataToUpdate, feeStructureUrl: uploadedFeeStructureUrl } : null);
      toast({ title: "Finance Settings Updated" });
      setFeeStructureFileState(s => ({...s, currentUrl: uploadedFeeStructureUrl, fileName: uploadedFeeStructureUrl ? 'Current Fee Structure' : null, progress: null}));
      generalForm.setValue('feeStructureFile', null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setIsSubmittingGeneralForm(false);
      setFeeStructureFileState(s => ({...s, progress: null}));
    }
  };

  const onAddFeeItemSubmit = async (data: FeeItemFormValues) => {
    if (!school || !adminProfile) {
      toast({ variant: "destructive", title: "Error", description: "School or Admin info missing." });
      return;
    }
    setIsProcessingFeeItem(true);
    try {
      const processedClassAmounts = data.classAmounts
        .filter(ca => ca.classId && ca.classId !== "" && ca.amount !== undefined && ca.amount !== "" && !isNaN(Number(ca.amount)))
        .map(ca => ({
          classId: ca.classId,
          amount: Number(ca.amount)
        }));

      if (processedClassAmounts.length === 0) {
        toast({variant: "destructive", title: "Validation Error", description: "At least one valid class pricing must be provided for the fee item."});
        setIsProcessingFeeItem(false);
        return;
      }

      const newFeeItemData: Omit<FeeItem, 'id' | 'createdAt' | 'updatedAt'> = {
        name: data.name,
        description: data.description || null,
        isRecurring: data.isRecurring,
        isCompulsory: data.isCompulsory,
        revenueAccountId: data.revenueAccountId || null,
        academicYearId: school.currentAcademicYearId || null,
        term: school.currentTerm || null,
        classAmounts: processedClassAmounts,
      };
      const docId = await addSchoolSubcollectionItem(schoolId, 'feeItems', newFeeItemData);
      const newFeeItemForState: FeeItem = {
        id: docId,
        ...newFeeItemData,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp
      };

      setFeeItems(prev => [...prev, newFeeItemForState].sort((a,b)=>(a.name || "").localeCompare(b.name || "")));
      feeItemForm.reset({ name: "", description: "", isRecurring: true, isCompulsory: false, revenueAccountId: undefined, classAmounts: [{ classId: "", amount: "" }] });
      replaceClassAmounts([{classId: "", amount: ""}]);
      toast({ title: "Fee Item Added", description: `Fee item "${newFeeItemForState.name}" created.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Add Error", description: error.message });
    } finally {
      setIsProcessingFeeItem(false);
    }
  };

  const handleDeleteFeeItem = async (itemId: string, itemName: string) => {
    if (!window.confirm(`Are you sure you want to delete fee item "${itemName}"? This cannot be undone.`)) return;
    setIsProcessingFeeItem(true);
    try {
      await deleteSchoolSubcollectionItem(schoolId, 'feeItems', itemId);
      setFeeItems(prev => prev.filter(item => item.id !== itemId));
      toast({ title: "Fee Item Deleted", description: `"${itemName}" has been removed.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Error", description: error.message });
    } finally {
      setIsProcessingFeeItem(false);
    }
  };

  const openCoADialog = (item?: ChartOfAccountItem) => {
    if (item) {
      setEditingCoAItem(item);
      coaForm.reset({
        accountName: item.accountName,
        accountType: item.accountType,
        accountCode: item.accountCode || "",
        description: item.description || "",
      });
    } else {
      setEditingCoAItem(null);
      coaForm.reset({ accountName: "", accountType: undefined, accountCode: "", description: "" });
    }
    setIsCoADialogOpen(true);
  };

  const handleCoASubmit = async (data: ChartOfAccountItemFormValues) => {
    if (!adminProfile || !schoolId) {
      toast({ variant: "destructive", title: "Error", description: "Admin profile or School ID missing." });
      return;
    }
    setIsProcessingCoA(true);
    try {
      const coaData: Omit<ChartOfAccountItem, 'id' | 'createdAt' | 'updatedAt' | 'balance' | 'balanceType'> = {
        accountName: data.accountName,
        accountType: data.accountType!,
        accountCode: data.accountCode || null,
        description: data.description || null,
      };
      if (editingCoAItem) {
        await updateChartOfAccountItem(schoolId, editingCoAItem.id, coaData);
      } else {
        await addSchoolSubcollectionItem(schoolId, 'chartOfAccounts', coaData);
      }
      await fetchInitialPageData();
      toast({title: editingCoAItem ? "Account Updated" : "Account Added"});
      setIsCoADialogOpen(false);
      setEditingCoAItem(null);
      coaForm.reset({ accountName: "", accountType: undefined, accountCode: "", description: "" });
    } catch (error: any) {
      toast({ variant: "destructive", title: editingCoAItem ? "Update Failed" : "Add Failed", description: error.message });
    } finally {
      setIsProcessingCoA(false);
    }
  };

  const handleDeleteChartOfAccountItem = async (itemId: string, itemName: string) => {
    if (!window.confirm(`Are you sure you want to delete account "${itemName}"? This cannot be undone.`)) return;
    setIsProcessingCoA(true);
    try {
      await deleteSchoolSubcollectionItem(schoolId, 'chartOfAccounts', itemId);
      await fetchInitialPageData();
      toast({title: "Account Deleted", description: `Account "${itemName}" removed.`});
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Account Error", description: error.message });
    } finally {
      setIsProcessingCoA(false);
    }
  };

  const getAccountBalance = useCallback((accountId: string): { balance: number; type: 'debit' | 'credit' | 'zero' } => {
    let debitTotal = 0;
    let creditTotal = 0;
    journalEntries.forEach(entry => {
      entry.lines.forEach(line => {
        if (line.accountId === accountId) {
          debitTotal += line.debit || 0;
          creditTotal += line.credit || 0;
        }
      });
    });
    const account = chartOfAccounts.find(acc => acc.id === accountId);
    const accountType = account?.accountType;
    let balance = 0;
    let balanceType: 'debit' | 'credit' | 'zero' = 'zero';

    if (accountType === 'Asset' || accountType === 'Expense') {
      balance = debitTotal - creditTotal;
      if (balance > 0.001) balanceType = 'debit';
      else if (balance < -0.001) { balanceType = 'credit'; balance = Math.abs(balance); }
      else balance = 0;
    } else if (accountType === 'Liability' || accountType === 'Equity' || accountType === 'Revenue') {
      balance = creditTotal - debitTotal;
      if (balance > 0.001) balanceType = 'credit';
      else if (balance < -0.001) { balanceType = 'debit'; balance = Math.abs(balance); }
      else balance = 0;
    }

    return { balance, type: balanceType };
  }, [journalEntries, chartOfAccounts]);

  if (isLoading || !user) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  if (!school && !isLoading) return <div className="text-center p-4">School data not found or you do not have permission.</div>;

  const assetAccountsForSelect = chartOfAccounts.filter(acc => acc.accountType === 'Asset' && acc.id && acc.id !== "");
  const revenueAccountsForSelect = chartOfAccounts.filter(acc => acc.accountType === 'Revenue' && acc.id && acc.id !== "");
  const expenseAccountsForSelect = chartOfAccounts.filter(acc => acc.accountType === 'Expense' && acc.id && acc.id !== "");

  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl flex items-center"><Settings className="mr-3 h-5 w-5 text-primary"/>General Finance & Payment Settings</CardTitle>
        </CardHeader>
        <Form {...generalForm}>
          <form onSubmit={generalForm.handleSubmit(onSubmitGeneralForm)}>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={generalForm.control} name="currency" render={({ field }) => (
                  <FormItem><FormLabel>Currency</FormLabel><FormControl><Input {...field} disabled readOnly /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={generalForm.control} name="acceptsMobileMoney" render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Accepts Mobile Money</FormLabel><FormDescription className="text-xs">Enable if school supports MTN/Airtel payments.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem> )}/>
                <FormField control={generalForm.control} name="preferredPaymentProvider" render={({ field }) => (
                  <FormItem><FormLabel>Preferred Payment Provider</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger></FormControl>
                      <SelectContent>{paymentProviderOptions.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select><FormMessage /></FormItem> )}/>
                {watchedPaymentProvider === "Other" && <FormField control={generalForm.control} name="preferredPaymentProviderOther" render={({ field }) => (
                  <FormItem><FormLabel>Specify Payment Provider*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>}
                
                <FormField control={generalForm.control} name="feeStructureFile" render={() => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Fee Structure Template (PDF/DOC, Max {MAX_FILE_SIZE_MB}MB)</FormLabel>
                    {feeStructureFileState.currentUrl && (
                      <div className="my-2 p-2 border rounded-md bg-muted text-sm text-muted-foreground">
                        <a href={feeStructureFileState.currentUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                          <FileText className="h-4 w-4" /> {feeStructureFileState.fileName || "View Current File"}
                        </a>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Input id="feeStructureFile" type="file" accept={ALLOWED_DOC_TYPES.join(',')}
                          onChange={(e) => handleFileChange(e, setFeeStructureFileState, 'feeStructureFile')}
                          className="flex-grow" disabled={isSubmittingGeneralForm}
                        />
                      </FormControl>
                      {(feeStructureFileState.fileName || feeStructureFileState.currentUrl) &&
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeFile(setFeeStructureFileState, 'feeStructureFile', 'feeStructureUrl')} className="text-destructive" disabled={isSubmittingGeneralForm}>
                          <XCircle className="h-4 w-4 mr-1"/>Remove
                        </Button>
                      }
                    </div>
                    {feeStructureFileState.fileName && !feeStructureFileState.currentUrl && <p className="text-xs text-muted-foreground mt-1">New file selected: {feeStructureFileState.fileName}</p>}
                    {feeStructureFileState.progress !== null && <Progress value={feeStructureFileState.progress} className="w-full h-1.5 mt-2" />}
                    <FormMessage />
                  </FormItem> )}/>
                <FormField control={generalForm.control} name="bankAccountInfo" render={({ field }) => (
                  <FormItem className="md:col-span-2"><FormLabel>Bank Account Info</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} rows={3} placeholder="Bank Name, Account Name, Account Number, Branch" /></FormControl><FormMessage /></FormItem> )}/>
                
                <Separator className="md:col-span-2 my-2" />
                <h4 className="font-medium text-md md:col-span-2 text-primary flex items-center"><Landmark className="mr-2 h-5 w-5"/>Default Accounts for Automated Journal Entries</h4>
                <FormField
                  control={generalForm.control}
                  name="defaultCashAccountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Cash/Bank Account*</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""} disabled={assetAccountsForSelect.filter(item => item.id && item.id !== "").length === 0}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select Cash/Bank Account" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {assetAccountsForSelect.filter(item => item.id && item.id !== "").map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.accountName} ({acc.accountCode || 'N/A'})</SelectItem>)}
                          {assetAccountsForSelect.filter(item => item.id && item.id !== "").length === 0 && <SelectItem value="" disabled>No Asset accounts defined</SelectItem>}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">Main account debited for income/payments & credited for expenses.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={generalForm.control}
                  name="defaultAccountsReceivableAccountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Accounts Receivable Account*</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""} disabled={assetAccountsForSelect.length === 0}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select A/R Account" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {assetAccountsForSelect.filter(item => item.id && item.id !== "").map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.accountName} ({acc.accountCode || 'N/A'})</SelectItem>)}
                          {assetAccountsForSelect.length === 0 && <SelectItem value="" disabled>No Asset accounts defined</SelectItem>}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">Control account for tracking student fee balances.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                    control={generalForm.control}
                    name="defaultBursaryExpenseAccountId"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Default Bursary/Scholarship Expense Account*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={expenseAccountsForSelect.length === 0}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select Bursary Expense Account" /></SelectTrigger></FormControl>
                            <SelectContent>
                            {expenseAccountsForSelect.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.accountName} ({acc.accountCode || 'N/A'})</SelectItem>)}
                            {expenseAccountsForSelect.length === 0 && <SelectItem value="" disabled>No Expense accounts defined</SelectItem>}
                            </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">Account debited when a bursary/scholarship is awarded.</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                </div>
            </CardContent>
            <CardFooter>
                <Button type="submit" disabled={isSubmittingGeneralForm} className="bg-primary hover:bg-primary/90">
                {isSubmittingGeneralForm ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>}
                Save General Settings
                </Button>
            </CardFooter>
            </form>
        </Form>
        </Card>

        <Separator className="my-8"/>

        <Card className="shadow-lg">
            <CardHeader className="flex flex-row justify-between items-start">
                <div>
                    <CardTitle className="text-xl flex items-center"><Briefcase className="mr-3 h-5 w-5 text-primary"/>Manage Chart of Accounts</CardTitle>
                    <CardDescription>Define financial accounts (Assets, Liabilities, Equity, Revenue, Expenses).</CardDescription>
                </div>
                <Button onClick={() => openCoADialog()} size="sm">
                   <PlusCircle className="mr-2 h-4 w-4"/> Add New Account
                </Button>
            </CardHeader>
            <CardContent>
                <ShadcnDialog open={isCoADialogOpen} onOpenChange={setIsCoADialogOpen}>
                    <ShadcnDialogContent className="sm:max-w-lg">
                        <ShadcnDialogHeader>
                            <ShadcnDialogTitle>{editingCoAItem ? "Edit Account" : "Add New Account"}</ShadcnDialogTitle>
                        </ShadcnDialogHeader>
                        <Form {...coaForm}>
                            <form onSubmit={coaForm.handleSubmit(handleCoASubmit)} className="space-y-4 py-2">
                                <FormField control={coaForm.control} name="accountName" render={({ field }) => (
                                    <FormItem><FormLabel>Account Name*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                                <FormField control={coaForm.control} name="accountType" render={({ field }) => (
                                    <FormItem><FormLabel>Account Type*</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!!editingCoAItem}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Select Type"/></SelectTrigger></FormControl>
                                            <SelectContent>{accountTypeOptions.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                                        </Select>
                                        {editingCoAItem && <FormDescription className="text-xs">Account type cannot be changed after creation.</FormDescription>}
                                        <FormMessage />
                                    </FormItem> )}/>
                                <FormField control={coaForm.control} name="accountCode" render={({ field }) => (
                                    <FormItem><FormLabel>Account Code (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                                <FormField control={coaForm.control} name="description" render={({ field }) => (
                                    <FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea {...field} rows={2}/></FormControl><FormMessage /></FormItem> )}/>
                                <ShadcnDialogFooter className="pt-4">
                                    <Button type="button" variant="outline" onClick={() => {setIsCoADialogOpen(false); setEditingCoAItem(null);}}>Cancel</Button>
                                    <Button type="submit" disabled={isProcessingCoA}>
                                        {isProcessingCoA ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>}
                                        {editingCoAItem ? "Update Account" : "Add Account"}
                                    </Button>
                                </ShadcnDialogFooter>
                            </form>
                        </Form>
                    </ShadcnDialogContent>
                </ShadcnDialog>

                <div>
                    <h3 className="font-semibold text-md mb-2">Existing Accounts:</h3>
                    {chartOfAccounts.length === 0 ? <p className="text-sm text-muted-foreground">No accounts defined yet.</p> : (
                        <div className="max-h-96 overflow-y-auto border rounded-md">
                            <Table>
                                <TableHeader className="sticky top-0 bg-card z-10">
                                    <TableRow>
                                        <TableHead>Account Name</TableHead>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="text-right">Balance (UGX)</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {chartOfAccounts.map(item => {
                                        const { balance, type: balanceType } = getAccountBalance(item.id);
                                        return (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-medium text-sm">{item.accountName}</TableCell>
                                                <TableCell className="text-xs">{item.accountCode || 'N/A'}</TableCell>
                                                <TableCell><Badge variant="outline" className="text-xs">{item.accountType}</Badge></TableCell>
                                                <TableCell className={`text-right text-sm font-mono ${balanceType === 'credit' && balance > 0 ? 'text-green-600' : (balanceType === 'debit' && balance > 0 ? 'text-destructive' : '')}`}>
                                                    {balance.toFixed(2)} {balance > 0 ? (balanceType === 'debit' ? 'DR' : 'CR') : ''}
                                                </TableCell>
                                                <TableCell className="text-right space-x-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openCoADialog(item)} className="h-7 w-7" title="Edit"><Edit className="h-4 w-4"/></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteChartOfAccountItem(item.id, item.accountName)} disabled={isProcessingCoA} className="h-7 w-7">
                                                        <Trash2 className="text-destructive h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>


        <Separator className="my-8"/>

        <Card className="shadow-lg">
            <CardHeader className="flex flex-row justify-between items-start">
                <div>
                    <CardTitle className="text-xl flex items-center"><Tag className="mr-3 h-5 w-5 text-primary"/>Manage Fee Items</CardTitle>
                    <CardDescription>Define individual school fee items and their amounts per class. Link each to a Revenue Account for automated Journal Entries.</CardDescription>
                </div>
                <Button onClick={() => setIsImportFeeItemsDialogOpen(true)} variant="outline" size="sm">
                    <Upload className="mr-2 h-4 w-4"/> Import Fee Items
                </Button>
            </CardHeader>
            <CardContent>
                <Form {...feeItemForm}>
                    <form onSubmit={feeItemForm.handleSubmit(onAddFeeItemSubmit)} className="space-y-4 p-4 border rounded-md bg-muted/10">
                        <h3 className="font-semibold text-md">Add New Fee Item:</h3>
                        <FormField control={feeItemForm.control} name="name" render={({ field }) => (
                            <FormItem><FormLabel>Fee Item Name*</FormLabel><FormControl><Input {...field} placeholder="e.g., Term 1 Tuition" /></FormControl><FormMessage /></FormItem> )}/>
                        <FormField control={feeItemForm.control} name="description" render={({ field }) => (
                            <FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea {...field} rows={2} placeholder="Briefly describe this fee item" /></FormControl><FormMessage /></FormItem> )}/>
                         <FormField
                            control={feeItemForm.control}
                            name="revenueAccountId"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Link to Revenue Account*</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ""} disabled={revenueAccountsForSelect.length === 0}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Select Revenue Account" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                    {revenueAccountsForSelect.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.accountName} ({acc.accountCode || 'N/A'})</SelectItem>)}
                                    {revenueAccountsForSelect.length === 0 && <SelectItem value="" disabled>No Revenue accounts defined</SelectItem>}
                                    </SelectContent>
                                </Select>
                                <FormDescription className="text-xs">This account will be credited when this fee is billed.</FormDescription>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="flex items-center space-x-4">
                            <FormField control={feeItemForm.control} name="isRecurring" render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="font-normal">Is this a recurring fee?</FormLabel></FormItem> )}/>
                            <FormField control={feeItemForm.control} name="isCompulsory" render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="font-normal text-orange-600">Is this fee compulsory?</FormLabel><FormDescription className="text-xs pl-1">(Compulsory fees for CURRENT school term/year trigger auto-billing of active students)</FormDescription></FormItem> )}/>
                        </div>
                        
                        <div>
                            <Label className="font-semibold text-sm">Class Specific Amounts*</Label>
                            {classAmountFields.map((field, index) => (
                                <div key={field.id} className="flex items-end gap-2 mt-2 p-2 border-l-2 border-primary/30 pl-3">
                                    <FormField control={feeItemForm.control} name={`classAmounts.${index}.classId`} render={({ field: caField }) => (
                                        <FormItem className="flex-grow">
                                            <FormLabel className="text-xs">Class*</FormLabel>
                                            <Select onValueChange={caField.onChange} value={caField.value || ""}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Select Class" /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    {schoolClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.class} {c.code ? `(${c.code})` : ''}</SelectItem>)}
                                                    {schoolClasses.length === 0 && <SelectItem value="_NO_CLASSES_" disabled>No classes defined</SelectItem>}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem> )}/>
                                    <FormField control={feeItemForm.control} name={`classAmounts.${index}.amount`} render={({ field: caField }) => (
                                        <FormItem className="flex-grow">
                                            <FormLabel className="text-xs">Amount (UGX)*</FormLabel>
                                            <FormControl><Input type="number" {...caField} placeholder="e.g., 500000" onChange={e => caField.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} value={caField.value ?? ""} /></FormControl>
                                            <FormMessage />
                                        </FormItem> )}/>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeClassAmount(index)} disabled={classAmountFields.length <= 1}>
                                        <Trash2 className="h-4 w-4 text-destructive"/>
                                    </Button>
                                </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" onClick={() => appendClassAmount({ classId: "", amount: undefined })} className="mt-2">
                                <PlusCircle className="mr-2 h-4 w-4"/> Add Class Pricing
                            </Button>
                            <FormMessage>{feeItemForm.formState.errors.classAmounts?.root?.message || (Array.isArray(feeItemForm.formState.errors.classAmounts) && feeItemForm.formState.errors.classAmounts.map((e: any) => e?.amount?.message || e?.classId?.message).filter(Boolean).join(', '))}</FormMessage>
                        </div>

                        <Button type="submit" disabled={isProcessingFeeItem} className="mt-3">
                            {isProcessingFeeItem ? <Loader2 className="animate-spin h-4 w-4 mr-2"/> : <PlusCircle className="h-4 w-4 mr-2"/>} Add Fee Item
                        </Button>
                    </form>
                </Form>

                <div className="mt-6">
                    <h3 className="font-semibold text-md mb-2">Existing Fee Items:</h3>
                    {feeItems.length === 0 && <p className="text-sm text-muted-foreground">No fee items defined yet.</p>}
                    <ul className="space-y-3 max-h-96 overflow-y-auto">
                    {feeItems.map(item => (
                        <li key={item.id} className="p-3 border rounded-md bg-card shadow-sm">
                            <div className="flex justify-between items-start">
                                <div>
                                    <strong className="block text-primary">{item.name} 
                                        <Badge variant={item.isRecurring ? "default" : "secondary"} className="text-xs ml-1">{item.isRecurring ? "Recurring" : "One-time"}</Badge>
                                        {item.isCompulsory && <Badge variant="outline" className="text-xs ml-1 border-orange-500 text-orange-600">Compulsory</Badge>}
                                    </strong>
                                    <span className="text-xs text-muted-foreground block">{item.description || 'No description'}</span>
                                     <span className="text-xs text-muted-foreground block">
                                        Revenue Acc: {chartOfAccounts.find(acc => acc.id === item.revenueAccountId)?.accountName || 'Not Linked'}
                                    </span>
                                    <span className="text-xs text-muted-foreground block">
                                        Academic Context: {academicYears.find(ay => ay.id === item.academicYearId)?.year || item.academicYearId || 'N/A'} / {item.term || 'N/A'}
                                    </span>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteFeeItem(item.id, item.name)} disabled={isProcessingFeeItem}>
                                    <Trash2 className="text-destructive h-4 w-4" />
                                </Button>
                            </div>
                            <div className="mt-2 space-y-1">
                                <Label className="text-xs font-medium">Class Pricing:</Label>
                                {item.classAmounts.map(ca => {
                                    const className = schoolClasses.find(c => c.id === ca.classId)?.class || ca.classId;
                                    return (<div key={ca.classId} className="text-xs text-muted-foreground ml-2">{className}: UGX {ca.amount.toFixed(2)}</div>);
                                })}
                                {item.classAmounts.length === 0 && <p className="text-xs text-muted-foreground ml-2">No specific class pricing defined.</p>}
                            </div>
                        </li>
                    ))}
                    </ul>
                </div>
            </CardContent>
        </Card>
        <ImportFeeItemsDialog
            isOpen={isImportFeeItemsDialogOpen}
            onOpenChange={setIsImportFeeItemsDialogOpen}
            schoolId={schoolId}
            schoolClasses={schoolClasses}
            academicYears={academicYears}
            schoolTerms={schoolTerms}
            chartOfAccounts={chartOfAccounts.filter(acc => acc.accountType === 'Revenue' && acc.id && acc.id.trim() !== "")} 
            onImportCompleted={fetchInitialPageData}
        />
    </div>
  );
}

