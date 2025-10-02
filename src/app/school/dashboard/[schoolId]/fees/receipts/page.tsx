
// src/app/school/dashboard/[schoolId]/fees/receipts/page.tsx
"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { firestore } from '@/config/firebase';
import { 
  Timestamp, 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  orderBy,
  limit,
  collectionGroup,
  serverTimestamp
} from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Printer, Loader2, CheckCircle, AlertCircle, Filter, Download } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { FeeTransaction, Student, School, FeeReceiptData, FeeReceiptItemDetails, AppTimestamp, SchoolClass, FeeItem } from '@/types/school';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services/schoolService';
import Image from 'next/image';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import ReactToPrint from 'react-to-print';


interface EnrichedFeeTransaction extends FeeTransaction {
  studentName?: string;
  studentClass?: string;
  studentRegNo?: string;
}

export default function TransactionReceiptsPage() {
  const params = useParams();
  const { user: adminUserAuth, userProfile: adminProfile } = useAuth();
  const { toast } = useToast();
  const schoolId = params.schoolId as string;
  const receiptRef = useRef<HTMLDivElement>(null);
  
  const [transactions, setTransactions] = useState<EnrichedFeeTransaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<EnrichedFeeTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPreparingReceipt, setIsPreparingReceipt] = useState(false);
  const [printingReceipts, setPrintingReceipts] = useState<string[]>([]);
  const [selectedTransactionForReceipt, setSelectedTransactionForReceipt] = useState<EnrichedFeeTransaction | null>(null);
  const [receiptData, setReceiptData] = useState<FeeReceiptData | null>(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
    fromDate: '',
    toDate: ''
  });
  const [school, setSchool] = useState<School | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!adminUserAuth || !schoolId) return;
    setLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool) { toast({ variant: "destructive", title: "School Not Found" }); return; }
      setSchool(fetchedSchool);

      // 1. Fetch all students
      const studentsSnapshot = await getDocs(query(collection(firestore, `schools/${schoolId}/students`)));
      const students = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      const classes = await getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses');
      const classesMap = new Map(classes.map(c => [c.id, c.class]));

      // 2. Loop through students and get their credit transactions
      const allTransactions: EnrichedFeeTransaction[] = [];
      const studentPromises = students.map(async (student) => {
        const transactionsRef = collection(firestore, `schools/${schoolId}/students/${student.id}/feeTransactions`);
        const q = query(transactionsRef, where("type", "==", "credit"));
        const querySnapshot = await getDocs(q);
        
        return querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as Omit<FeeTransaction, 'id'>),
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`,
          studentClass: classesMap.get(student.classId) || 'N/A',
          studentRegNo: student.studentRegistrationNumber,
        }));
      });

      const allStudentTransactions = await Promise.all(studentPromises);
      allStudentTransactions.forEach(studentTxns => {
        allTransactions.push(...studentTxns);
      });

      // 3. Sort all transactions by date
      const sortedTransactions = allTransactions.sort((a, b) => {
        const aDate = a.transactionDate instanceof Timestamp ? a.transactionDate.toMillis() : 
                     typeof a.transactionDate === 'string' ? new Date(a.transactionDate).getTime() : 0;
        const bDate = b.transactionDate instanceof Timestamp ? b.transactionDate.toMillis() : 
                     typeof b.transactionDate === 'string' ? new Date(b.transactionDate).getTime() : 0;
        return bDate - aDate;
      });
      
      setTransactions(sortedTransactions);
      setFilteredTransactions(sortedTransactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to load transactions" });
    } finally {
      setLoading(false);
    }
  }, [adminUserAuth, schoolId, toast]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    let result = [...transactions];
    
    if (filters.status !== 'all') {
      result = result.filter(tx => 
        filters.status === 'printed' ? tx.receiptPrinted : !tx.receiptPrinted
      );
    }
    
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      result = result.filter(tx => 
        tx.studentName?.toLowerCase().includes(searchTerm) ||
        tx.description?.toLowerCase().includes(searchTerm) ||
        tx.id?.toLowerCase().includes(searchTerm) ||
        tx.amount.toString().includes(searchTerm) ||
        tx.studentRegNo?.toLowerCase().includes(searchTerm)
      );
    }
    
    if (filters.fromDate || filters.toDate) {
      const fromDate = filters.fromDate ? new Date(filters.fromDate).getTime() : 0;
      const toDate = filters.toDate ? new Date(filters.toDate).getTime() + 86400000 : Date.now();
      
      result = result.filter(tx => {
        const txDateValue = tx.transactionDate;
        if (!txDateValue) return false;
        const txDate = txDateValue instanceof Timestamp ? txDateValue.toMillis() : new Date(txDateValue).getTime();
        return txDate >= fromDate && txDate <= toDate;
      });
    }
    
    setFilteredTransactions(result);
  }, [transactions, filters]);

  const formatDate = (date: AppTimestamp | undefined) => {
    if (!date) return 'N/A';
    try {
      const dateObj = date instanceof Timestamp ? date.toDate() : typeof date === 'string' ? parseISO(date) : null;
      return dateObj && isValid(dateObj) ? format(dateObj, 'PPp') : 'N/A';
    } catch (error) { console.error("Date formatting error:", error); return 'N/A'; }
  };

  const markAsPrinted = async (transactionId: string, studentId: string) => {
    if (!transactionId || !studentId || !adminUserAuth?.uid) return;
    setPrintingReceipts(prev => [...prev, transactionId]);
    try {
      await updateDoc(doc(firestore, `schools/${schoolId}/students/${studentId}/feeTransactions/${transactionId}`), {
        receiptPrinted: true, receiptPrintedAt: serverTimestamp(),
        receiptPrintedBy: adminUserAuth.uid, receiptPrintedByName: adminProfile?.displayName || adminUserAuth.email
      });
      toast({ title: "Receipt Printed", description: "Receipt has been marked as printed" });
      setTransactions(prev => prev.map(tx => tx.id === transactionId ? { ...tx, receiptPrinted: true } : tx));
    } catch (error) {
      console.error("Error marking receipt as printed:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to mark receipt as printed" });
    } finally {
      setPrintingReceipts(prev => prev.filter(id => id !== transactionId));
    }
  };

  const prepareAndShowReceipt = async (transaction: EnrichedFeeTransaction) => {
    if (!school || !transaction.studentId) return;
    setIsPreparingReceipt(true);
    setSelectedTransactionForReceipt(transaction);
    setShowPrintDialog(true);
    
    try {
        const studentTransactionsSnapshot = await getDocs(query(collection(firestore, `schools/${schoolId}/students/${transaction.studentId}/feeTransactions`), orderBy('transactionDate', 'asc')));
        const allStudentTxs = studentTransactionsSnapshot.docs.map(d => ({id: d.id, ...d.data()} as FeeTransaction));

        const getMillis = (ts: AppTimestamp) => ts instanceof Timestamp ? ts.toMillis() : new Date(ts as string).getTime();
        const targetTxTimestamp = getMillis(transaction.transactionDate!);
        
        let previousOverallBalance = 0;
        allStudentTxs.forEach(tx => {
            if (getMillis(tx.transactionDate!) < targetTxTimestamp) {
                previousOverallBalance += (tx.type === 'debit' ? tx.amount : -tx.amount);
            }
        });

        const newOverallBalance = previousOverallBalance - transaction.amount;

        setReceiptData({
            schoolName: school.name,
            schoolAddress: school.address,
            schoolPhone: school.phoneNumber,
            schoolLogoUrl: school.badgeImageUrl,
            studentName: transaction.studentName || 'N/A',
            studentRegNo: transaction.studentRegNo || 'N/A',
            studentClass: transaction.studentClass || 'N/A',
            receiptNumber: transaction.id || "N/A",
            transactionDate: formatDate(transaction.transactionDate),
            paymentReceived: transaction.amount,
            paymentMethod: transaction.paymentMethod,
            paymentReference: transaction.reference,
            paidForDescription: transaction.description,
            academicYear: 'N/A', term: 'N/A', items: [],
            totalBilledThisContext: 0, totalPaidThisContext: 0,
            previousOverallBalance: previousOverallBalance,
            newOverallBalance: newOverallBalance,
        });

    } catch (e) {
        console.error("Failed to prepare receipt data", e);
        toast({variant: "destructive", title: "Error", description: "Could not calculate balances for this receipt."});
        setShowPrintDialog(false);
    } finally {
        setIsPreparingReceipt(false);
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Printer className="h-6 w-6 mr-2" />
              Recent Payment Receipts
            </div>
          </CardTitle>
          <CardDescription>
            View the most recent payment receipts from all students.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <Label htmlFor="status-filter">Status</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters({...filters, status: value})}>
                <SelectTrigger id="status-filter"><SelectValue placeholder="Filter by status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Receipts</SelectItem>
                  <SelectItem value="printed">Printed Only</SelectItem>
                  <SelectItem value="unprinted">Unprinted Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="search">Search</Label>
              <Input id="search" placeholder="Search by name, reg no, etc..." value={filters.search} onChange={(e) => setFilters({...filters, search: e.target.value})} />
            </div>
            
            <div>
              <Label htmlFor="from-date">From Date</Label>
              <Input id="from-date" type="date" value={filters.fromDate} onChange={(e) => setFilters({...filters, fromDate: e.target.value})} />
            </div>
            
            <div>
              <Label htmlFor="to-date">To Date</Label>
              <Input id="to-date" type="date" value={filters.toDate} onChange={(e) => setFilters({...filters, toDate: e.target.value})} min={filters.fromDate} />
            </div>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Amount (UGX)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /><p className="mt-2">Loading transactions...</p></TableCell></TableRow>
                ) : filteredTransactions.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No transactions match your filters</TableCell></TableRow>
                ) : (
                  filteredTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs">{formatDate(tx.transactionDate)}</TableCell>
                      <TableCell className="font-medium text-xs">{tx.studentName}</TableCell>
                      <TableCell className="text-xs">{tx.studentClass}</TableCell>
                      <TableCell className="text-right font-semibold">{tx.amount.toLocaleString('en-US')}</TableCell>
                      <TableCell>
                        {tx.receiptPrinted ? (
                          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50"><CheckCircle className="h-4 w-4 mr-1" />Printed</Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50"><AlertCircle className="h-4 w-4 mr-1" />Unprinted</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => prepareAndShowReceipt(tx)} disabled={printingReceipts.includes(tx.id!) || isPreparingReceipt}>
                          {(isPreparingReceipt && selectedTransactionForReceipt?.id === tx.id) || printingReceipts.includes(tx.id!) ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Printer className="h-4 w-4 mr-2" />
                          )}
                          Print
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          Showing {filteredTransactions.length} of {transactions.length} recent transactions
        </CardFooter>
      </Card>
      
      {showPrintDialog && receiptData && selectedTransactionForReceipt && (
        <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
            <DialogContent className="max-w-4xl bg-white text-gray-900 print:max-w-full print:border-none print:shadow-none">
              <div ref={receiptRef} className="p-4">
                <div className="receipt-header text-center mb-4 pb-3 border-b-2 border-primary">
                  {receiptData.schoolLogoUrl && (
                    <Image src={receiptData.schoolLogoUrl} alt={`${receiptData.schoolName} Logo`} width={80} height={80} className="school-logo mx-auto mb-2" />
                  )}
                  <h2 className="text-2xl font-bold uppercase">{receiptData.schoolName}</h2>
                  {receiptData.schoolAddress && <p className="text-xs">{receiptData.schoolAddress}</p>}
                  {receiptData.schoolPhone && <p className="text-xs">Tel: {receiptData.schoolPhone}</p>}
                  <p className="text-xl font-bold uppercase mt-4">FEE PAYMENT RECEIPT</p>
                </div>
                <div className="info-grid text-sm grid grid-cols-2 gap-x-4 gap-y-1 my-4">
                  <p><strong>Student Name:</strong> {receiptData.studentName}</p>
                  <p><strong>Receipt No:</strong> {receiptData.receiptNumber}</p>
                   <p><strong>Student ID:</strong> {selectedTransactionForReceipt.studentId}</p>
                  <p><strong>Date:</strong> {receiptData.transactionDate}</p>
                </div>
                 <div className="my-4 text-sm">
                  <p><strong>Paid For:</strong> {receiptData.paidForDescription}</p>
                </div>
                <div className="totals-section mt-6 pt-4 border-t-2 border-black text-sm">
                  <div className="grid grid-cols-2">
                    <p className="text-right pr-4"><strong>Previous Balance:</strong></p>
                    <p className="text-right pr-4">UGX {receiptData.previousOverallBalance.toLocaleString()}</p>
                  </div>
                  <div className="grid grid-cols-2">
                    <p className="text-right pr-4"><strong>Payment Received:</strong></p>
                    <p className="text-right pr-4">UGX {receiptData.paymentReceived.toLocaleString()}</p>
                  </div>
                   <div className="grid grid-cols-2 mt-2 pt-2 border-t font-bold text-lg">
                    <p className="text-right pr-4">New Balance:</p>
                    <p className="text-right pr-4">UGX {receiptData.newOverallBalance.toLocaleString()}</p>
                  </div>
                </div>
                <div className="footer-notes text-xs text-center mt-8 pt-4 border-t">
                  <p><strong>Received by:</strong> {adminProfile?.displayName || adminProfile?.email || 'School Administrator'}</p>
                  <p>Thank you for your payment.</p>
                </div>
              </div>
              <DialogFooter className="mt-6 pt-4 border-t no-print">
                <Button variant="outline" onClick={() => setShowPrintDialog(false)}>Cancel</Button>
                <ReactToPrint
                    trigger={() => {
                        const TriggerButton = React.forwardRef<HTMLButtonElement>((props, ref) => (
                           <Button ref={ref}><Printer className="mr-2 h-4 w-4" /> Print Receipt</Button>
                        ));
                        TriggerButton.displayName = "TriggerButton";
                        return <TriggerButton/>;
                    }}
                    content={() => receiptRef.current}
                    onAfterPrint={() => {
                        if (selectedTransactionForReceipt) {
                        markAsPrinted(selectedTransactionForReceipt.id!, selectedTransactionForReceipt.studentId!);
                        }
                        setShowPrintDialog(false);
                    }}
                />
              </DialogFooter>
            </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
