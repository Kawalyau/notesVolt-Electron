
"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
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
  limit
} from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Printer, Loader2, CheckCircle, AlertCircle, Filter, Download } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { FeeTransaction, Student } from '@/types/school';
import ReactToPrint from 'react-to-print';
import { getSchoolById } from '@/services/schoolService';

export default function TransactionReceiptsPage() {
  const params = useParams();
  const { user: adminUserAuth, userProfile: adminProfile } = useAuth();
  const { toast } = useToast();
  const schoolId = params.schoolId as string;
  const receiptRef = useRef<HTMLDivElement>(null);
  
  const [transactions, setTransactions] = useState<FeeTransaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<FeeTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [printingReceipts, setPrintingReceipts] = useState<string[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<FeeTransaction | null>(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
    fromDate: '',
    toDate: ''
  });
  const [school, setSchool] = useState<any>(null);

  const fetchTransactions = useCallback(async () => {
    if (!adminUserAuth || !schoolId) return;
    
    setLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool) {
        toast({ variant: "destructive", title: "School Not Found" });
        return;
      }
      setSchool(fetchedSchool);

      const studentsRef = collection(firestore, `schools/${schoolId}/students`);
      const studentsSnapshot = await getDocs(studentsRef);
      const students = studentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Student));

      const allTransactions: FeeTransaction[] = [];
      
      const studentPromises = students.map(async (student) => {
        const transactionsRef = collection(firestore, `schools/${schoolId}/students/${student.id}/feeTransactions`);
        const q = query(
          transactionsRef, 
          where("type", "==", "credit"),
          orderBy("transactionDate", "desc"),
          limit(5)
        );
        const querySnapshot = await getDocs(q);
        
        return querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`,
          studentClass: student.className || 'N/A'
        } as FeeTransaction));
      });

      const allStudentTransactions = await Promise.all(studentPromises);
      allStudentTransactions.forEach(studentTxns => {
        allTransactions.push(...studentTxns);
      });

      const sortedTransactions = allTransactions.sort((a, b) => {
        const aDate = a.transactionDate instanceof Timestamp ? a.transactionDate.toMillis() : 
                     typeof a.transactionDate === 'string' ? new Date(a.transactionDate).getTime() : 0;
        const bDate = b.transactionDate instanceof Timestamp ? b.transactionDate.toMillis() : 
                     typeof b.transactionDate === 'string' ? new Date(b.transactionDate).getTime() : 0;
        return bDate - aDate;
      });

      const newestTransactions = sortedTransactions.slice(0, 120);
      
      setTransactions(newestTransactions);
      setFilteredTransactions(newestTransactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load transactions"
      });
    } finally {
      setLoading(false);
    }
  }, [adminUserAuth, schoolId, toast]);

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
        tx.amount.toString().includes(searchTerm)
      );
    }
    
    if (filters.fromDate || filters.toDate) {
      const fromDate = filters.fromDate ? new Date(filters.fromDate).getTime() : 0;
      const toDate = filters.toDate ? new Date(filters.toDate).getTime() + 86400000 : Date.now();
      
      result = result.filter(tx => {
        const txDate = tx.transactionDate instanceof Timestamp ? tx.transactionDate.toMillis() : 
                      typeof tx.transactionDate === 'string' ? new Date(tx.transactionDate).getTime() : 0;
        return txDate >= fromDate && txDate <= toDate;
      });
    }
    
    setFilteredTransactions(result);
  }, [transactions, filters]);

  const formatDate = (date: Timestamp | string | undefined) => {
    if (!date) return 'N/A';
    try {
      const dateObj = date instanceof Timestamp ? date.toDate() : 
                     typeof date === 'string' ? new Date(date) : null;
      return dateObj ? format(dateObj, 'PPpp') : 'N/A';
    } catch (error) {
      console.error("Date formatting error:", error);
      return 'N/A';
    }
  };

  const amountInWords = (amount: number): string => {
    if (amount === 0) return 'Zero shillings only';
    
    const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', 'Ten', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    function convertLessThanOneThousand(num: number): string {
      if (num === 0) return '';
      if (num < 10) return units[num];
      if (num < 20) return teens[num - 10];
      
      const ten = Math.floor(num / 10);
      const unit = num % 10;
      return tens[ten] + (unit ? ' ' + units[unit] : '');
    }
    
    function convert(num: number): string {
      if (num === 0) return 'Zero';
      
      let str = '';
      if (num >= 1000000) {
        str += convert(Math.floor(num / 1000000)) + ' Million ';
        num %= 1000000;
      }
      
      if (num >= 1000) {
        str += convertLessThanOneThousand(Math.floor(num / 1000)) + ' Thousand ';
        num %= 1000;
      }
      
      if (num >= 100) {
        str += units[Math.floor(num / 100)] + ' Hundred ';
        num %= 100;
      }
      
      if (num > 0) {
        if (str !== '') str += 'and ';
        str += convertLessThanOneThousand(num);
      }
      
      return str.trim();
    }
    
    return convert(Math.floor(amount)) + ' Shillings Only';
  };

  const markAsPrinted = async (transactionId: string, studentId: string) => {
    if (!transactionId || !studentId || !adminUserAuth?.uid) return;
    
    setPrintingReceipts(prev => [...prev, transactionId]);
    
    try {
      await updateDoc(doc(firestore, `schools/${schoolId}/students/${studentId}/feeTransactions/${transactionId}`), {
        receiptPrinted: true,
        receiptPrintedAt: Timestamp.now(),
        receiptPrintedBy: adminUserAuth.uid,
        receiptPrintedByName: adminProfile?.displayName || adminUserAuth.email
      });
      
      toast({
        title: "Receipt Printed",
        description: "Receipt has been marked as printed"
      });
      
      setTransactions(prev => prev.map(tx => 
        tx.id === transactionId ? { ...tx, receiptPrinted: true } : tx
      ));
    } catch (error) {
      console.error("Error marking receipt as printed:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to mark receipt as printed"
      });
    } finally {
      setPrintingReceipts(prev => prev.filter(id => id !== transactionId));
    }
  };

  const handlePrint = (transaction: FeeTransaction) => {
    setSelectedTransaction(transaction);
    setShowPrintDialog(true);
  };

  const handleBulkPrint = async () => {
    const unprinted = filteredTransactions.filter(tx => !tx.receiptPrinted);
    if (unprinted.length === 0) {
      toast({
        title: "No receipts to print",
        description: "All selected receipts are already printed"
      });
      return;
    }
    
    const BATCH_SIZE = 5;
    for (let i = 0; i < unprinted.length; i += BATCH_SIZE) {
      const batch = unprinted.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(tx => {
          if (tx.id && tx.studentId) {
            return markAsPrinted(tx.id, tx.studentId);
          }
          return Promise.resolve();
        })
      );
    }
    
    toast({
      title: "Bulk Print Complete",
      description: `${unprinted.length} receipts have been marked as printed`
    });
  };

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Printer className="h-6 w-6 mr-2" />
              Payment Receipts Management (Newest 120)
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={handleBulkPrint}>
                <Printer className="h-4 w-4 mr-2" />
                Bulk Print
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Viewing the 120 most recent payment receipts. Print unprinted receipts.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <Label htmlFor="status-filter">Status</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters({...filters, status: value})}
              >
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Receipts</SelectItem>
                  <SelectItem value="printed">Printed Only</SelectItem>
                  <SelectItem value="unprinted">Unprinted Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search receipts..."
                value={filters.search}
                onChange={(e) => setFilters({...filters, search: e.target.value})}
              />
            </div>
            
            <div>
              <Label htmlFor="from-date">From Date</Label>
              <Input
                id="from-date"
                type="date"
                value={filters.fromDate}
                onChange={(e) => setFilters({...filters, fromDate: e.target.value})}
              />
            </div>
            
            <div>
              <Label htmlFor="to-date">To Date</Label>
              <Input
                id="to-date"
                type="date"
                value={filters.toDate}
                onChange={(e) => setFilters({...filters, toDate: e.target.value})}
                min={filters.fromDate}
              />
            </div>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt No.</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount (UGX)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      <p className="mt-2">Loading transactions...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No transactions match your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>{formatDate(transaction.transactionDate)}</TableCell>
                      <TableCell className="font-medium">{transaction.id}</TableCell>
                      <TableCell>
                        {transaction.studentName || `Student ${transaction.studentId?.substring(0, 6)}`}
                      </TableCell>
                      <TableCell>{transaction.description}</TableCell>
                      <TableCell className="text-right">
                        {transaction.amount.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell>
                        {transaction.receiptPrinted ? (
                          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Printed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                            <AlertCircle className="h-4 w-4 mr-1" />
                            Unprinted
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePrint(transaction)}
                          disabled={printingReceipts.includes(transaction.id!)}
                        >
                          {printingReceipts.includes(transaction.id!) ? (
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
          Showing {filteredTransactions.length} of {transactions.length} most recent transactions
        </CardFooter>
      </Card>
      {showPrintDialog && selectedTransaction && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 no-print">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-auto flex flex-col">
      <div className="p-4 border-b flex justify-between items-center">
        <h3 className="text-lg font-semibold">Print Receipt</h3>
        <div className="flex items-center gap-2">
          <ReactToPrint
            trigger={() => (
              <Button size="sm">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            )}
            content={() => receiptRef.current}
            onAfterPrint={() => {
              if (selectedTransaction?.studentId && selectedTransaction?.id) {
                markAsPrinted(selectedTransaction.id, selectedTransaction.studentId);
              }
              setShowPrintDialog(false);
            }}
          />
           <Button 
              variant="outline"
              size="sm"
              onClick={() => setShowPrintDialog(false)}
          >
              Cancel
          </Button>
        </div>
      </div>
      <div className="p-2 bg-gray-100 flex-grow overflow-y-auto">
          <div ref={receiptRef} className="bg-white p-8 shadow-md mx-auto" style={{width: '210mm', minHeight: '297mm'}}>
           <div className="receipt-header">
              {school?.badgeImageUrl && (
                <Image
                  src={school.badgeImageUrl}
                  alt={`${school.name} Logo`}
                  width={90}
                  height={90}
                  className="school-logo mx-auto"
                  data-ai-hint="school logo"
                />
              )}
              <h2 className="font-bold text-2xl uppercase">{school?.name}</h2>
              {school?.address && <p>{school.address}</p>}
              {school?.phoneNumber && <p>Tel: {school.phoneNumber}</p>}
              <p className="receipt-title text-xl font-bold uppercase mt-4">Fee Payment Receipt</p>
            </div>
             <div className="info-grid grid grid-cols-2 gap-x-4 gap-y-1 my-4 text-sm">
              <p><strong>Student Name:</strong> {selectedTransaction.studentName}</p>
              <p><strong>Receipt No:</strong> {selectedTransaction.id}</p>
               <p><strong>Student ID:</strong> {selectedTransaction.studentId}</p>
              <p><strong>Date:</strong> {formatDate(selectedTransaction.transactionDate)}</p>
            </div>
            <div className="my-4">
              <p className="text-sm"><strong>Received from {selectedTransaction.studentName} the sum of shillings</strong></p>
              <p className="text-center font-bold italic text-md p-2 bg-gray-100 rounded">
                  {amountInWords(selectedTransaction.amount)}
              </p>
            </div>
             <div className="info-grid grid grid-cols-2 gap-x-4 gap-y-1 my-4 text-sm">
               <p><strong>Amount:</strong> UGX {selectedTransaction.amount.toLocaleString()}</p>
               <p><strong>Paid for:</strong> {selectedTransaction.description}</p>
               <p><strong>Payment Method:</strong> {selectedTransaction.paymentMethod}</p>
               <p><strong>Reference:</strong> {selectedTransaction.reference || 'N/A'}</p>
            </div>

            <div className="mt-20 flex justify-between text-sm">
                  <div>
                      <p className="border-t border-gray-400 pt-1">Cashier&apos;s Signature</p>
                  </div>
                  <div>
                      <p className="border-t border-gray-400 pt-1">Student&apos;s Signature</p>
                  </div>
            </div>
          </div>
      </div>
    </div>
  </div>
)}
    </div>
  );
}
