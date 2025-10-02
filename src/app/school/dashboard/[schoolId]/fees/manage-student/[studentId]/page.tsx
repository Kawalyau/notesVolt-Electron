
"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { firestore } from '@/config/firebase';
import { Timestamp, serverTimestamp, getDoc, collection as firestoreCollection, query as firestoreQuery, where, getDocs } from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { Student, School, SchoolClass, SchoolAcademicYear, FeeItem, FeeTransaction, FeeReceiptData, FeeReceiptItemDetails, AppTimestamp, SchoolExpense, ChartOfAccountItem } from '@/types/school';
import { getSchoolById, getStudentById, getSchoolSubcollectionItems, addFeeTransaction, getFeeTransactions, deleteAllStudentFeeTransactions, addSchoolSubcollectionItem } from '@/services/schoolService';
import ReactToPrint from 'react-to-print';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, ShieldAlert, Banknote, ListChecks, FilePlus, HandCoins, Printer, Eye, Trash2, AlertTriangle, Award } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, parseISO } from 'date-fns';
import Image from 'next/image';

const debitFormSchema = z.object({
  feeItemId: z.string().min(1, "Please select a fee item to bill."),
  description: z.string().optional(),
  amount: z.preprocess(
    (val) => parseFloat(String(val)),
    z.number().refine(val => !isNaN(val), "Amount must be a valid number.") // Allow 0 or negative
  ),
});
type DebitFormValues = z.infer<typeof debitFormSchema>;

const creditFormSchema = z.object({
  paymentAmount: z.preprocess(
    (val) => parseFloat(String(val)),
    z.number().refine(val => !isNaN(val), "Payment amount must be a valid number.") // Allow 0 or negative
  ),
  paymentMethod: z.string().min(1, "Payment method is required."),
  reference: z.string().optional(),
  paymentDescription: z.string().min(3, "A brief description for the payment is required.").max(150),
});
type CreditFormValues = z.infer<typeof creditFormSchema>;

const bursaryFormSchema = z.object({
  bursaryAmount: z.preprocess(
    (val) => parseFloat(String(val)),
    z.number().positive({ message: "Bursary amount must be a positive number." })
  ),
  reason: z.string().min(5, "Reason for bursary is required.").max(200, "Reason is too long."),
});
type BursaryFormValues = z.infer<typeof bursaryFormSchema>;

export default function ManageStudentFeesPage() {
  const params = useParams();
  const router = useRouter();
  const { user: adminUserAuth, userProfile: adminProfile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const receiptRef = useRef<HTMLDivElement>(null);

  const schoolId = params.schoolId as string;
  const studentId = params.studentId as string;

  const [school, setSchool] = useState<School | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [academicYears, setAcademicYears] = useState<SchoolAcademicYear[]>([]);
  const [feeItems, setFeeItems] = useState<FeeItem[]>([]);
  const [feeTransactions, setFeeTransactions] = useState<FeeTransaction[]>([]);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmittingDebit, setIsSubmittingDebit] = useState(false);
  const [isSubmittingCredit, setIsSubmittingCredit] = useState(false);
  const [isSubmittingBursary, setIsSubmittingBursary] = useState(false);
  const [isDeletingTransactions, setIsDeletingTransactions] = useState(false);
  const [isAdminForSchool, setIsAdminForSchool] = useState(false);

  const [receiptData, setReceiptData] = useState<FeeReceiptData | null>(null);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  const debitForm = useForm<DebitFormValues>({
    resolver: zodResolver(debitFormSchema),
    defaultValues: { feeItemId: "", description: "", amount: 0 },
  });

  const creditForm = useForm<CreditFormValues>({
    resolver: zodResolver(creditFormSchema),
    defaultValues: { paymentAmount: 0, paymentMethod: "", reference: "", paymentDescription: "" },
  });

  const bursaryForm = useForm<BursaryFormValues>({
    resolver: zodResolver(bursaryFormSchema),
    defaultValues: { bursaryAmount: 0, reason: "" },
  });

  const selectedFeeItemIdForDebit = debitForm.watch("feeItemId");

  useEffect(() => {
    if (selectedFeeItemIdForDebit && student && student.classId && feeItems.length > 0) {
      const selectedItem = feeItems.find(item => item.id === selectedFeeItemIdForDebit);
      if (selectedItem) {
        const classSpecificAmount = selectedItem.classAmounts.find(ca => ca.classId === student.classId)?.amount;
        debitForm.setValue("amount", classSpecificAmount || 0);
        debitForm.setValue("description", selectedItem.name);
      }
    }
  }, [selectedFeeItemIdForDebit, student, feeItems, debitForm]);

  const fetchAllPageData = useCallback(async (showLoadingIndicator = true) => {
    if (!adminUserAuth || !schoolId || !studentId) return;
    if (showLoadingIndicator) setIsLoadingData(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(adminUserAuth.uid)) {
        toast({ variant: "destructive", title: "Access Denied" });
        router.push(`/school/dashboard/${schoolId}`); setIsAdminForSchool(false); return;
      }
      setSchool(fetchedSchool); setIsAdminForSchool(true);

      const [s, sc, ay, fi, ft] = await Promise.all([
        getStudentById(schoolId, studentId),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        getSchoolSubcollectionItems<SchoolAcademicYear>(schoolId, 'schoolAcademicYears'),
        getSchoolSubcollectionItems<FeeItem>(schoolId, 'feeItems'),
        getFeeTransactions(schoolId, studentId),
      ]);
      if (!s) { toast({ variant: "destructive", title: "Student Not Found" }); setStudent(null); if (showLoadingIndicator) setIsLoadingData(false); return; }

      setStudent(s); setSchoolClasses(sc); setAcademicYears(ay); setFeeItems(fi); setFeeTransactions(ft);
    } catch (error) {
      console.error("Error loading data for Manage Fees page:", error);
      toast({ variant: "destructive", title: "Error Loading Data" });
    } finally {
      if (showLoadingIndicator) setIsLoadingData(false);
    }
  }, [adminUserAuth, schoolId, studentId, toast, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!adminUserAuth) {
      router.replace(`/login?redirect=/school/dashboard/${schoolId}/students/${studentId}/manage-fees`);
      return;
    }
    fetchAllPageData(true);
  }, [adminUserAuth, authLoading, router, schoolId, studentId, fetchAllPageData]);

  const prepareFeeReceiptData = async (transactionInput: FeeTransaction | { id: string }): Promise<void> => {
    if (!school || !student) return;

    let targetPaymentTransaction: FeeTransaction | undefined;

    if ('type' in transactionInput) { 
        targetPaymentTransaction = transactionInput;
    } else { 
        targetPaymentTransaction = feeTransactions.find(tx => tx.id === transactionInput.id && tx.type === 'credit');
    }
    
    if (!targetPaymentTransaction) {
        console.warn("Target payment transaction not found for receipt generation.", transactionInput);
        toast({variant: "destructive", title: "Receipt Error", description: "Selected payment transaction not found."});
        return;
    }
    
    const studentClassObj = schoolClasses.find(c => c.id === student.classId);
    const studentClassName = studentClassObj ? (studentClassObj.code ? `${studentClassObj.class} (${studentClassObj.code})` : studentClassObj.class) : 'N/A';
    
    const receiptAcademicYearId = targetPaymentTransaction.academicYearId || school.currentAcademicYearId;
    const receiptTerm = targetPaymentTransaction.term || school.currentTerm;
    const receiptAcademicYearObj = academicYears.find(ay => ay.id === receiptAcademicYearId);
    const receiptAcademicYearName = receiptAcademicYearObj?.year || 'N/A';

    const getMillis = (ts: AppTimestamp | undefined): number => {
        if (!ts) return 0;
        if (typeof ts === 'string') return new Date(ts).getTime();
        if ('toMillis' in ts && typeof ts.toMillis === 'function') return (ts as Timestamp).toMillis();
        if ('_seconds' in ts && typeof ts._seconds === 'number') return ((ts as any).toDate() as Date).getTime();
        return new Date(ts as any).getTime(); // Fallback for JS Date objects
    };

    const targetTransactionDateMillis = getMillis(targetPaymentTransaction.transactionDate);
    
    const relevantTransactions = feeTransactions
      .filter(tx => tx.transactionDate && getMillis(tx.transactionDate) <= targetTransactionDateMillis)
      .sort((a, b) => getMillis(a.transactionDate) - getMillis(b.transactionDate));

    let previousOverallBalance = 0;
    for (const tx of relevantTransactions) {
      if (getMillis(tx.transactionDate) < targetTransactionDateMillis) { // All transactions strictly before the target
        if (tx.type === 'debit') previousOverallBalance += tx.amount;
        else if (tx.type === 'credit') previousOverallBalance -= tx.amount;
      } else if (getMillis(tx.transactionDate) === targetTransactionDateMillis && tx.id !== targetPaymentTransaction.id) { // Same day but not the target itself
         if (tx.type === 'debit') previousOverallBalance += tx.amount;
        else if (tx.type === 'credit') previousOverallBalance -= tx.amount;
      }
    }
    
    const newOverallBalance = relevantTransactions.reduce((balance, tx) => {
        if (tx.type === 'debit') return balance + tx.amount;
        return balance - tx.amount;
    }, 0);

    const receiptItemDetails: FeeReceiptItemDetails[] = [];
    let totalBilledThisContext = 0;
    
    const feeItemsInReceiptContext = feeItems.filter(fi => 
        fi.academicYearId === receiptAcademicYearId && 
        fi.term === receiptTerm &&
        fi.classAmounts.some(ca => ca.classId === student.classId)
    );
    
    feeItemsInReceiptContext.forEach(fi => {
        const billedAmountForThisItemInContext = relevantTransactions
            .filter(tx => tx.type === 'debit' && 
                           tx.feeItemId === fi.id && 
                           tx.academicYearId === receiptAcademicYearId && 
                           tx.term === receiptTerm)
            .reduce((sum, tx) => sum + tx.amount, 0);
        
        if (billedAmountForThisItemInContext > 0) { 
             receiptItemDetails.push({
                name: fi.name,
                billedAmount: billedAmountForThisItemInContext,
            });
        }
        totalBilledThisContext += billedAmountForThisItemInContext;
    });
    
    const totalPaidThisContext = relevantTransactions.filter(tx => 
        tx.type === 'credit' && 
        tx.academicYearId === receiptAcademicYearId && 
        tx.term === receiptTerm
    ).reduce((sum, tx) => sum + tx.amount, 0);
    
    setReceiptData({
      schoolName: school.name,
      schoolAddress: school.address,
      schoolPhone: school.phoneNumber,
      schoolLogoUrl: school.badgeImageUrl,
      studentName: `${student.firstName} ${student.lastName}`,
      studentRegNo: student.studentRegistrationNumber,
      studentClass: studentClassName,
      receiptNumber: targetPaymentTransaction.id || "N/A",
      transactionDate: format((typeof targetPaymentTransaction.transactionDate === 'string' ? parseISO(targetPaymentTransaction.transactionDate) : (targetPaymentTransaction.transactionDate as Timestamp).toDate()), 'PPpp'),
      paymentReceived: targetPaymentTransaction.amount,
      paymentMethod: targetPaymentTransaction.paymentMethod,
      paymentReference: targetPaymentTransaction.reference,
      paidForDescription: targetPaymentTransaction.description,
      academicYear: receiptAcademicYearName,
      term: receiptTerm || 'N/A',
      items: receiptItemDetails,
      totalBilledThisContext: totalBilledThisContext,
      totalPaidThisContext: totalPaidThisContext, 
      previousOverallBalance: previousOverallBalance,
      newOverallBalance: newOverallBalance, 
    });
    setShowReceiptDialog(true);
  };

  const handleDebitSubmit = async (values: DebitFormValues) => {
    if (!school || !student || !adminProfile) return;
    setIsSubmittingDebit(true);
    const selectedItem = feeItems.find(item => item.id === values.feeItemId);
    if (!selectedItem) {
      toast({ variant: "destructive", title: "Invalid Fee Item" });
      setIsSubmittingDebit(false); return;
    }

    const transaction: Omit<FeeTransaction, 'id' | 'createdAt'> = {
      studentId, schoolId,
      type: 'debit',
      description: values.description || selectedItem.name,
      amount: values.amount,
      feeItemId: selectedItem.id,
      academicYearId: selectedItem.academicYearId || school.currentAcademicYearId || null,
      term: selectedItem.term || school.currentTerm || null,
      transactionDate: serverTimestamp() as Timestamp,
      recordedByAdminId: adminProfile.uid,
      recordedByAdminName: adminProfile.displayName || adminProfile.email || null,
    };
    try {
      await addFeeTransaction(schoolId, studentId, transaction);
      toast({ title: "Fee Billed", description: `${selectedItem.name} billed to student.` });
      debitForm.reset({ feeItemId: "", description: "", amount: 0 });
      await fetchAllPageData(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Billing Failed", description: error.message });
    } finally {
      setIsSubmittingDebit(false);
    }
  };

  const handleCreditSubmit = async (values: CreditFormValues) => {
    if (!school || !student || !adminProfile) return;
    setIsSubmittingCredit(true);
    const transactionData: Omit<FeeTransaction, 'id' | 'createdAt'> = {
      studentId, schoolId,
      type: 'credit',
      description: values.paymentDescription,
      amount: values.paymentAmount,
      academicYearId: school.currentAcademicYearId || null, 
      term: school.currentTerm || null,                   
      transactionDate: serverTimestamp() as Timestamp,
      recordedByAdminId: adminProfile.uid,
      recordedByAdminName: adminProfile.displayName || adminProfile.email || null,
      paymentMethod: values.paymentMethod,
      reference: values.reference || null,
    };
    try {
      const newTxId = await addFeeTransaction(schoolId, studentId, transactionData);
      toast({ title: "Payment Recorded", description: `Payment of UGX ${values.paymentAmount} recorded.` });
      creditForm.reset({ paymentAmount: 0, paymentMethod: "", reference: "", paymentDescription: "" });
      
      const newTransactionForReceipt: FeeTransaction = {
          ...transactionData,
          id: newTxId,
          transactionDate: new Date().toISOString(), 
      };
      
      await fetchAllPageData(false); 
      await prepareFeeReceiptData(newTransactionForReceipt); 

    } catch (error: any) {
      toast({ variant: "destructive", title: "Payment Failed", description: error.message });
    } finally {
      setIsSubmittingCredit(false);
    }
  };

  const handleBursarySubmit = async (values: BursaryFormValues) => {
    if (!school || !student || !adminProfile) return;
    setIsSubmittingBursary(true);

    // Use the default bursary expense account from school settings
    if (!school.defaultBursaryExpenseAccountId) {
      toast({ variant: "destructive", title: "Bursary Application Failed", description: "No default bursary expense account configured in finance settings." });
      setIsSubmittingBursary(false);
      return;
    }

    // Fetch the default bursary expense account details
    const expenseAccounts = await getSchoolSubcollectionItems<ChartOfAccountItem>(schoolId, 'chartOfAccounts');
    const bursaryAccount = expenseAccounts.find(acc => acc.id === school.defaultBursaryExpenseAccountId && acc.accountType === 'Expense');

    if (!bursaryAccount) {
      toast({ variant: "destructive", title: "Bursary Application Failed", description: "Default bursary expense account not found or invalid." });
      setIsSubmittingBursary(false);
      return;
    }

    const transactionData: Omit<FeeTransaction, 'id' | 'createdAt'> = {
      studentId, schoolId,
      type: 'credit',
      description: `Bursary Award: ${values.reason}`,
      amount: values.bursaryAmount,
      academicYearId: school.currentAcademicYearId || null,
      term: school.currentTerm || null,
      transactionDate: serverTimestamp() as Timestamp,
      recordedByAdminId: adminProfile.uid,
      recordedByAdminName: adminProfile.displayName || adminProfile.email || null,
      paymentMethod: "Bursary/Scholarship",
      reference: `BURSARY-${Date.now()}`,
    };

    const expenseData: Omit<SchoolExpense, 'id' | 'createdAt' | 'updatedAt'> = {
      date: serverTimestamp() as Timestamp,
      category: bursaryAccount.accountName,
      accountId: bursaryAccount.id,
      accountName: bursaryAccount.accountName,
      description: `Bursary for ${student.firstName} ${student.lastName}: ${values.reason}`,
      amount: values.bursaryAmount,
      paymentMethod: "Bursary/Scholarship",
      reference: `BURSARY-${Date.now()}`,
      academicYearId: school.currentAcademicYearId || null,
      term: school.currentTerm || null,
      recordedByAdminId: adminProfile.uid,
      recordedByAdminName: adminProfile.displayName || adminProfile.email || null,
    };

    try {
      // Add fee transaction (bursary credit)
      const newTxId = await addFeeTransaction(schoolId, studentId, transactionData);

      // Add expense record
      await addSchoolSubcollectionItem(schoolId, 'expenses', expenseData);

      toast({ 
        title: "Bursary Awarded", 
        description: `Bursary of UGX ${values.bursaryAmount.toFixed(2)} applied to student account and recorded as an expense.` 
      });
      bursaryForm.reset({ bursaryAmount: 0, reason: "" });
      
      const newTransactionForReceipt: FeeTransaction = {
        ...transactionData,
        id: newTxId,
        transactionDate: new Date().toISOString(), 
      };
      await fetchAllPageData(false);
      // Optionally generate a receipt for the bursary
      // await prepareFeeReceiptData(newTransactionForReceipt); 

    } catch (error: any) {
      toast({ variant: "destructive", title: "Bursary Application Failed", description: error.message });
    } finally {
      setIsSubmittingBursary(false);
    }
  };
  
  const handleViewPastReceipt = async (transactionId: string) => {
    await prepareFeeReceiptData({ id: transactionId });
  };

  const handleDeleteAllTransactions = async () => {
    if (!schoolId || !studentId || !adminUserAuth) {
      toast({variant: "destructive", title: "Error", description: "Missing required IDs for deletion."});
      return;
    }
    setIsDeletingTransactions(true);
    try {
      await deleteAllStudentFeeTransactions(schoolId, studentId);
      toast({title: "Transactions Deleted", description: "All fee transactions for this student have been cleared."});
      await fetchAllPageData(false); // Refresh data
    } catch (error: any) {
      console.error("Error deleting all transactions:", error);
      toast({variant: "destructive", title: "Deletion Failed", description: error.message || "Could not delete transactions."});
    } finally {
      setIsDeletingTransactions(false);
      setShowDeleteConfirmation(false);
    }
  };

  const transactionLedger = useMemo(() => {
    let balance = 0;
    const sortedTransactions = [...feeTransactions].sort((a, b) => {
      const getMs = (ts: any) => {
        if (!ts) return 0;
        if (typeof ts === 'string') return new Date(ts).getTime();
        return (ts as Timestamp).toMillis();
      };
      return getMs(a.transactionDate) - getMs(b.transactionDate);
    });

    const ledgerWithRunningBalance = sortedTransactions.map(tx => {
        if (tx.type === 'debit') balance += tx.amount;
        else if (tx.type === 'credit') balance -= tx.amount;
        return { ...tx, runningBalance: balance };
    });
    
    return ledgerWithRunningBalance.reverse(); 
  }, [feeTransactions]);

  const studentClassName = schoolClasses.find(c => c.id === student?.classId)?.class || 'N/A';
  const currentFeeBalance = student?.feeBalance || 0;

  const formatDateSafe = (dateInput: any) => {
    if (!dateInput) return 'N/A';
    try {
      const date = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput.toDate();
      return format(date, "PPpp");
    } catch (error) {
      try {
          return format(new Date(dateInput as any), "PPpp");
      } catch (e) {
          console.warn("Date formatting failed:", dateInput, e);
          return 'Invalid Date';
      }
    }
  };
  
  if (isLoadingData || authLoading) {
    return <div className="flex justify-center items-center min-h-screen-minus"><Loader2 className="h-12 w-12 animate-spin text-primary" />Loading...</div>;
  }
  if (!adminUserAuth || !isAdminForSchool) {
    return <div className="text-center p-6"><ShieldAlert className="h-12 w-12 mx-auto mb-3 text-destructive"/>Access Denied.</div>;
  }
  if (!student || !school) {
    return <div className="text-center p-6">Student or school data not found.</div>;
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 py-8 space-y-8">
      <div className="mb-6">
        <Button variant="outline" onClick={() => router.push(`/school/dashboard/${schoolId}/students`)} size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Student List
        </Button>
        <h1 className="text-3xl font-bold text-primary flex items-center mt-2">
          <Banknote className="mr-3 h-8 w-8" /> Manage Fees for {student.firstName} {student.lastName}
          </h1>
        <Card className="mt-3 p-4 bg-muted/20 shadow-md rounded-lg">
            <CardDescription className="text-sm space-y-0.5">
            <div>Reg No: <span className="font-semibold text-foreground">{student.studentRegistrationNumber}</span> | Class: <span className="font-semibold text-foreground">{studentClassName}</span></div>
            <div>Current Academic Year: <span className="font-semibold text-foreground">{academicYears.find(ay => ay.id === school.currentAcademicYearId)?.year || 'N/A'}</span> | Term: <span className="font-semibold text-foreground">{school.currentTerm || 'N/A'}</span></div>
            <div>Current Overall Fee Balance: <span className={`font-bold text-xl ${currentFeeBalance > 0 ? 'text-destructive' : (currentFeeBalance < 0 ? 'text-green-600' : 'text-foreground')}`}>UGX {currentFeeBalance.toFixed(2)}</span></div>
            </CardDescription>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="shadow-md lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center"><FilePlus className="mr-2 h-5 w-5 text-primary"/>Bill Student (Debit)</CardTitle>
            <CardDescription>Assign a fee item to this student's account. This will use the academic year and term defined for the selected fee item.</CardDescription>
          </CardHeader>
          <Form {...debitForm}>
            <form onSubmit={debitForm.handleSubmit(handleDebitSubmit)}>
              <CardContent className="space-y-4">
                <FormField control={debitForm.control} name="feeItemId" render={({ field }) => (
                  <FormItem><FormLabel>Fee Item*</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select fee item" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {student && feeItems
                          .filter(item => item.classAmounts.some(ca => ca.classId === student?.classId)) 
                          .map(item => <SelectItem key={item.id} value={item.id}>{item.name} (Year: {academicYears.find(ay=>ay.id === item.academicYearId)?.year || 'N/A'}, Term: {item.term || 'N/A'})</SelectItem>)}
                        {student && feeItems.filter(item => item.classAmounts.some(ca => ca.classId === student?.classId)).length === 0 &&
                           <SelectItem value="_NO_ITEMS_APPLICABLE_" disabled>No fee items applicable to this student's class</SelectItem>
                        }
                      </SelectContent>
                    </Select><FormMessage />
                  </FormItem> )}/>
                <FormField control={debitForm.control} name="amount" render={({ field }) => (
                  <FormItem><FormLabel>Amount (UGX)*</FormLabel><FormControl><Input type="number" step="any" {...field} readOnly className="bg-muted/50" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={debitForm.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Description (Auto-filled)</FormLabel><FormControl><Input {...field} readOnly className="bg-muted/50" /></FormControl><FormMessage /></FormItem> )}/>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isSubmittingDebit} className="bg-primary hover:bg-primary/90">
                  {isSubmittingDebit && <Loader2 className="animate-spin mr-2"/>} Bill Student
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>

        <Card className="shadow-md lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center"><HandCoins className="mr-2 h-5 w-5 text-green-600"/>Record Payment (Credit)</CardTitle>
            <CardDescription>Record a payment made by the student. This payment applies to the school's current academic year and term.</CardDescription>
          </CardHeader>
           <Form {...creditForm}>
            <form onSubmit={creditForm.handleSubmit(handleCreditSubmit)}>
              <CardContent className="space-y-4">
                <FormField control={creditForm.control} name="paymentAmount" render={({ field }) => (
                  <FormItem><FormLabel>Payment Amount (UGX)*</FormLabel><FormControl><Input type="number" step="any" {...field} placeholder="e.g. 50000" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={creditForm.control} name="paymentMethod" render={({ field }) => (
                  <FormItem><FormLabel>Payment Method*</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger></FormControl>
                        <SelectContent>
                            <SelectItem value="Cash">Cash</SelectItem>
                            <SelectItem value="Bank Deposit">Bank Deposit</SelectItem>
                            <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                            <SelectItem value="SchoolPay">SchoolPay</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select><FormMessage />
                    </FormItem> )}/>
                <FormField control={creditForm.control} name="paymentDescription" render={({ field }) => (
                    <FormItem><FormLabel>Payment Description*</FormLabel><FormControl><Input {...field} placeholder="e.g., Part payment for Term 1" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={creditForm.control} name="reference" render={({ field }) => (
                  <FormItem><FormLabel>Reference (Optional)</FormLabel><FormControl><Input {...field} placeholder="e.g., Receipt No., Bank Slip ID" /></FormControl><FormMessage /></FormItem> )}/>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isSubmittingCredit} className="bg-green-600 hover:bg-green-700 text-white">
                  {isSubmittingCredit && <Loader2 className="animate-spin mr-2"/>} Record Payment
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
        
        <Card className="shadow-md lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center"><Award className="mr-2 h-5 w-5 text-amber-600"/>Award Bursary / Scholarship (Credit)</CardTitle>
            <CardDescription>Apply a bursary or scholarship to the student's account. This will reduce their outstanding balance.</CardDescription>
          </CardHeader>
           <Form {...bursaryForm}>
            <form onSubmit={bursaryForm.handleSubmit(handleBursarySubmit)}>
              <CardContent className="space-y-4">
                <FormField control={bursaryForm.control} name="bursaryAmount" render={({ field }) => (
                  <FormItem><FormLabel>Bursary Amount (UGX)*</FormLabel><FormControl><Input type="number" step="any" {...field} placeholder="e.g. 25000" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={bursaryForm.control} name="reason" render={({ field }) => (
                  <FormItem><FormLabel>Reason / Description for Bursary*</FormLabel><FormControl><Textarea {...field} placeholder="e.g., Academic Excellence Scholarship for Term 1" rows={3}/></FormControl><FormMessage /></FormItem> )}/>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isSubmittingBursary} className="bg-amber-600 hover:bg-amber-700 text-white">
                  {isSubmittingBursary && <Loader2 className="animate-spin mr-2"/>} Award Bursary
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>

      <Card className="shadow-lg">
        <CardHeader className="flex flex-row justify-between items-center">
          <div>
            <CardTitle className="flex items-center"><ListChecks className="mr-2 h-5 w-5 text-primary"/>Fee Transaction Ledger</CardTitle>
            <CardDescription>History of all fee transactions for this student. Debits increase balance owed, Credits decrease it.</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowDeleteConfirmation(true)}
            disabled={feeTransactions.length === 0 || isDeletingTransactions}
            className="text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4"/> Delete All Transactions
          </Button>
        </CardHeader>
        <CardContent>
          {transactionLedger.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No fee transactions recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Academic Context</TableHead>
                    <TableHead className="text-right">Debit (UGX)</TableHead>
                    <TableHead className="text-right">Credit (UGX)</TableHead>
                    <TableHead className="text-right">Running Balance (UGX)</TableHead>
                    <TableHead className="text-xs">Recorded By</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {transactionLedger.map(tx => {
                        const txYear = academicYears.find(ay => ay.id === tx.academicYearId)?.year || tx.academicYearId || 'N/A';
                        const txTerm = tx.term || 'N/A';
                        return (
                            <TableRow key={tx.id}>
                                <TableCell className="text-xs">{formatDateSafe(tx.transactionDate)}</TableCell>
                                <TableCell className="text-xs">{tx.description}</TableCell>
                                <TableCell className="text-xs">{txYear} / {txTerm}</TableCell>
                                <TableCell className="text-right text-xs">{tx.type === 'debit' ? tx.amount.toFixed(2) : '-'}</TableCell>
                                <TableCell className="text-right text-xs">{tx.type === 'credit' ? tx.amount.toFixed(2) : '-'}</TableCell>
                                <TableCell className={`text-right text-xs font-semibold ${tx.runningBalance > 0 ? 'text-destructive' : (tx.runningBalance < 0 ? 'text-green-600' : 'text-foreground')}`}>
                                    {tx.runningBalance.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{tx.recordedByAdminName || tx.recordedByAdminId}</TableCell>
                                <TableCell className="text-center">
                                  {tx.type === 'credit' && tx.id && (
                                    <Button variant="outline" size="xs" onClick={() => handleViewPastReceipt(tx.id!)} title="View Receipt">
                                        <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
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

      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center">
                    <AlertTriangle className="h-6 w-6 mr-2 text-destructive"/> Are you sure?
                </AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete all fee transactions for 
                    <strong> {student.firstName} {student.lastName}</strong> and reset their fee balance to zero.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setShowDeleteConfirmation(false)} disabled={isDeletingTransactions}>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                    onClick={handleDeleteAllTransactions} 
                    disabled={isDeletingTransactions}
                    className="bg-destructive hover:bg-destructive/90"
                >
                    {isDeletingTransactions ? <Loader2 className="animate-spin mr-2"/> : null}
                    Yes, Delete All
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

       {receiptData && (
        <AlertDialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
          <AlertDialogContent className="max-w-4xl bg-white text-gray-900 print:max-w-full print:border-none print:shadow-none">
            <div ref={receiptRef}>
              <div id="fee-receipt-content-area" className="p-4">
                <div className="receipt-header">
                  {receiptData.schoolLogoUrl && (
                    <Image
                      src={receiptData.schoolLogoUrl}
                      alt={`${receiptData.schoolName} Logo`}
                      width={90}
                      height={90}
                      className="school-logo mx-auto"
                      data-ai-hint="school logo"
                    />
                  )}
                  <h2>{receiptData.schoolName}</h2>
                  {receiptData.schoolAddress && <p>{receiptData.schoolAddress}</p>}
                  {receiptData.schoolPhone && <p>Tel: {receiptData.schoolPhone}</p>}
                  <p className="receipt-title">FEE PAYMENT RECEIPT</p>
                </div>
                <div className="info-section">
                  <h3 className="section-title">Student Information</h3>
                  <div className="info-grid">
                    <p><strong>Student Name:</strong> {receiptData.studentName}</p>
                    <p><strong>Registration No:</strong> {receiptData.studentRegNo}</p>
                    <p><strong>Class:</strong> {receiptData.studentClass}</p>
                    <p><strong>Academic Year:</strong> {receiptData.academicYear}</p>
                    <p><strong>Term:</strong> {receiptData.term}</p>
                    <p><strong>Receipt No:</strong> {receiptData.receiptNumber}</p>
                    <p><strong>Date:</strong> {receiptData.transactionDate}</p>
                  </div>
                </div>
                <div className="payment-details-section">
                  <h3 className="section-title">Payment Details</h3>
                  <div className="info-grid">
                    <p><strong>Amount Received:</strong> UGX {receiptData.paymentReceived.toFixed(2)}</p>
                    <p><strong>Payment Method:</strong> {receiptData.paymentMethod || 'N/A'}</p>
                    {receiptData.paymentReference && (<p><strong>Reference:</strong> {receiptData.paymentReference}</p>)}
                    <p><strong>Paid For:</strong> {receiptData.paidForDescription}</p>
                  </div>
                </div>
                {receiptData.items.length > 0 && (
                  <div className="fee-summary-section">
                    <h3 className="section-title">Fee Summary for {receiptData.academicYear} / {receiptData.term}</h3>
                    <table><thead><tr><th>Fee Item</th><th className="number">Amount Billed (UGX)</th></tr></thead><tbody>
                        {receiptData.items.map((item, index) => (<tr key={index}><td>{item.name}</td><td className="number">{item.billedAmount.toFixed(2)}</td></tr>))}
                    </tbody></table>
                  </div>
                )}
                <div className="totals-section">
                  <p><strong>Total Billed ({receiptData.academicYear} / {receiptData.term}):</strong> UGX {receiptData.totalBilledThisContext.toFixed(2)}</p>
                  <p><strong>Total Paid ({receiptData.academicYear} / {receiptData.term}):</strong> UGX {receiptData.totalPaidThisContext.toFixed(2)}</p>
                  <hr className="my-2 border-dashed border-gray-300" />
                  <p><strong>Previous Overall Balance:</strong> UGX {receiptData.previousOverallBalance.toFixed(2)}</p>
                  <p><strong>Payment Received:</strong> UGX {receiptData.paymentReceived.toFixed(2)}</p>
                  <p className={`grand-total ${receiptData.newOverallBalance > 0 ? 'balance-positive' : receiptData.newOverallBalance < 0 ? 'balance-negative' : 'balance-zero'}`}><strong>New Overall Balance:</strong> UGX {receiptData.newOverallBalance.toFixed(2)}</p>
                </div>
                <div className="footer-notes">
                  <p>Received by: {adminProfile?.displayName || adminProfile?.email || 'School Administrator'}</p>
                  <p>Thank you for your payment. Please retain this receipt for your records.</p>
                  <p>Generated by SchoolMS</p>
                </div>
              </div>
            </div>
            <AlertDialogFooter className="mt-6 pt-4 border-t no-print">
              <Button variant="outline" onClick={() => setShowReceiptDialog(false)}>Close</Button>
              <ReactToPrint
                trigger={() => <Button><Printer className="mr-2 h-4 w-4" /> Print Receipt</Button>}
                content={() => receiptRef.current}
              />
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
