// src/components/school/manage-student-books-dialog.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Student, ExerciseBookTransaction } from '@/types/school';
import type { UserProfile } from '@/types/user';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Book, Save, Plus, Minus } from 'lucide-react';
import { updateStudentInSchool, addStudentExerciseBookTransaction, getSchoolSubcollectionItems } from '@/services/schoolService';
import { format } from 'date-fns';
import { Timestamp, serverTimestamp } from 'firebase/firestore';

interface ManageStudentBooksDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  student: Student | null;
  schoolId: string;
  onDataChange: () => void;
}

export function ManageStudentBooksDialog({
  isOpen,
  onOpenChange,
  student,
  schoolId,
  onDataChange
}: ManageStudentBooksDialogProps) {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  
  const [smallBooksPaidInput, setSmallBooksPaidInput] = useState('');
  const [largeBooksPaidInput, setLargeBooksPaidInput] = useState('');
  const [smallBooksIssuedInput, setSmallBooksIssuedInput] = useState('');
  const [largeBooksIssuedInput, setLargeBooksIssuedInput] = useState('');
  
  const [transactions, setTransactions] = useState<ExerciseBookTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && student) {
      // Reset inputs when dialog opens
      setSmallBooksPaidInput('');
      setLargeBooksPaidInput('');
      setSmallBooksIssuedInput('');
      setLargeBooksIssuedInput('');
      
      // Fetch transaction history
      const fetchHistory = async () => {
        setIsLoading(true);
        try {
          const fetchedTransactions = await getSchoolSubcollectionItems<ExerciseBookTransaction>(schoolId, `students/${student.id}/exerciseBookTransactions`, [{ field: 'date', direction: 'desc' }]);
          setTransactions(fetchedTransactions);
        } catch (error) {
          toast({ variant: "destructive", title: "Error", description: "Could not load transaction history." });
        } finally {
          setIsLoading(false);
        }
      };
      fetchHistory();
    }
  }, [isOpen, student, schoolId, toast]);

  if (!student) return null;

  const smallBalance = (student.exerciseBooksSmall_Paid || 0) - (student.exerciseBooksSmall_Received || 0);
  const largeBalance = (student.exerciseBooksLarge_Paid || 0) - (student.exerciseBooksLarge_Received || 0);

  const handleTransaction = async (type: 'payment' | 'issuance', category: 'small' | 'large') => {
    if (!userProfile) return toast({ variant: 'destructive', title: 'Error', description: 'Admin user not found.' });

    let quantity: number;
    let inputField: 'smallPaid' | 'largePaid' | 'smallIssued' | 'largeIssued';

    if (type === 'payment' && category === 'small') {
      quantity = parseInt(smallBooksPaidInput, 10);
      inputField = 'smallPaid';
    } else if (type === 'payment' && category === 'large') {
      quantity = parseInt(largeBooksPaidInput, 10);
      inputField = 'largePaid';
    } else if (type === 'issuance' && category === 'small') {
      quantity = parseInt(smallBooksIssuedInput, 10);
      inputField = 'smallIssued';
    } else { // issuance, large
      quantity = parseInt(largeBooksIssuedInput, 10);
      inputField = 'largeIssued';
    }

    if (isNaN(quantity) || quantity <= 0) {
      toast({ variant: 'destructive', title: 'Invalid Quantity', description: 'Please enter a positive number.' });
      return;
    }
    
    if (type === 'issuance' && category === 'small' && quantity > smallBalance) {
      toast({ variant: 'destructive', title: 'Cannot Issue', description: `Cannot issue more small books than the balance of ${smallBalance}.` });
      return;
    }
    if (type === 'issuance' && category === 'large' && quantity > largeBalance) {
      toast({ variant: 'destructive', title: 'Cannot Issue', description: `Cannot issue more large books than the balance of ${largeBalance}.` });
      return;
    }

    setIsLoading(true);
    try {
      const transactionData: Omit<ExerciseBookTransaction, 'id' | 'date'> = {
        type,
        bookCategory: category,
        quantity,
        recordedByAdminId: userProfile.uid,
        recordedByAdminName: userProfile.displayName || userProfile.email || 'Admin',
        notes: `${type === 'payment' ? 'Recorded payment for' : 'Issued'} ${quantity} ${category} books.`
      };
      
      await addStudentExerciseBookTransaction(schoolId, student.id, transactionData);

      let studentUpdateData: Partial<Student> = {};
      if (type === 'payment' && category === 'small') studentUpdateData.exerciseBooksSmall_Paid = (student.exerciseBooksSmall_Paid || 0) + quantity;
      if (type === 'payment' && category === 'large') studentUpdateData.exerciseBooksLarge_Paid = (student.exerciseBooksLarge_Paid || 0) + quantity;
      if (type === 'issuance' && category === 'small') studentUpdateData.exerciseBooksSmall_Received = (student.exerciseBooksSmall_Received || 0) + quantity;
      if (type === 'issuance' && category === 'large') studentUpdateData.exerciseBooksLarge_Received = (student.exerciseBooksLarge_Received || 0) + quantity;

      await updateStudentInSchool(schoolId, student.id, studentUpdateData);
      
      toast({ title: "Success", description: "Transaction recorded successfully." });
      onDataChange();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Transaction Failed", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl">Manage Exercise Books for {student.firstName} {student.lastName}</DialogTitle>
          <DialogDescription>Record payments and issue books. Balances are automatically updated.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-grow overflow-hidden">
          <div className="flex flex-col space-y-4">
            {/* Balances */}
            <Card>
              <CardHeader className="pb-2 pt-4"><CardTitle className="text-lg">Current Balances</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-center">
                  <p className="text-sm font-medium text-blue-800">Small Books</p>
                  <p className="text-2xl font-bold text-blue-900">{smallBalance}</p>
                  <p className="text-xs text-muted-foreground">Owed to Student</p>
                </div>
                <div className="p-3 bg-green-50 border border-green-200 rounded-md text-center">
                  <p className="text-sm font-medium text-green-800">Large Books</p>
                  <p className="text-2xl font-bold text-green-900">{largeBalance}</p>
                   <p className="text-xs text-muted-foreground">Owed to Student</p>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Record Payment */}
                <Card>
                    <CardHeader className="pb-2 pt-4"><CardTitle className="text-base flex items-center"><Plus className="mr-2 h-4 w-4 text-green-600"/>Record Payment</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Input type="number" value={smallBooksPaidInput} onChange={e => setSmallBooksPaidInput(e.target.value)} placeholder="Qty" className="h-8"/>
                            <Button size="sm" onClick={() => handleTransaction('payment', 'small')} disabled={isLoading} className="h-8 w-full">Small Books</Button>
                        </div>
                        <div className="flex items-center gap-2">
                            <Input type="number" value={largeBooksPaidInput} onChange={e => setLargeBooksPaidInput(e.target.value)} placeholder="Qty" className="h-8"/>
                            <Button size="sm" onClick={() => handleTransaction('payment', 'large')} disabled={isLoading} className="h-8 w-full">Large Books</Button>
                        </div>
                    </CardContent>
                </Card>
                {/* Issue Books */}
                <Card>
                    <CardHeader className="pb-2 pt-4"><CardTitle className="text-base flex items-center"><Minus className="mr-2 h-4 w-4 text-red-600"/>Issue Books</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center gap-2">
                             <Input type="number" value={smallBooksIssuedInput} onChange={e => setSmallBooksIssuedInput(e.target.value)} placeholder="Qty" className="h-8"/>
                            <Button size="sm" onClick={() => handleTransaction('issuance', 'small')} disabled={isLoading} variant="destructive" className="h-8 w-full">Small Books</Button>
                        </div>
                        <div className="flex items-center gap-2">
                            <Input type="number" value={largeBooksIssuedInput} onChange={e => setLargeBooksIssuedInput(e.target.value)} placeholder="Qty" className="h-8"/>
                            <Button size="sm" onClick={() => handleTransaction('issuance', 'large')} disabled={isLoading} variant="destructive" className="h-8 w-full">Large Books</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
          </div>
          
          {/* History */}
          <div className="flex flex-col">
            <h3 className="font-semibold mb-2">Transaction History</h3>
            <ScrollArea className="border rounded-md flex-grow h-0 min-h-[200px]">
              {isLoading ? <Loader2 className="m-4 h-6 w-6 animate-spin"/> : (
                transactions.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Transaction</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {transactions.map(tx => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-xs">{format(new Date((tx.date as Timestamp).toDate()), 'PP p')}</TableCell>
                          <TableCell className="text-xs capitalize">{tx.type} - {tx.bookCategory} books</TableCell>
                          <TableCell className={`text-right text-xs font-semibold ${tx.type === 'payment' ? 'text-green-600' : 'text-red-600'}`}>
                            {tx.type === 'payment' ? '+' : '-'}{tx.quantity}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <p className="p-4 text-sm text-muted-foreground">No transaction history.</p>
              )}
            </ScrollArea>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
