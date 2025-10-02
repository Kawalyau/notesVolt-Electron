// src/app/school/dashboard/[schoolId]/finance/journal-entries/create/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, addSchoolSubcollectionItem } from '@/services';
import type { School, ChartOfAccountItem, JournalEntry, JournalEntryLine, AppTimestamp } from '@/types/school';
import { Timestamp, serverTimestamp, orderBy } from 'firebase/firestore'; // Added orderBy
import { format, parseISO } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Briefcase, PlusCircle, Trash2, Save, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from '@/components/ui/separator';

const journalEntryLineSchema = z.object({
  accountId: z.string().min(1, "Account is required."),
  debit: z.preprocess(
    val => String(val).trim() === '' ? null : parseFloat(String(val)),
    z.number().nonnegative("Debit must be non-negative.").nullable().optional()
  ),
  credit: z.preprocess(
    val => String(val).trim() === '' ? null : parseFloat(String(val)),
    z.number().nonnegative("Credit must be non-negative.").nullable().optional()
  ),
  description: z.string().optional(),
}).refine(data => (data.debit != null && data.debit > 0) || (data.credit != null && data.credit > 0), {
  message: "Each line must have a debit or a credit.",
  path: ["debit"], // Or path: ["credit"]
}).refine(data => !(data.debit != null && data.debit > 0 && data.credit != null && data.credit > 0), {
  message: "Cannot have both debit and credit on the same line.",
  path: ["debit"], // Or path: ["credit"]
});

const journalEntryFormSchema = z.object({
  date: z.date({ required_error: "Entry date is required." }),
  description: z.string().min(1, "Overall description is required.").max(500),
  lines: z.array(journalEntryLineSchema).min(2, "At least two lines are required for a balanced entry."),
}).refine(data => {
  const totalDebits = data.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredits = data.lines.reduce((sum, line) => sum + (line.credit || 0), 0);
  return Math.abs(totalDebits - totalCredits) < 0.001; // Allow for floating point precision
}, {
  message: "Total debits must equal total credits.",
  path: ["lines"], // Apply error to the lines array field itself
});

type JournalEntryFormValues = z.infer<typeof journalEntryFormSchema>;

export default function CreateJournalEntryPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccountItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<JournalEntryFormValues>({
    resolver: zodResolver(journalEntryFormSchema),
    defaultValues: {
      date: new Date(),
      description: "",
      lines: [
        { accountId: "", debit: null, credit: null, description: "" },
        { accountId: "", debit: null, credit: null, description: "" },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const fetchInitialData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" }); router.push('/school/auth'); return;
      }
      setSchool(fetchedSchool);
      const coaItems = await getSchoolSubcollectionItems<ChartOfAccountItem>(schoolId, 'chartOfAccounts', [orderBy("accountName", "asc")]);
      setChartOfAccounts(coaItems.sort((a,b) => (a.accountName || "").localeCompare(b.accountName || "")));
    } catch (error) {
      console.error("Error fetching initial data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load required data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const onSubmit = async (data: JournalEntryFormValues) => {
    if (!userProfile || !school) {
      toast({ variant: "destructive", title: "Error", description: "User or School info missing." });
      return;
    }
    setIsSubmitting(true);
    try {
      const entryData: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt' | 'schoolId' | 'postedByAdminId' | 'postedByAdminName'> = {
        date: Timestamp.fromDate(data.date),
        description: data.description,
        lines: data.lines.map(line => ({
          accountId: line.accountId,
          accountName: chartOfAccounts.find(acc => acc.id === line.accountId)?.accountName || 'N/A',
          debit: line.debit || null,
          credit: line.credit || null,
          description: line.description || null,
        })),
      };
      
      const fullEntryData = {
        ...entryData,
        schoolId: schoolId,
        postedByAdminId: userProfile.uid,
        postedByAdminName: userProfile.displayName || userProfile.email,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      };

      await addSchoolSubcollectionItem(schoolId, 'journalEntries', fullEntryData);
      toast({ title: "Journal Entry Created", description: "The entry has been successfully recorded." });
      router.push(`/school/dashboard/${schoolId}/finance/journal-entries`);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const totalDebits = form.watch('lines')?.reduce((sum, line) => sum + (Number(line.debit) || 0), 0) || 0;
  const totalCredits = form.watch('lines')?.reduce((sum, line) => sum + (Number(line.credit) || 0), 0) || 0;
  const balance = totalDebits - totalCredits;


  if (isLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <Button variant="outline" onClick={() => router.push(`/school/dashboard/${schoolId}/finance/journal-entries`)} size="sm">
          <ArrowLeft className="mr-2 h-4 w-4"/> Back to Journal Entries
        </Button>
      </div>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><Briefcase className="mr-3 h-6 w-6 text-primary"/>Create New Journal Entry</CardTitle>
          <CardDescription>Record transactions affecting multiple accounts. Ensure total debits equal total credits.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Controller
                    control={form.control}
                    name="date"
                    render={({ field, fieldState: { error } }) => (
                    <FormItem className="flex flex-col">
                        <FormLabel>Date*</FormLabel>
                        <Input
                        type="date"
                        value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                        onChange={(e) => field.onChange(e.target.value ? parseISO(e.target.value) : null)}
                        className={error ? 'border-destructive' : ''}
                        />
                        {error && <p className="text-sm text-destructive mt-1">{error.message}</p>}
                    </FormItem>
                    )}
                />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem className="md:col-span-2"><FormLabel>Overall Description*</FormLabel><FormControl><Textarea {...field} rows={2} placeholder="e.g., Record payment for electricity bill" /></FormControl><FormMessage /></FormItem> )}/>
              </div>

              <Separator />
              <div>
                <h3 className="text-lg font-semibold mb-2">Journal Lines</h3>
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border-b py-3">
                    <FormField control={form.control} name={`lines.${index}.accountId`} render={({ field: lineField }) => (
                      <FormItem className="md:col-span-4"><FormLabel className="text-xs">Account*</FormLabel>
                        <Select onValueChange={lineField.onChange} value={lineField.value || ""}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {chartOfAccounts.filter(acc => acc.id && acc.id !== "").map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.accountName} ({acc.accountType})</SelectItem>)}
                            {chartOfAccounts.filter(acc => acc.id && acc.id !== "").length === 0 && <SelectItem value="" disabled>No accounts defined</SelectItem>}
                          </SelectContent>
                        </Select><FormMessage />
                      </FormItem> )}/>
                    <FormField control={form.control} name={`lines.${index}.debit`} render={({ field: lineField }) => (
                      <FormItem className="md:col-span-2"><FormLabel className="text-xs">Debit (UGX)</FormLabel><FormControl><Input type="number" step="any" {...lineField} onChange={e => lineField.onChange(e.target.value === '' ? null : parseFloat(e.target.value))} value={lineField.value ?? ""} /></FormControl><FormMessage /></FormItem> )}/>
                    <FormField control={form.control} name={`lines.${index}.credit`} render={({ field: lineField }) => (
                      <FormItem className="md:col-span-2"><FormLabel className="text-xs">Credit (UGX)</FormLabel><FormControl><Input type="number" step="any" {...lineField} onChange={e => lineField.onChange(e.target.value === '' ? null : parseFloat(e.target.value))} value={lineField.value ?? ""} /></FormControl><FormMessage /></FormItem> )}/>
                    <FormField control={form.control} name={`lines.${index}.description`} render={({ field: lineField }) => (
                      <FormItem className="md:col-span-3"><FormLabel className="text-xs">Line Description</FormLabel><FormControl><Input {...lineField} /></FormControl><FormMessage /></FormItem> )}/>
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 2} className="md:col-span-1 self-center"><Trash2 className="h-4 w-4 text-destructive"/></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => append({ accountId: "", debit: null, credit: null, description: "" })} className="mt-3">
                  <PlusCircle className="mr-2 h-4 w-4"/> Add Line
                </Button>
                 {form.formState.errors.lines && !form.formState.errors.lines.root && (
                    <p className="text-sm font-medium text-destructive mt-1">{form.formState.errors.lines.message}</p>
                 )}
                 {form.formState.errors.lines?.root && (
                    <p className="text-sm font-medium text-destructive mt-1">{form.formState.errors.lines.root.message}</p>
                 )}
              </div>
              <div className="flex justify-end gap-6 font-semibold text-md pr-10 border-t pt-3">
                <span>Total Debits: UGX {totalDebits.toFixed(2)}</span>
                <span>Total Credits: UGX {totalCredits.toFixed(2)}</span>
                 <span className={balance === 0 ? 'text-green-600' : 'text-destructive'}>Balance: UGX {balance.toFixed(2)}</span>
              </div>
              {balance !== 0 && <p className="text-sm text-destructive text-right pr-10">Entry must be balanced (Total Debits = Total Credits).</p>}
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
                {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>}
                Save Journal Entry
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
