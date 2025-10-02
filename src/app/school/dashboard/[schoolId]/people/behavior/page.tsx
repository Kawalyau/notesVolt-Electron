// src/app/school/dashboard/[schoolId]/people/behavior/page.tsx
"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, addSchoolSubcollectionItem, updateSchoolSubcollectionItem, deleteSchoolSubcollectionItem } from '@/services/schoolService';
import type { School, Student, Teacher, SchoolClass, BehaviorRecord, BehaviorRecordCategory, ConfidentialityLevel } from '@/types/school';
import { behaviorRecordCategories, confidentialityLevels } from '@/types/school';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PlusCircle, Edit, Trash2, HeartHandshake, Filter, X } from 'lucide-react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';


const behaviorRecordSchema = z.object({
  studentId: z.string().min(1, "Student is required."),
  date: z.date({ required_error: "Date is required." }),
  category: z.enum(behaviorRecordCategories, { required_error: "Category is required." }),
  details: z.string().min(10, "Details must be at least 10 characters.").max(2000),
  actionTaken: z.string().optional(),
  responsibleStaffId: z.string().min(1, "Responsible staff is required."),
  followUpRequired: z.boolean().default(false),
  nextSteps: z.string().optional(),
  confidentialityLevel: z.enum(confidentialityLevels).default('General'),
});

type BehaviorFormValues = z.infer<typeof behaviorRecordSchema>;

export default function BehaviorRecordsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user: adminUser, userProfile } = useAuth(); // Destructure userProfile
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [records, setRecords] = useState<BehaviorRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [staff, setStaff] = useState<Teacher[]>([]);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<BehaviorRecord | null>(null);

  const [filterStudentId, setFilterStudentId] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');

  const form = useForm<BehaviorFormValues>({
    resolver: zodResolver(behaviorRecordSchema),
  });

  const fetchData = useCallback(async () => {
    if (!adminUser || !schoolId) return;
    setIsLoading(true);
    try {
      const [recordsData, studentsData, staffData] = await Promise.all([
        getSchoolSubcollectionItems<BehaviorRecord>(schoolId, 'behaviorRecords', [{field: 'date', direction: 'desc'}]),
        getSchoolSubcollectionItems<Student>(schoolId, 'students'),
        getSchoolSubcollectionItems<Teacher>(schoolId, 'teachers'),
      ]);
      setRecords(recordsData);
      setStudents(studentsData);
      setStaff(staffData);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load behavior records data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, adminUser, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      const studentMatch = !filterStudentId || record.studentId === filterStudentId;
      const categoryMatch = !filterCategory || record.category === filterCategory;
      return studentMatch && categoryMatch;
    });
  }, [records, filterStudentId, filterCategory]);

  const handleOpenForm = (record?: BehaviorRecord) => {
    setEditingRecord(record || null);
    if (record) {
      form.reset({
        studentId: record.studentId,
        date: new Date((record.date as Timestamp).toDate()),
        category: record.category,
        details: record.details,
        actionTaken: record.actionTaken || '',
        responsibleStaffId: record.responsibleStaffId,
        followUpRequired: record.followUpRequired,
        nextSteps: record.nextSteps || '',
        confidentialityLevel: record.confidentialityLevel || 'General',
      });
    } else {
      form.reset({
        studentId: '',
        date: new Date(),
        category: undefined,
        details: '',
        actionTaken: '',
        responsibleStaffId: userProfile?.uid || '',
        followUpRequired: false,
        nextSteps: '',
        confidentialityLevel: 'General',
      });
    }
    setIsFormOpen(true);
  };
  
  const onSubmit = async (values: BehaviorFormValues) => {
    // FIX: Add check for userProfile before proceeding
    if (!userProfile) {
        toast({ variant: "destructive", title: "Error", description: "Admin user profile not loaded. Please try again." });
        return;
    }
    setIsSubmitting(true);
    const responsibleStaff = staff.find(s => s.id === values.responsibleStaffId);

    const recordData = {
      ...values,
      responsibleStaffName: responsibleStaff ? `${responsibleStaff.firstName} ${responsibleStaff.lastName}` : "Unknown Staff",
      updatedBy: userProfile.uid,
    };

    try {
      if (editingRecord) {
        await updateSchoolSubcollectionItem(schoolId, 'behaviorRecords', editingRecord.id, recordData);
        toast({ title: "Record Updated" });
      } else {
        await addSchoolSubcollectionItem(schoolId, 'behaviorRecords', recordData);
        toast({ title: "Record Created" });
      }
      setIsFormOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!window.confirm("Are you sure you want to delete this record? This cannot be undone.")) return;
    try {
        await deleteSchoolSubcollectionItem(schoolId, 'behaviorRecords', recordId);
        toast({ title: "Record Deleted" });
        fetchData();
    } catch (error: any) {
        toast({variant: "destructive", title: "Delete Failed", description: error.message});
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <CardTitle className="text-2xl flex items-center">
              <HeartHandshake className="mr-3 h-6 w-6 text-primary" />
              Behavior &amp; Support Records
            </CardTitle>
            <CardDescription>Log and track behavioral incidents, academic concerns, and positive support notes for students.</CardDescription>
          </div>
          <Button onClick={() => handleOpenForm()}>
            <PlusCircle className="mr-2 h-4 w-4" /> Log New Record
          </Button>
        </CardHeader>
        <CardContent>
           <div className="flex flex-col sm:flex-row gap-4 mb-4 p-4 border rounded-md">
                <div className="flex-grow">
                    <Label>Filter by Student</Label>
                    <Select value={filterStudentId} onValueChange={setFilterStudentId}>
                        <SelectTrigger><SelectValue placeholder="All Students" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">All Students</SelectItem>
                            {students.map(s => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                 <div className="flex-grow">
                    <Label>Filter by Category</Label>
                    <Select value={filterCategory} onValueChange={setFilterCategory}>
                        <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">All Categories</SelectItem>
                            {behaviorRecordCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button variant="outline" onClick={() => {setFilterStudentId(''); setFilterCategory('');}} className="self-end"><X className="mr-2 h-4 w-4"/>Clear Filters</Button>
            </div>
            
            <div className="overflow-x-auto">
                <Table>
                <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Details</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                    {filteredRecords.map(record => {
                        const student = students.find(s => s.id === record.studentId);
                        return (
                            <TableRow key={record.id}>
                                <TableCell className="text-xs font-medium">{student ? `${student.firstName} ${student.lastName}` : 'Unknown'}</TableCell>
                                <TableCell className="text-xs">{format(new Date((record.date as Timestamp).toDate()), 'PP')}</TableCell>
                                <TableCell className="text-xs"><Badge variant="secondary">{record.category}</Badge></TableCell>
                                <TableCell className="text-xs truncate max-w-xs">{record.details}</TableCell>
                                <TableCell className="text-xs">{record.followUpRequired ? <Badge variant="outline" className="text-amber-600 border-amber-300">Follow-up</Badge> : <Badge variant="outline">Logged</Badge>}</TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="sm" onClick={() => handleOpenForm(record)}><Edit className="h-4 w-4"/></Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteRecord(record.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                    {filteredRecords.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No records match your filters.</TableCell></TableRow>}
                </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
      
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingRecord ? "Edit" : "Log New"} Behavior/Support Record</DialogTitle>
            <DialogDescription>
                {editingRecord ? `Editing record for ${students.find(s=>s.id === editingRecord.studentId)?.firstName}` : "Fill out the details below."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto pr-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="studentId" render={({ field }) => (
                    <FormItem><FormLabel>Student*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a student..." /></SelectTrigger></FormControl><SelectContent>{students.map(s => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.studentRegistrationNumber})</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="date" render={({ field }) => (
                    <FormItem className="flex flex-col"><FormLabel>Date &amp; Time*</FormLabel><DatePicker date={field.value} onDateChange={field.onChange} /><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="category" render={({ field }) => (
                    <FormItem><FormLabel>Category*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a category..." /></SelectTrigger></FormControl><SelectContent>{behaviorRecordCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="details" render={({ field }) => (
                    <FormItem><FormLabel>Details / Description*</FormLabel><FormControl><Textarea {...field} rows={4} placeholder="Describe the incident, concern, or support note..."/></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="actionTaken" render={({ field }) => (
                    <FormItem><FormLabel>Action Taken / Response</FormLabel><FormControl><Textarea {...field} value={field.value || ''} rows={3} placeholder="e.g., Counseling, warning, parent call, referral to headteacher, praise..."/></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="responsibleStaffId" render={({ field }) => (
                    <FormItem><FormLabel>Responsible Staff*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a staff member..." /></SelectTrigger></FormControl><SelectContent>{staff.map(s => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="followUpRequired" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 pt-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Follow-up Required?</FormLabel></FormItem> )}/>
                <FormField control={form.control} name="nextSteps" render={({ field }) => (
                    <FormItem><FormLabel>Next Steps / Recommendations</FormLabel><FormControl><Textarea {...field} value={field.value || ''} rows={3} placeholder="e.g., Monitor behavior, schedule meeting with parent, provide extra academic support..."/></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="confidentialityLevel" render={({ field }) => (
                    <FormItem><FormLabel>Confidentiality Level*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{confidentialityLevels.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>

                <DialogFooter className="sticky bottom-0 bg-background/90 pt-4 pb-1">
                    <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin mr-2"/> : null} {editingRecord ? "Save Changes" : "Save Record"}</Button>
                </DialogFooter>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
