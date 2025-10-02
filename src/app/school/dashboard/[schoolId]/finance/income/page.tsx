
// src/app/school/dashboard/[schoolId]/finance/income/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, addSchoolSubcollectionItem, deleteSchoolSubcollectionItem, updateSchoolSubcollectionItem } from '@/services';
import type { School, SchoolIncome, SchoolAcademicYear, SchoolTerm, ChartOfAccountItem } from '@/types/school';
import { serverTimestamp, Timestamp, orderBy } from 'firebase/firestore';
import { format, parseISO, isValid as isDateValid } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, PlusCircle, Trash2, TrendingUp, CalendarDays, BookOpen, BookHeart, DollarSign as DollarIcon, Info, Edit } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const incomeSchema = z.object({
  date: z.date({ required_error: "Income date is required" }),
  accountId: z.string().min(1, "Income account is required"),
  description: z.string().min(1, "Description is required").max(500),
  amount: z.preprocess(
    (val) => parseFloat(String(val)),
    z.number().refine(val => !isNaN(val) && val > 0, "Amount must be a positive number.")
  ),
  paymentMethodReceived: z.string().min(1, "Method received is required"),
  reference: z.string().optional(),
  academicYearId: z.string().min(1, "Academic Year is required"),
  term: z.string().min(1, "Term is required"),
});

type IncomeFormValues = z.infer<typeof incomeSchema>;

export default function ManageIncomePage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [incomeEntries, setIncomeEntries] = useState<SchoolIncome[]>([]);
  const [academicYears, setAcademicYears] = useState<SchoolAcademicYear[]>([]);
  const [schoolTerms, setSchoolTerms] = useState<SchoolTerm[]>([]);
  const [revenueAccounts, setRevenueAccounts] = useState<ChartOfAccountItem[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);

  const form = useForm<IncomeFormValues>({
    resolver: zodResolver(incomeSchema),
    defaultValues: {
      date: new Date(), accountId: "", description: "", amount: 0, paymentMethodReceived: "", reference: "",
      academicYearId: "", term: "",
    },
  });

  const watchedAcademicYearId = form.watch("academicYearId");
  const availableTermsForSelectedYear = schoolTerms.filter(term => 
    term.academicYearId === watchedAcademicYearId && 
    !term.isClosed && 
    typeof term.name === 'string' && 
    term.name.trim() !== ""
  );

  const fetchSchoolAndIncome = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (fetchedSchool) {
        if (!fetchedSchool.adminUids.includes(user.uid)) {
          toast({ variant: "destructive", title: "Access Denied" }); router.push('/school/auth'); return;
        }
        setSchool(fetchedSchool);
        form.setValue("academicYearId", fetchedSchool.currentAcademicYearId || "");
        form.setValue("term", fetchedSchool.currentTerm || "");

        const [fetchedIncome, fetchedAcademicYears, fetchedTerms, fetchedCoaItems] = await Promise.all([
          getSchoolSubcollectionItems<SchoolIncome>(schoolId, 'income', [orderBy("date", "desc")]),
          getSchoolSubcollectionItems<SchoolAcademicYear>(schoolId, 'schoolAcademicYears', [orderBy("year", "desc")]),
          getSchoolSubcollectionItems<SchoolTerm>(schoolId, 'schoolTerms'),
          getSchoolSubcollectionItems<ChartOfAccountItem>(schoolId, 'chartOfAccounts', [orderBy("accountName", "asc")]),
        ]);
        
        setIncomeEntries(fetchedIncome);
        setAcademicYears(fetchedAcademicYears.filter(ay => ay.id && ay.id.trim() !== ""));
        setSchoolTerms(fetchedTerms);
        setRevenueAccounts(fetchedCoaItems.filter(acc => acc.accountType === 'Revenue' && acc.id && acc.id.trim() !== ""));

      } else {
        toast({ variant: "destructive", title: "Not Found" }); router.push('/school/auth');
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load school or income data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router, form]);

  useEffect(() => {
    fetchSchoolAndIncome();
  }, [fetchSchoolAndIncome]);

  useEffect(() => {
    if (watchedAcademicYearId) {
      const currentTermValue = form.getValues("term");
      const isValidTermForYear = schoolTerms.some(term => 
        term.academicYearId === watchedAcademicYearId && 
        term.name === currentTermValue && 
        !term.isClosed && 
        typeof term.name === 'string' && 
        term.name.trim() !== ""
      );
      if (currentTermValue && !isValidTermForYear) {
        form.setValue("term", "");
      }
    }
  }, [watchedAcademicYearId, schoolTerms, form]);

  const onSubmit = async (data: IncomeFormValues) => {
    if (!userProfile || !schoolId) {
      toast({ variant: "destructive", title: "Error", description: "User or School ID missing." });
      return;
    }
    setIsSubmitting(true);
    const selectedAccount = revenueAccounts.find(acc => acc.id === data.accountId);
    try {
      const incomeData: Omit<SchoolIncome, 'id' | 'createdAt' | 'updatedAt'> = {
        date: Timestamp.fromDate(data.date),
        source: selectedAccount?.accountName || data.accountId,
        accountId: data.accountId,
        accountName: selectedAccount?.accountName || null,
        description: data.description,
        amount: data.amount,
        paymentMethodReceived: data.paymentMethodReceived,
        reference: data.reference || null,
        academicYearId: data.academicYearId,
        term: data.term,
        recordedByAdminId: userProfile.uid,
        recordedByAdminName: userProfile.displayName || userProfile.email,
      };
      if (isEditing) {
        await updateSchoolSubcollectionItem(schoolId, 'income', isEditing, incomeData);
        toast({ title: "Income Entry Updated" });
      } else {
        await addSchoolSubcollectionItem(schoolId, 'income', incomeData);
        toast({ title: "Income Entry Added" });
      }
      form.reset({
        date: new Date(), accountId: "", description: "", amount: 0, paymentMethodReceived: "", reference: "",
        academicYearId: school?.currentAcademicYearId || "", term: school?.currentTerm || ""
      });
      setIsEditing(null);
      fetchSchoolAndIncome();
    } catch (error: any) {
      toast({ variant: "destructive", title: isEditing ? "Update Failed" : "Add Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteIncome = async (incomeId: string, incomeDesc: string) => {
    if (!window.confirm(`Are you sure you want to delete income: "${incomeDesc}"?`)) return;
    setIsSubmitting(true);
    try {
      await deleteSchoolSubcollectionItem(schoolId, 'income', incomeId);
      toast({ title: "Income Entry Deleted", description: `Income "${incomeDesc}" removed.` });
      fetchSchoolAndIncome();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditIncome = (income: SchoolIncome) => {
    setIsEditing(income.id);
    let incomeDate = new Date();
    if (income.date) {
      try {
        const parsed = typeof income.date === 'string' ? parseISO(income.date) : (income.date as Timestamp).toDate();
        if (isDateValid(parsed)) incomeDate = parsed;
      } catch (e) { console.warn("Invalid date in income record:", income.date); }
    }
    form.reset({
      date: incomeDate,
      accountId: income.accountId || "",
      description: income.description,
      amount: income.amount,
      paymentMethodReceived: income.paymentMethodReceived || "",
      reference: income.reference || "",
      academicYearId: income.academicYearId || school?.currentAcademicYearId || "",
      term: income.term || school?.currentTerm || "",
    });
  };

  const paymentMethods = ["Cash", "Bank Deposit", "Mobile Money", "SchoolPay", "Grant", "Donation", "Other"];

  if (isLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><TrendingUp className="mr-3 h-6 w-6 text-green-600"/>Manage School Income (Other than Fees)</CardTitle>
          <CardDescription>Record all sources of income for the school (e.g., donations, grants, fundraising). Link them to specific income accounts from your Chart of Accounts.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <Controller
                    control={form.control}
                    name="date"
                    render={({ field, fieldState: { error } }) => (
                    <FormItem className="flex flex-col">
                        <FormLabel><CalendarDays className="inline mr-1 h-4 w-4"/>Date*</FormLabel>
                        <Input
                        type="date"
                        value={field.value && isDateValid(field.value) ? format(field.value, 'yyyy-MM-dd') : ''}
                        onChange={(e) => field.onChange(e.target.value ? parseISO(e.target.value) : null)}
                        className={error ? 'border-destructive' : ''}
                        />
                        {error && <p className="text-sm text-destructive mt-1">{error.message}</p>}
                    </FormItem>
                    )}
                />
                <FormField control={form.control} name="accountId" render={({ field }) => (
                  <FormItem><FormLabel><BookHeart className="inline mr-1 h-4 w-4"/>Source Account*</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""} disabled={revenueAccounts.length === 0}>
                      <FormControl><SelectTrigger><SelectValue placeholder={revenueAccounts.length === 0 ? "No revenue accounts defined": "Select Revenue Account"} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {revenueAccounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.accountName} {acc.accountCode && `(${acc.accountCode})`}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}/>
              </div>
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel><Info className="inline mr-1 h-4 w-4"/>Description*</FormLabel><FormControl><Textarea {...field} placeholder="Detailed description of the income" /></FormControl><FormMessage /></FormItem> )}/>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormField control={form.control} name="amount" render={({ field }) => (
                  <FormItem><FormLabel><DollarIcon className="inline mr-1 h-4 w-4"/>Amount (UGX)*</FormLabel><FormControl><Input type="number" step="any" {...field} placeholder="e.g., 200000" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="paymentMethodReceived" render={({ field }) => (
                  <FormItem><FormLabel>Method Received*</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select method received" /></SelectTrigger></FormControl>
                      <SelectContent>{paymentMethods.map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem> )}/>
                 <FormField control={form.control} name="reference" render={({ field }) => (
                    <FormItem><FormLabel>Reference (Optional)</FormLabel><FormControl><Input {...field} placeholder="e.g., Donor ID, Event Name" /></FormControl><FormMessage /></FormItem> )}/>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="academicYearId" render={({ field }) => (
                  <FormItem><FormLabel><BookOpen className="inline mr-1 h-4 w-4"/>Academic Year*</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""} disabled={academicYears.length === 0}>
                      <FormControl><SelectTrigger><SelectValue placeholder={academicYears.length === 0 ? "No academic years defined": "Select Academic Year"} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {academicYears.map(ay => <SelectItem key={ay.id} value={ay.id}>{ay.year}</SelectItem>)}
                      </SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="term" render={({ field }) => (
                  <FormItem><FormLabel><BookOpen className="inline mr-1 h-4 w-4"/>Term*</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""} disabled={!watchedAcademicYearId || availableTermsForSelectedYear.length === 0}>
                      <FormControl><SelectTrigger><SelectValue placeholder={!watchedAcademicYearId ? "Select academic year first" : (availableTermsForSelectedYear.length === 0 ? "No open terms for year" : "Select Term")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {availableTermsForSelectedYear.map(st => <SelectItem key={st.id} value={st.name}>{st.name}</SelectItem>)}
                      </SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )}/>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
                {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <PlusCircle className="mr-2"/>}
                {isEditing ? "Update Income" : "Add Income Entry"}
              </Button>
              {isEditing && (
                <Button type="button" variant="outline" onClick={() => { setIsEditing(null); form.reset({ date: new Date(), accountId: "", description: "", amount: 0, paymentMethodReceived: "", reference: "", academicYearId: school?.currentAcademicYearId || "", term: school?.currentTerm || "" }); }} disabled={isSubmitting}>
                  Cancel Edit
                </Button>
              )}
            </CardFooter>
          </form>
        </Form>
      </Card>
      <Card className="shadow-lg">
        <CardHeader><CardTitle className="text-xl">Income History</CardTitle></CardHeader>
        <CardContent>
          {incomeEntries.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No other income entries recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Source Account</TableHead><TableHead>Description</TableHead>
                    <TableHead>Academic Year/Term</TableHead><TableHead className="text-right">Amount</TableHead>
                    <TableHead>Method</TableHead><TableHead>Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {incomeEntries.map(inc => {
                    const yearName = academicYears.find(ay => ay.id === inc.academicYearId)?.year || 'N/A';
                    const termName = inc.term || 'N/A';
                    let entryDate = "N/A";
                    if (inc.date) {
                      try {
                        const parsed = typeof inc.date === 'string' ? parseISO(inc.date) : (inc.date as Timestamp).toDate();
                        if(isDateValid(parsed)) entryDate = format(parsed, "PP");
                      } catch (e) { console.warn("Invalid date in income entry list:", inc.date); }
                    }
                    return (
                      <TableRow key={inc.id}>
                        <TableCell className="text-xs">{entryDate}</TableCell>
                        <TableCell className="text-xs">{inc.accountName || inc.source || 'N/A'}</TableCell>
                        <TableCell className="text-xs truncate max-w-xs">{inc.description}</TableCell>
                        <TableCell className="text-xs">{yearName} / {termName}</TableCell>
                        <TableCell className="text-right text-xs font-medium">{(inc.amount || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-xs">{inc.paymentMethodReceived}</TableCell>
                        <TableCell className="space-x-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEditIncome(inc)} className="h-7 w-7" title="Edit"><Edit className="h-4 w-4"/></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteIncome(inc.id, inc.description)} className="h-7 w-7" title="Delete"><Trash2 className="h-4 w-4 text-destructive"/></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
    