
// src/app/school/dashboard/[schoolId]/finance/journal-entries/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, deleteSchoolSubcollectionItem } from '@/services';
import type { School, JournalEntry, AppTimestamp } from '@/types/school';
import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Briefcase, PlusCircle, Trash2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function JournalEntriesListPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [entryToDelete, setEntryToDelete] = useState<JournalEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchJournalEntries = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" }); router.push('/school/auth'); return;
      }
      setSchool(fetchedSchool);
      const entries = await getSchoolSubcollectionItems<JournalEntry>(schoolId, 'journalEntries', [{ field: 'date', direction: 'desc' }]);
      setJournalEntries(entries);
    } catch (error) {
      console.error("Error fetching journal entries:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load journal entries." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router]);

  useEffect(() => {
    fetchJournalEntries();
  }, [fetchJournalEntries]);

  const handleDeleteEntry = async () => {
    if (!entryToDelete) return;
    setIsDeleting(true);
    try {
      await deleteSchoolSubcollectionItem(schoolId, 'journalEntries', entryToDelete.id);
      toast({ title: "Journal Entry Deleted", description: `Entry "${entryToDelete.description}" removed.` });
      setJournalEntries(prev => prev.filter(entry => entry.id !== entryToDelete.id));
      setEntryToDelete(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Error", description: error.message });
    } finally {
      setIsDeleting(false);
    }
  };
  
  const formatDate = (dateInput: AppTimestamp | undefined) => {
    if (!dateInput) return 'N/A';
    const date = typeof dateInput === 'string' ? new Date(dateInput) : (dateInput as Timestamp).toDate();
    return format(date, "PP"); // e.g., Mar 15, 2024
  };

  if (isLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
       <div className="mb-6">
        <Button variant="outline" asChild>
          <Link href={`/school/dashboard/${schoolId}/finance`}>
            <ArrowLeft className="mr-2 h-4 w-4"/> Back to Finance Overview
          </Link>
        </Button>
      </div>
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle className="text-2xl flex items-center"><Briefcase className="mr-3 h-6 w-6 text-primary"/>Manual Journal Entries</CardTitle>
              <CardDescription>List of all manual journal entries. Use this for adjustments, opening balances, or complex transactions.</CardDescription>
            </div>
            <Link href={`/school/dashboard/${schoolId}/finance/journal-entries/create`}>
              <Button size="sm"><PlusCircle className="mr-2 h-4 w-4"/>Create New Journal Entry</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {journalEntries.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No journal entries recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Total Debits (UGX)</TableHead>
                    <TableHead className="text-right">Total Credits (UGX)</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journalEntries.map(entry => {
                    const totalDebits = entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
                    const totalCredits = entry.lines.reduce((sum, line) => sum + (line.credit || 0), 0);
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="text-xs">{formatDate(entry.date)}</TableCell>
                        <TableCell className="text-xs truncate max-w-xs">{entry.description}</TableCell>
                        <TableCell className="text-right text-xs font-medium">{totalDebits.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-xs font-medium">{totalCredits.toFixed(2)}</TableCell>
                        <TableCell className="text-center space-x-1">
                          <Button variant="ghost" size="icon" onClick={() => setEntryToDelete(entry)} className="h-7 w-7" title="Delete" disabled={isDeleting && entryToDelete?.id === entry.id}>
                            {isDeleting && entryToDelete?.id === entry.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive"/>}
                          </Button>
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
       <AlertDialog open={!!entryToDelete} onOpenChange={() => setEntryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center"><AlertTriangle className="h-5 w-5 mr-2 text-destructive"/>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the journal entry: "{entryToDelete?.description}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
              {isDeleting ? <Loader2 className="animate-spin mr-2"/> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
