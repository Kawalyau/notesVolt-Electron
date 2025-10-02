// src/components/school/teacher-form-dialog.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import * as z from "zod";
import type { Teacher, StaffSalaryItem } from '@/types/school';
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { firestore, storage } from "@/config/firebase";
import { addDoc, updateDoc, doc, serverTimestamp, collection, Timestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/ui/date-picker";
import { format, parseISO, isValid } from 'date-fns';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserPlus, ImageUp, XCircle, PlusCircle, Trash2, DollarSign } from "lucide-react";
import Image from "next/image";
import { Progress } from "@/components/ui/progress";
import { Separator } from "../ui/separator";

const MAX_PHOTO_SIZE_MB = 5;
const MAX_PHOTO_SIZE_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const salaryItemSchema = z.object({
  type: z.enum(['Allowance', 'Deduction']),
  name: z.string().min(1, "Item name is required."),
  amount: z.preprocess(
    (val) => parseFloat(String(val)),
    z.number().positive("Amount must be a positive number.")
  ),
});

const teacherFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional(),
  status: z.enum(['Active', 'Inactive'], { required_error: "Status is required" }),
  photo: z.instanceof(File).optional().nullable()
    .refine(file => !file || file.size <= MAX_PHOTO_SIZE_BYTES, `Max photo size is ${MAX_PHOTO_SIZE_MB}MB.`)
    .refine(file => !file || ALLOWED_PHOTO_TYPES.includes(file.type), `Photo type not supported.`),
  contractStartDate: z.date().optional().nullable(),
  contractEndDate: z.date().optional().nullable(),
  baseSalary: z.preprocess(
    (val) => parseFloat(String(val)),
    z.number().nonnegative("Base salary cannot be negative.").optional().nullable()
  ),
  recurringItems: z.array(salaryItemSchema).optional(),
}).refine(data => {
    if (data.contractEndDate && data.contractStartDate) {
        return data.contractEndDate >= data.contractStartDate;
    }
    return true;
}, {
    message: "Contract end date must be after the start date.",
    path: ["contractEndDate"],
});

export type TeacherFormValues = z.infer<typeof teacherFormSchema>;

interface TeacherFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  schoolId: string;
  initialData?: Teacher | null;
  onTeacherSaved: () => void;
}

export function TeacherFormDialog({ isOpen, onOpenChange, schoolId, initialData, onTeacherSaved }: TeacherFormDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<number | null>(null);

  const form = useForm<TeacherFormValues>({
    resolver: zodResolver(teacherFormSchema),
    defaultValues: {
      firstName: "", lastName: "", email: "", phone: "", status: "Active", photo: null, 
      contractStartDate: null, contractEndDate: null, baseSalary: null, recurringItems: []
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "recurringItems"
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        const parseDate = (date: any) => {
            if (!date) return null;
            if (date instanceof Date) return date;
            if (typeof date === 'string') return parseISO(date);
            if (date.seconds) return new Timestamp(date.seconds, date.nanoseconds).toDate();
            return null;
        }
        form.reset({
          firstName: initialData.firstName || "",
          lastName: initialData.lastName || "",
          email: initialData.email || "",
          phone: initialData.phone || "",
          status: initialData.status || "Active",
          photo: null,
          contractStartDate: parseDate(initialData.contractStartDate),
          contractEndDate: parseDate(initialData.contractEndDate),
          baseSalary: initialData.baseSalary ?? null,
          recurringItems: initialData.recurringItems || [],
        });
        setPhotoPreview(initialData.photoUrl || null);
      } else {
        form.reset({
          firstName: "", lastName: "", email: "", phone: "", status: "Active", photo: null,
          contractStartDate: null, contractEndDate: null, baseSalary: null, recurringItems: [],
        });
        setPhotoPreview(null);
      }
      setPhotoUploadProgress(null);
    }
  }, [isOpen, initialData, form]);

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > MAX_PHOTO_SIZE_BYTES || !ALLOWED_PHOTO_TYPES.includes(file.type)) {
        form.setError("photo", { message: `Invalid file (max ${MAX_PHOTO_SIZE_MB}MB, image only).` }); return;
      }
      form.setValue("photo", file, { shouldValidate: true });
      form.clearErrors("photo");
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    form.setValue("photo", null, { shouldValidate: true });
    setPhotoPreview(null);
    const fileInput = document.getElementById('teacher-photo') as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const onSubmit = async (values: TeacherFormValues) => {
    if (!user) return;
    setIsSubmitting(true);
    setPhotoUploadProgress(null);

    let photoUrl = initialData?.photoUrl;

    try {
      if (values.photo) {
        setPhotoUploadProgress(0);
        if (initialData?.photoUrl) {
          try { await deleteObject(ref(storage, initialData.photoUrl)); } catch (e) { console.warn("Failed to delete old photo", e); }
        }
        const photoFile = values.photo;
        const photoStorageRef = ref(storage, `schools/${schoolId}/teacher_photos/${Date.now()}_${photoFile.name}`);
        const uploadTask = uploadBytesResumable(photoStorageRef, photoFile);
        photoUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => setPhotoUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            reject,
            async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
          );
        });
      } else if (photoPreview === null && initialData?.photoUrl) {
        try { await deleteObject(ref(storage, initialData.photoUrl)); } catch (e) { console.warn("Failed to delete old photo", e); }
        photoUrl = undefined;
      }

      const teacherData: Partial<Teacher> = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email || null,
        phone: values.phone || null,
        status: values.status,
        photoUrl: photoUrl === undefined ? null : (photoUrl || null),
        contractStartDate: values.contractStartDate ? Timestamp.fromDate(values.contractStartDate) : null,
        contractEndDate: values.contractEndDate ? Timestamp.fromDate(values.contractEndDate) : null,
        baseSalary: values.baseSalary ?? null,
        recurringItems: values.recurringItems || [],
        updatedAt: serverTimestamp(),
      };

      if (initialData) {
        const teacherRef = doc(firestore, `schools/${schoolId}/teachers`, initialData.id);
        await updateDoc(teacherRef, teacherData);
        toast({ title: "Teacher Updated", description: `${values.firstName} ${values.lastName}'s details updated.` });
      } else {
        const teacherRef = collection(firestore, `schools/${schoolId}/teachers`);
        await addDoc(teacherRef, { ...teacherData, createdAt: serverTimestamp() });
        toast({ title: "Teacher Added", description: `${values.firstName} ${values.lastName} added to staff.` });
      }

      onTeacherSaved();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving teacher:", error);
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
      setPhotoUploadProgress(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center">
            <UserPlus className="mr-2 h-5 w-5" />
            {initialData ? "Edit Teacher / Staff Member" : "Add New Teacher / Staff Member"}
          </DialogTitle>
          <DialogDescription>
            Enter the staff member's details, contract dates, and salary information.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 flex-grow overflow-y-auto pr-4">
            {/* Personal Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem><FormLabel>First Name*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem><FormLabel>Last Name*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem> )}/>
            </div>
             <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem><FormLabel>Status*</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select><FormMessage />
              </FormItem> )}/>
             <div>
              <FormLabel>Photo (Optional)</FormLabel>
              <div className="mt-1 flex items-center gap-4">
                {photoPreview ? (
                  <div className="relative h-20 w-20 rounded-full overflow-hidden border">
                    <Image src={photoPreview} alt="Teacher photo preview" layout="fill" objectFit="cover" />
                  </div>
                ) : (
                  <div className="h-20 w-20 rounded-full border bg-muted flex items-center justify-center">
                    <UserPlus className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-grow">
                  <FormField control={form.control} name="photo" render={() => (
                    <FormItem>
                      <FormControl><Input id="teacher-photo" type="file" accept="image/*" onChange={handlePhotoChange} className="block w-full text-sm"/></FormControl>
                      <FormMessage />
                    </FormItem> )}/>
                  {photoPreview && (
                    <Button type="button" variant="link" size="sm" onClick={removePhoto} className="text-destructive px-0 mt-1">
                      <XCircle className="h-4 w-4 mr-1"/>Remove Photo
                    </Button>
                  )}
                </div>
              </div>
              {photoUploadProgress !== null && <Progress value={photoUploadProgress} className="w-full h-1.5 mt-2" />}
            </div>

            <Separator className="my-4"/>

            {/* Contract & Salary Details */}
            <h3 className="font-semibold">Contract & Salary</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="contractStartDate" render={({ field }) => (
                    <FormItem><FormLabel>Contract Start Date</FormLabel><FormControl><DatePicker date={field.value ?? undefined} onDateChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="contractEndDate" render={({ field }) => (
                    <FormItem><FormLabel>Contract End Date (Optional)</FormLabel><FormControl><DatePicker date={field.value ?? undefined} onDateChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="baseSalary" render={({ field }) => (
                    <FormItem><FormLabel>Base Salary (Monthly)</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} value={field.value ?? ""} placeholder="e.g., 1500000"/></FormControl><FormMessage /></FormItem>
                )}/>
             </div>
             
             {/* Recurring Salary Items */}
              <Separator className="my-4"/>
              <h3 className="font-semibold">Recurring Allowances & Deductions</h3>
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-center p-2 border rounded-md">
                     <FormField control={form.control} name={`recurringItems.${index}.type`} render={({ field: itemField }) => (
                      <FormItem className="col-span-3"><Select onValueChange={itemField.onChange} defaultValue={itemField.value}><FormControl><SelectTrigger><SelectValue placeholder="Type"/></SelectTrigger></FormControl><SelectContent><SelectItem value="Allowance">Allowance</SelectItem><SelectItem value="Deduction">Deduction</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
                     <FormField control={form.control} name={`recurringItems.${index}.name`} render={({ field: itemField }) => (
                      <FormItem className="col-span-4"><FormControl><Input {...itemField} placeholder="e.g., Transport" /></FormControl><FormMessage /></FormItem> )}/>
                     <FormField control={form.control} name={`recurringItems.${index}.amount`} render={({ field: itemField }) => (
                      <FormItem className="col-span-4"><FormControl><Input type="number" {...itemField} placeholder="Amount" /></FormControl><FormMessage /></FormItem> )}/>
                    <div className="col-span-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                    </div>
                  </div>
                ))}
                 <Button type="button" size="sm" variant="outline" onClick={() => append({ type: 'Allowance', name: '', amount: 0 })}>
                  <PlusCircle className="h-4 w-4 mr-2"/> Add Item
                </Button>
              </div>

            <DialogFooter className="pt-4 sticky bottom-0 bg-background/90 backdrop-blur-sm z-10 -mx-6 px-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || (photoUploadProgress !== null && photoUploadProgress < 100)}>
                {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : null}
                {isSubmitting ? 'Saving...' : (initialData ? 'Save Changes' : 'Add Teacher')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
