// src/app/school/dashboard/[schoolId]/teachers/[teacherId]/account/page.tsx
"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services';
import type { Teacher, StaffTransaction } from '@/types/school';
import { Timestamp, collection, doc, query, orderBy, getDocs, runTransaction, addDoc, serverTimestamp, increment, getDoc } from 'firebase/firestore';
import { firestore } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, ArrowLeft, Banknote, PlusCircle, MinusCircle } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from 'date-fns';
import Link from 'next/link';

const getTeacherById = async (schoolId: string, teacherId: string): Promise<Teacher | null> => {
    if (!schoolId || !teacherId) return null;
    const teacherDocRef = doc(firestore, `schools/${schoolId}/teachers`, teacherId);
    const docSnap = await getDoc(teacherDocRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Teacher;
    }
    return null;
}


const transactionFormSchema = z.object({
  type: z.enum(['credit', 'debit']),
  amount: z.preprocess(
    (val) => parseFloat(String(val)),
    z.number().positive("Amount must be a positive number.")
  ),
  description: z.string().min(3, "A brief description is required."),
  paymentMethod: z.string().optional(),
  reference: z.string().optional(),
});

type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export default function TeacherAccountPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const teacherId = params.teacherId as string;
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [transactions, setTransactions] = useState<StaffTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      type: 'credit',
      amount: 0,
      description: "",
      paymentMethod: "",
      reference: "",
    },
  });

  const fetchTeacherAndTransactions = useCallback(async () => {
    if (!user || !schoolId || !teacherId) return;
    setIsLoading(true);
    try {
        const fetchedTeacher = await getTeacherById(schoolId, teacherId);
        if (!fetchedTeacher) {
            toast({ variant: "destructive", title: "Teacher not found" });
            router.push(`/school/dashboard/${schoolId}/teachers/directory`);
            return;
        }
        setTeacher(fetchedTeacher);

        const transactionsRef = collection(firestore, `schools/${schoolId}/teachers/${teacherId}/staffTransactions`);
        const q = query(transactionsRef, orderBy("transactionDate", "desc"));
        const snapshot = await getDocs(q);
        setTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StaffTransaction)));
    } catch (error) {
        console.error("Error fetching staff account data:", error);
        toast({ variant: "destructive", title: "Error loading data" });
    } finally {
        setIsLoading(false);
    }
  }, [schoolId, teacherId, user, toast, router]);

  useEffect(() => {
    fetchTeacherAndTransactions();
  }, [fetchTeacherAndTransactions]);

  const onSubmit = async (values: TransactionFormValues) => {
    if (!userProfile || !teacher) return;
    setIsSubmitting(true);
    try {
        const transactionColRef = collection(firestore, `schools/${schoolId}/teachers/${teacherId}/staffTransactions`);
        const teacherDocRef = doc(firestore, `schools/${schoolId}/teachers`, teacherId);

        const newTransaction: Omit<StaffTransaction, 'id'> = {
            teacherId: teacher.id,
            type: values.type,
            amount: values.amount,
            description: values.description,
            paymentMethod: values.paymentMethod || null,
            reference: values.reference || null,
            transactionDate: serverTimestamp(),
            recordedByAdminId: userProfile.uid,
            recordedByAdminName: userProfile.displayName || userProfile.email
        };

        const amountChange = values.type === 'credit' ? -values.amount : values.amount;

        await runTransaction(firestore, async (transaction) => {
            transaction.set(doc(transactionColRef), newTransaction);
            transaction.update(teacherDocRef, { salaryBalance: increment(amountChange) });
        });

        toast({ title: "Transaction Recorded", description: "The staff member's account has been updated." });
        form.reset();
        fetchTeacherAndTransactions();
    } catch (error: any) {
        toast({ variant: "destructive", title: "Transaction Failed", description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };
  
   const transactionLedger = useMemo(() => {
    let balance = 0; // Opening balance starts at 0, salary is a debit
    const sortedTransactions = [...transactions].sort((a, b) => {
        const aDate = (a.transactionDate as Timestamp)?.toMillis() || 0;
        const bDate = (b.transactionDate as Timestamp)?.toMillis() || 0;
        return aDate - bDate;
    });

    const ledger: Array<StaffTransaction & { runningBalance: number }> = sortedTransactions.map(tx => {
      if (tx.type === 'debit') balance += tx.amount;
      else if (tx.type === 'credit') balance -= tx.amount;
      return { ...tx, runningBalance: balance };
    });
    
    return ledger.reverse();
  }, [transactions]);


  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
       <Button variant="outline" size="sm" asChild>
          <Link href={`/school/dashboard/${schoolId}/teachers/directory`}><ArrowLeft className="h-4 w-4 mr-2"/>Back to Directory</Link>
       </Button>
       <Card>
           <CardHeader>
               <CardTitle>{teacher?.firstName} {teacher?.lastName}'s Payment Account</CardTitle>
               <CardDescription>Current Salary Balance: 
                 <span className={`font-bold ml-2 ${ (teacher?.salaryBalance || 0) > 0 ? 'text-destructive' : 'text-green-600'}`}>
                    UGX {(teacher?.salaryBalance || 0).toLocaleString()}
                 </span>
               </CardDescription>
           </CardHeader>
       </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
            <CardHeader><CardTitle className="text-lg flex items-center"><MinusCircle className="h-5 w-5 mr-2 text-destructive"/>Add Salary / Other Charges</CardTitle></CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="amount" render={({ field }) => (
                            <FormItem><FormLabel>Amount</FormLabel><FormControl><Input {...field} type="number" onChange={e => field.onChange(parseFloat(e.target.value))} placeholder="Amount to charge"/></FormControl><FormMessage/></FormItem>
                        )}/>
                         <FormField control={form.control} name="description" render={({ field }) => (
                            <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} placeholder="e.g., August Salary, Salary Advance"/></FormControl><FormMessage/></FormItem>
                        )}/>
                        <Button type="submit" onClick={() => form.setValue('type', 'debit')} disabled={isSubmitting} variant="destructive">
                            {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : null} Add Charge to Account
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
         <Card>
            <CardHeader><CardTitle className="text-lg flex items-center"><PlusCircle className="h-5 w-5 mr-2 text-green-600"/>Record Salary Payment / Allowance</CardTitle></CardHeader>
            <CardContent>
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                         <FormField control={form.control} name="amount" render={({ field }) => (
                            <FormItem><FormLabel>Amount</FormLabel><FormControl><Input {...field} type="number" onChange={e => field.onChange(parseFloat(e.target.value))} placeholder="Amount paid"/></FormControl><FormMessage/></FormItem>
                        )}/>
                         <FormField control={form.control} name="description" render={({ field }) => (
                            <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} placeholder="e.g., August Salary Payment, Transport Allowance"/></FormControl><FormMessage/></FormItem>
                        )}/>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                                <FormItem><FormLabel>Payment Method</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Method"/></SelectTrigger></FormControl><SelectContent><SelectItem value="Bank">Bank Transfer</SelectItem><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Mobile Money">Mobile Money</SelectItem></SelectContent></Select><FormMessage/></FormItem>
                            )}/>
                            <FormField control={form.control} name="reference" render={({ field }) => (
                                <FormItem><FormLabel>Reference</FormLabel><FormControl><Input {...field} placeholder="e.g., Cheque No, TX ID"/></FormControl><FormMessage/></FormItem>
                            )}/>
                        </div>
                        <Button type="submit" onClick={() => form.setValue('type', 'credit')} disabled={isSubmitting}>
                           {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : null} Record Payment / Allowance
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
      </div>

       <Card>
        <CardHeader><CardTitle>Transaction History</CardTitle></CardHeader>
        <CardContent>
            <Table>
                <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Description</TableHead>
                    <TableHead className="text-right">Charges (Debit)</TableHead><TableHead className="text-right">Payments (Credit)</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                    {transactionLedger.map(tx => (
                        <TableRow key={tx.id}>
                            <TableCell>{format((tx.transactionDate as Timestamp).toDate(), 'PP')}</TableCell>
                            <TableCell>{tx.description}</TableCell>
                            <TableCell className="text-right">{tx.type === 'debit' ? tx.amount.toLocaleString() : '-'}</TableCell>
                            <TableCell className="text-right">{tx.type === 'credit' ? tx.amount.toLocaleString() : '-'}</TableCell>
                            <TableCell className="text-right font-semibold">{tx.runningBalance.toLocaleString()}</TableCell>
                        </TableRow>
                    ))}
                    {transactionLedger.length === 0 && <TableRow><TableCell colSpan={5} className="text-center">No transactions yet.</TableCell></TableRow>}
                </TableBody>
            </Table>
        </CardContent>
       </Card>
    </div>
  );
}
