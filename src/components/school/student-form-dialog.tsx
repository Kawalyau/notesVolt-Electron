// src/components/school/student-form-dialog.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import type { Student, School, SchoolClass, RegistrationNumberConfig, PhysicalRequirement, FeeItem, AppTimestamp } from '@/types/school';
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { firestore, storage, functions as firebaseFunctions } from "@/config/firebase";
import { collection, addDoc, updateDoc, doc, serverTimestamp, Timestamp, getDoc, query, where, getDocs } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";
import { httpsCallable } from 'firebase/functions';
import { addStudentToSchool, updateStudentInSchool, getSchoolSubcollectionItems, updateSchoolData } from '@/services/schoolService';
import { showNotification } from '@/lib/notifications'; // Import the new notification helper


import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadCloud, UserPlus, Loader2, ImageUp, XCircle } from "lucide-react";
import { format, parseISO, isValid as isDateValid } from 'date-fns';
import Image from "next/image";
import { Progress } from "@/components/ui/progress";

const MAX_PHOTO_SIZE_MB = 5;
const MAX_PHOTO_SIZE_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const studentFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  middleName: z.string().optional(),
  lastName: z.string().min(1, "Last name is required"),
  gender: z.enum(['Male', 'Female', 'Other'], { required_error: "Gender is required" }),
  dateOfBirth: z.date({ required_error: "Date of birth is required" }),
  classId: z.string().min(1, "Class assignment is required"),
  studentRegistrationNumber: z.string().min(1, "Student Registration Number is required"),
  guardianPhone: z.string().optional(),
  photo: z.instanceof(File).optional().nullable()
    .refine(file => !file || file.size <= MAX_PHOTO_SIZE_BYTES, `Max photo size is ${MAX_PHOTO_SIZE_MB}MB.`)
    .refine(file => !file || ALLOWED_PHOTO_TYPES.includes(file.type), `Photo type not supported.`),
  status: z.enum(['Active', 'Inactive', 'Graduated', 'Withdrawn'], { required_error: "Status is required" }),
});

type StudentFormValues = z.infer<typeof studentFormSchema>;

interface StudentFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  school: School;
  schoolClasses: SchoolClass[];
  allStudents: Student[]; // For uniqueness check
  initialData?: Student | null;
  onStudentSaved: () => void;
}


export function StudentFormDialog({ isOpen, onOpenChange, school, schoolClasses, allStudents, initialData, onStudentSaved }: StudentFormDialogProps) {
  const { user, userProfile } = useAuth(); // userProfile is the admin's profile
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncingSchoolPay, setIsSyncingSchoolPay] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<number | null>(null);
  const [schoolPhysicalRequirements, setSchoolPhysicalRequirements] = useState<PhysicalRequirement[]>([]);
  const [schoolFeeItems, setSchoolFeeItems] = useState<FeeItem[]>([]);

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      firstName: "", middleName: "", lastName: "",
      gender: undefined, dateOfBirth: undefined, classId: "",
      studentRegistrationNumber: "", guardianPhone: "", photo: null, status: "Active",
    },
  });

  const generateRegistrationNumber = (config: RegistrationNumberConfig | null | undefined, nextNum?: number): string => {
    if (!config || (config.nextSuffix === null || config.nextSuffix === undefined) && (nextNum === null || nextNum === undefined) ) {
      return `TEMP_REG_${Date.now()}`;
    }
    const suffixToUse = nextNum !== undefined ? nextNum : (config.nextSuffix || 1);
    const prefix = config.prefix || "";
    const suffix = String(suffixToUse).padStart(config.suffixPadding || 1, '0');
    return `${prefix}${suffix}`;
  };


  useEffect(() => {
    if (isOpen) {
      let suggestedRegNum = "";
      if (!initialData && school?.registrationNumberConfig) {
        suggestedRegNum = generateRegistrationNumber(school.registrationNumberConfig);
      }
      
      const fetchExtraData = async () => {
        if (!school || !school.id) return;
        try {
          const [reqs, fees] = await Promise.all([
            getSchoolSubcollectionItems<PhysicalRequirement>(school.id, 'physicalRequirements'),
            getSchoolSubcollectionItems<FeeItem>(school.id, 'feeItems')
          ]);
          setSchoolPhysicalRequirements(reqs);
          setSchoolFeeItems(fees);
        } catch (err) {
            console.error("Failed to fetch requirements or fee items for student form:", err);
            toast({variant: "destructive", title: "Error", description: "Could not load school configurations."});
        }
      };
      fetchExtraData();


      if (initialData) {
        form.reset({
          firstName: initialData.firstName || "",
          middleName: initialData.middleName || "",
          lastName: initialData.lastName || "",
          gender: initialData.gender || undefined,
          dateOfBirth: initialData.dateOfBirth ? (typeof initialData.dateOfBirth === 'string' ? parseISO(initialData.dateOfBirth) : (initialData.dateOfBirth as Timestamp).toDate()) : undefined,
          classId: initialData.classId || "",
          studentRegistrationNumber: initialData.studentRegistrationNumber || suggestedRegNum,
          guardianPhone: initialData.guardianPhone || "",
          photo: null,
          status: initialData.status || "Active",
        });
        setPhotoPreview(initialData.photoUrl || null);
      } else {
        form.reset({
          firstName: "", middleName: "", lastName: "",
          gender: undefined, dateOfBirth: undefined, classId: "",
          studentRegistrationNumber: suggestedRegNum,
          guardianPhone: "", photo: null, status: "Active",
        });
        setPhotoPreview(null);
      }
      setPhotoUploadProgress(null);
      setIsSyncingSchoolPay(false);
    }
  }, [isOpen, initialData, form, school, toast]);

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > MAX_PHOTO_SIZE_BYTES) {
        form.setError("photo", { message: `Max file size ${MAX_PHOTO_SIZE_MB}MB.` }); return;
      }
      if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
        form.setError("photo", { message: "Invalid file type." }); return;
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
    const fileInput = document.getElementById('student-photo') as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const callSyncStudentWithSchoolPay = async (studentDataForApi: any, studentDocId: string) => {
    setIsSyncingSchoolPay(true);
    showNotification("Syncing with SchoolPay", `Attempting to register ${studentDataForApi.firstName} with SchoolPay...`);
    try {
      const syncFunction = httpsCallable(firebaseFunctions, 'syncStudentWithSchoolPay');
      const result = await syncFunction(studentDataForApi);
      const { success, message } = result.data as { success: boolean; message: string };

      if (success) {
        showNotification("SchoolPay Sync Successful", message);
      } else {
        showNotification("SchoolPay Sync Failed", message);
      }
      const studentRef = doc(firestore, `schools/${school.id}/students`, studentDocId);
      await updateDoc(studentRef, {
          schoolPaySyncedAt: serverTimestamp(),
          schoolPaySyncStatus: success ? 'Success' : 'Failed',
          schoolPaySyncMessage: message,
      });

    } catch (error: any) {
      console.error("Error calling syncStudentWithSchoolPay function:", error);
      showNotification("SchoolPay Sync Error", error.message || "Cloud function call failed.");
      const studentRef = doc(firestore, `schools/${school.id}/students`, studentDocId);
      if (studentDocId && school.id) { 
        await updateDoc(studentRef, {
            schoolPaySyncedAt: serverTimestamp(),
            schoolPaySyncStatus: 'Failed',
            schoolPaySyncMessage: error.message || "Cloud function call failed.",
        }).catch(updateError => console.error("Failed to update student doc after sync error:", updateError));
      }
    } finally {
      setIsSyncingSchoolPay(false);
    }
  };


  const onSubmit = async (values: StudentFormValues) => {
    if (!user || !school || !userProfile) { // Ensure userProfile (admin's profile) is available
      toast({ variant: "destructive", title: "Error", description: "User, admin profile, or school context is missing." });
      return;
    }

    // Check for duplicate registration number
    const regNoExists = allStudents.some(
      s => s.studentRegistrationNumber.toLowerCase() === values.studentRegistrationNumber.toLowerCase() && s.id !== initialData?.id
    );
    if (regNoExists) {
      form.setError("studentRegistrationNumber", { message: "This registration number is already in use." });
      setIsSubmitting(false);
      return;
    }


    setIsSubmitting(true);
    setPhotoUploadProgress(null);

    let studentPhotoUrl = initialData?.photoUrl;

    try {
      if (values.photo) {
        setPhotoUploadProgress(0);
        if (initialData?.photoUrl) {
          try { await deleteObject(ref(storage, initialData.photoUrl)); }
          catch (e) { console.warn("Failed to delete old student photo", e); }
        }
        const photoFile = values.photo;
        const photoStorageRef = ref(storage, `schools/${school.id}/student_photos/${Date.now()}_${photoFile.name}`);
        const uploadTask = uploadBytesResumable(photoStorageRef, photoFile);
        studentPhotoUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => setPhotoUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            reject,
            async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
          );
        });
      } else if (photoPreview === null && initialData?.photoUrl) {
         try { await deleteObject(ref(storage, initialData.photoUrl)); }
         catch (e) { console.warn("Failed to delete old student photo", e); }
         studentPhotoUrl = undefined; 
      }

      const adminContext = { // Construct adminContext directly
        uid: userProfile.uid,
        displayName: userProfile.displayName,
        email: userProfile.email,
      };

      const studentData: Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'schoolPaySyncedAt' | 'schoolPaySyncStatus' | 'schoolPaySyncMessage' | 'feeBalance'> = {
        schoolId: school.id,
        firstName: values.firstName,
        middleName: values.middleName || null,
        lastName: values.lastName,
        gender: values.gender,
        dateOfBirth: typeof values.dateOfBirth === 'string' ? values.dateOfBirth : Timestamp.fromDate(values.dateOfBirth),
        classId: values.classId,
        studentRegistrationNumber: values.studentRegistrationNumber,
        guardianPhone: values.guardianPhone || null,
        photoUrl: studentPhotoUrl === undefined ? null : (studentPhotoUrl || null), 
        status: values.status,
        createdBy: user.uid,
      };

      let studentDocId = initialData?.id;
      let nextRegSuffixForSchoolUpdate: number | undefined = undefined;

      if (initialData && studentDocId) {
        await updateStudentInSchool(school.id, studentDocId, studentData);
      } else {
        let currentNextSuffixForNewStudent: number | undefined = undefined;
        if(values.studentRegistrationNumber === generateRegistrationNumber(school.registrationNumberConfig)){
            currentNextSuffixForNewStudent = school.registrationNumberConfig?.nextSuffix || 1;
        }

        const result = await addStudentToSchool(
            school.id, 
            studentData, 
            school, 
            schoolPhysicalRequirements,
            schoolFeeItems,
            adminContext, 
            currentNextSuffixForNewStudent
        );
        studentDocId = result.studentId;
        if(result.generatedRegistrationNumber && school.registrationNumberConfig?.nextSuffix !== null && school.registrationNumberConfig?.nextSuffix !== undefined){
            nextRegSuffixForSchoolUpdate = (school.registrationNumberConfig?.nextSuffix || 1) + 1;
        }
      }
      
      if(nextRegSuffixForSchoolUpdate && school.registrationNumberConfig){
          await updateSchoolData(school.id, {
              registrationNumberConfig: {
                  ...school.registrationNumberConfig,
                  nextSuffix: nextRegSuffixForSchoolUpdate
              }
          });
      }

      const successMessage = initialData ? "Student Updated" : "Student Added";
      showNotification(successMessage, `${values.firstName} ${values.lastName} has been saved successfully.`);


      const selectedClass = schoolClasses.find(c => c.id === values.classId);
      if (selectedClass && studentDocId && school.schoolPayConfig?.schoolCode && school.schoolPayConfig?.password) {
        const studentDataForApi = {
            schoolId: school.id,
            studentRegistrationNumber: values.studentRegistrationNumber,
            firstName: values.firstName,
            middleName: values.middleName || "",
            lastName: values.lastName,
            classCode: selectedClass.code || selectedClass.class, 
            guardianPhone: values.guardianPhone || "",
            gender: values.gender === 'Male' ? 'M' : values.gender === 'Female' ? 'F' : 'O' as 'M' | 'F' | 'O',
            dateOfBirth: format(values.dateOfBirth, 'yyyy-MM-dd'),
        };
        await callSyncStudentWithSchoolPay(studentDataForApi, studentDocId);
      } else if (!school.schoolPayConfig?.schoolCode || !school.schoolPayConfig?.password) {
        toast({variant: "default", title: "SchoolPay Sync Skipped", description: "SchoolPay School Code or Password not configured in school settings."})
      }


      onStudentSaved();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving student:", error);
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
      setPhotoUploadProgress(null);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!isSubmitting && !isSyncingSchoolPay) onOpenChange(open); }}>
      <DialogContent className="sm:max-w-2xl bg-card shadow-xl rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center">
            <UserPlus className="mr-3 h-6 w-6" />
            {initialData ? "Edit Student Details" : "Add New Student"}
          </DialogTitle>
          <DialogDescription>
            Fill in the student's information. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-1 max-h-[70vh] overflow-y-auto pr-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem><FormLabel>First Name*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="middleName" render={({ field }) => (
                <FormItem><FormLabel>Middle Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem><FormLabel>Last Name*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem><FormLabel>Gender*</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""} defaultValue={field.value || ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem> )}/>
              <Controller
                control={form.control}
                name="dateOfBirth"
                render={({ field, fieldState: { error } }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date of Birth*</FormLabel>
                    <Input
                      type="date"
                      value={field.value && isDateValid(field.value) ? format(field.value, 'yyyy-MM-dd') : ''}
                      onChange={(e) => {
                        const dateValue = e.target.value && isDateValid(parseISO(e.target.value))
                                          ? parseISO(e.target.value)
                                          : undefined;
                        field.onChange(dateValue);
                      }}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                      max={format(new Date(), 'yyyy-MM-dd')}
                      min="1900-01-01"
                      className={error ? 'border-destructive' : ''}
                    />
                    {error && <p className="text-sm text-destructive mt-1">{error.message}</p>}
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="classId" render={({ field }) => (
                <FormItem><FormLabel>Class*</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""} defaultValue={field.value || ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger></FormControl>
                    <SelectContent>
                        {schoolClasses && schoolClasses.length > 0 ? (
                        schoolClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.class} {c.code ? `(${c.code})` : ''}</SelectItem>)
                        ) : (
                        <SelectItem value="_NO_CLASSES_" disabled>No classes defined for this school</SelectItem>
                        )}
                    </SelectContent>
                    </Select><FormMessage />
                </FormItem> )}/>

                <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem><FormLabel>Status*</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""} defaultValue={field.value || ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                    <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                        <SelectItem value="Graduated">Graduated</SelectItem>
                        <SelectItem value="Withdrawn">Withdrawn</SelectItem>
                    </SelectContent>
                    </Select><FormMessage />
                </FormItem> )}/>
            </div>


            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="studentRegistrationNumber" render={({ field }) => (
                <FormItem><FormLabel>Student Registration No.*</FormLabel><FormControl><Input {...field} placeholder="School's unique ID for student" /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="guardianPhone" render={({ field }) => (
                <FormItem><FormLabel>Guardian's Phone</FormLabel><FormControl><Input type="tel" {...field} placeholder="+256 7XX XXX XXX" /></FormControl><FormMessage /></FormItem> )}/>
            </div>

            <div>
              <FormLabel className="text-base">Student Photo (Optional, Max ${MAX_PHOTO_SIZE_MB}MB)</FormLabel>
              <div className="mt-1 flex items-center gap-4">
                {photoPreview ? (
                  <div className="relative h-24 w-24 rounded-md overflow-hidden border">
                    <Image src={photoPreview} alt="Student photo preview" layout="fill" objectFit="cover" data-ai-hint="student photo"/>
                  </div>
                ) : (
                  <div className="h-24 w-24 rounded-md border bg-muted flex items-center justify-center">
                    <ImageUp className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-grow">
                  <FormField control={form.control} name="photo" render={() => (
                    <FormItem>
                      <FormControl><Input id="student-photo" type="file" accept={ALLOWED_PHOTO_TYPES.join(',')} onChange={handlePhotoChange} className="block w-full text-sm"/></FormControl>
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


            <DialogFooter className="pt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting || isSyncingSchoolPay}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || isSyncingSchoolPay || (photoUploadProgress !== null && photoUploadProgress < 100)} className="bg-primary hover:bg-primary/90">
                {isSubmitting || isSyncingSchoolPay ? <Loader2 className="animate-spin mr-2"/> : null}
                {isSubmitting ? (photoUploadProgress !== null ? `Uploading ${Math.round(photoUploadProgress)}%...` : "Saving...") : (isSyncingSchoolPay ? "Syncing..." : (initialData ? "Save Changes" : "Add Student"))}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
