
// src/app/school/dashboard/[schoolId]/settings/documents/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, updateSchoolData } from '@/services';
import type { School } from '@/types/school';
import { storage } from '@/config/firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { Loader2, Save, FileText, XCircle } from 'lucide-react';

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

interface FileUploadState { preview: string | null; progress: number | null; currentUrl?: string | null; fileName?: string | null; }
const initialFileUploadState: FileUploadState = { preview: null, progress: null, currentUrl: null, fileName: null };

const documentSettingsSchema = z.object({
  registrationCertificateFile: z.instanceof(File).optional().nullable()
    .refine(file => !file || file.size <= MAX_FILE_SIZE_BYTES, `Max file size ${MAX_FILE_SIZE_MB}MB.`)
    .refine(file => !file || ALLOWED_DOC_TYPES.includes(file.type), `File type not supported.`),
  unebCertificateFile: z.instanceof(File).optional().nullable()
    .refine(file => !file || file.size <= MAX_FILE_SIZE_BYTES, `Max file size ${MAX_FILE_SIZE_MB}MB.`)
    .refine(file => !file || ALLOWED_DOC_TYPES.includes(file.type), `File type not supported.`),
  headteacherAppointmentLetterFile: z.instanceof(File).optional().nullable()
    .refine(file => !file || file.size <= MAX_FILE_SIZE_BYTES, `Max file size ${MAX_FILE_SIZE_MB}MB.`)
    .refine(file => !file || ALLOWED_DOC_TYPES.includes(file.type), `File type not supported.`),
});

type DocumentSettingsFormValues = z.infer<typeof documentSettingsSchema>;

export default function DocumentSettingsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [regCertFileState, setRegCertFileState] = useState<FileUploadState>(initialFileUploadState);
  const [unebCertFileState, setUnebCertFileState] = useState<FileUploadState>(initialFileUploadState);
  const [headteacherFileState, setHeadteacherFileState] = useState<FileUploadState>(initialFileUploadState);

  const form = useForm<DocumentSettingsFormValues>({
    resolver: zodResolver(documentSettingsSchema),
    defaultValues: {
      registrationCertificateFile: null, unebCertificateFile: null, headteacherAppointmentLetterFile: null,
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, setFileState: React.Dispatch<React.SetStateAction<FileUploadState>>, fieldName: keyof DocumentSettingsFormValues) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE_BYTES || !ALLOWED_DOC_TYPES.includes(file.type)) {
        form.setError(fieldName, { message: `Invalid file (max ${MAX_FILE_SIZE_MB}MB, PDF/DOC/Image allowed).` }); return;
      }
      form.setValue(fieldName, file as any, { shouldValidate: true }); form.clearErrors(fieldName);
      setFileState(s => ({ ...s, preview: null, currentUrl: null, fileName: file.name }));
    }
  };
  const removeFile = (setFileState: React.Dispatch<React.SetStateAction<FileUploadState>>, fieldName: keyof DocumentSettingsFormValues, currentDbUrlField: keyof School) => {
    form.setValue(fieldName, null, { shouldValidate: true });
    setFileState(s => ({ ...s, preview: null, currentUrl: null, fileName: school?.[currentDbUrlField] ? s.fileName : null }));
    const fileInput = document.getElementById(fieldName as string) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };
  
  const FileUploadField: React.FC<{ name: keyof DocumentSettingsFormValues; label: string; fileState: FileUploadState; setFileState: React.Dispatch<React.SetStateAction<FileUploadState>>; currentDbUrlField: keyof School; description?: string;}> = 
    ({ name, label, fileState, setFileState, currentDbUrlField, description }) => (
    <FormField control={form.control} name={name} render={() => (
      <FormItem>
        <FormLabel>{label} (Max {MAX_FILE_SIZE_MB}MB)</FormLabel>
        {fileState.currentUrl && (
            <div className="my-2 p-2 border rounded-md bg-muted text-sm text-muted-foreground">
                <a href={fileState.currentUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                    <FileText className="h-4 w-4" /> {fileState.fileName || "View Current File"}
                </a>
            </div>
        )}
        <div className="flex items-center gap-2">
          <FormControl>
            <Input id={name} type="file" accept={ALLOWED_DOC_TYPES.join(',')}
              onChange={(e) => handleFileChange(e, setFileState, name)}
              className="flex-grow" disabled={isSubmitting}
            />
          </FormControl>
          {(fileState.fileName || fileState.currentUrl) && (
            <Button type="button" variant="ghost" size="sm" onClick={() => removeFile(setFileState, name, currentDbUrlField)} className="text-destructive" disabled={isSubmitting}>
              <XCircle className="h-4 w-4 mr-1"/>Remove
            </Button>
          )}
        </div>
        {fileState.fileName && !fileState.currentUrl && <p className="text-xs text-muted-foreground mt-1">New file selected: {fileState.fileName}</p>}
        {fileState.progress !== null && <Progress value={fileState.progress} className="w-full h-1.5 mt-2" />}
        {description && <FormDescription>{description}</FormDescription>}
        <FormMessage />
      </FormItem>
    )}/>
  );


  useEffect(() => {
    if (authLoading || !schoolId || !user) return;
    getSchoolById(schoolId)
      .then(fetchedSchool => {
        if (fetchedSchool) {
          if (!fetchedSchool.adminUids.includes(user.uid)) {
            toast({ variant: "destructive", title: "Access Denied" }); router.push('/school/auth'); return;
          }
          setSchool(fetchedSchool);
          form.reset({ registrationCertificateFile: null, unebCertificateFile: null, headteacherAppointmentLetterFile: null, });
          setRegCertFileState(s => ({...s, currentUrl: fetchedSchool.registrationCertificateUrl, fileName: fetchedSchool.registrationCertificateUrl ? 'Current Registration Certificate' : null}));
          setUnebCertFileState(s => ({...s, currentUrl: fetchedSchool.unebCertificateUrl, fileName: fetchedSchool.unebCertificateUrl ? 'Current UNEB Certificate' : null}));
          setHeadteacherFileState(s => ({...s, currentUrl: fetchedSchool.headteacherAppointmentLetterUrl, fileName: fetchedSchool.headteacherAppointmentLetterUrl ? 'Current Headteacher Letter' : null}));
        } else {
          toast({ variant: "destructive", title: "Not Found" }); router.push('/school/auth');
        }
      })
      .catch(err => toast({ variant: "destructive", title: "Error loading data" }))
      .finally(() => setIsLoading(false));
  }, [schoolId, user, authLoading, router, toast, form]);

  const processFileUpload = async (fileInput: File | null | undefined, currentFileState: FileUploadState, docTypeKey: string, setFileState: React.Dispatch<React.SetStateAction<FileUploadState>>, currentDbUrl: string | null | undefined): Promise<string | null | undefined> => {
    setFileState(s => ({...s, progress: null}));
    if (fileInput) {
      if (currentDbUrl) { try { await deleteObject(ref(storage, currentDbUrl)); } catch (e) { console.warn(`Old ${docTypeKey} file deletion failed:`, e); }}
      const path = `school_documents/${schoolId}/${docTypeKey}/${Date.now()}_${fileInput.name}`;
      const uploadTask = uploadBytesResumable(ref(storage, path), fileInput);
      const newUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on('state_changed', (s) => setFileState(st => ({...st, progress: (s.bytesTransferred/s.totalBytes)*100})), reject, async () => resolve(await getDownloadURL(uploadTask.snapshot.ref)));
      });
      setFileState(s => ({...s, currentUrl: newUrl, fileName: fileInput.name, preview: null}));
      return newUrl;
    } else if (currentFileState.currentUrl === null && currentDbUrl && !form.getValues(docTypeKey as keyof DocumentSettingsFormValues) ) { // If file was removed (currentUrl is null) and there was a dbUrl, delete it
      try { await deleteObject(ref(storage, currentDbUrl)); } catch (e) { console.warn(`Old ${docTypeKey} file deletion failed (on removal):`, e); }
      setFileState(initialFileUploadState);
      return null;
    }
    return undefined; // No change
  };

  const onSubmit = async (data: DocumentSettingsFormValues) => {
    if (!user || !school) return;
    setIsSubmitting(true);
    try {
      const [regCertUrl, unebCertUrl, headteacherUrl] = await Promise.all([
        processFileUpload(data.registrationCertificateFile, regCertFileState, 'registrationCertificate', setRegCertFileState, school.registrationCertificateUrl),
        processFileUpload(data.unebCertificateFile, unebCertFileState, 'unebCertificate', setUnebCertFileState, school.unebCertificateUrl),
        processFileUpload(data.headteacherAppointmentLetterFile, headteacherFileState, 'headteacherAppointmentLetter', setHeadteacherFileState, school.headteacherAppointmentLetterUrl),
      ]);

      const schoolDataToUpdate: Partial<School> = {};
      if (regCertUrl !== undefined) schoolDataToUpdate.registrationCertificateUrl = regCertUrl;
      if (unebCertUrl !== undefined) schoolDataToUpdate.unebCertificateUrl = unebCertUrl;
      if (headteacherUrl !== undefined) schoolDataToUpdate.headteacherAppointmentLetterUrl = headteacherUrl;
      
      if (Object.keys(schoolDataToUpdate).length > 0) {
        await updateSchoolData(schoolId, schoolDataToUpdate);
        toast({ title: "Document Settings Updated" });
        // Optionally re-fetch school data to update local state if needed
        // const updatedSchool = await getSchoolById(schoolId); if (updatedSchool) setSchool(updatedSchool);
      } else {
        toast({ title: "No Changes", description: "No new documents were uploaded or existing ones removed."});
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
      [setRegCertFileState, setUnebCertFileState, setHeadteacherFileState].forEach(setFn => setFn(s => ({...s, progress: null})));
    }
  };

  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  if (!school) return null;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center"><FileText className="mr-3 h-6 w-6 text-primary"/>Document Uploads</CardTitle>
        <CardDescription>Manage important school documents like registration certificates and UNEB accreditation.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FileUploadField name="registrationCertificateFile" label="Registration Certificate" fileState={regCertFileState} setFileState={setRegCertFileState} currentDbUrlField="registrationCertificateUrl" description="MoES Registration document."/>
            <FileUploadField name="unebCertificateFile" label="UNEB Certificate" fileState={unebCertFileState} setFileState={setUnebCertFileState} currentDbUrlField="unebCertificateUrl" description="UNEB Centre registration document (if applicable)."/>
            <FileUploadField name="headteacherAppointmentLetterFile" label="Headteacher Appointment Letter" fileState={headteacherFileState} setFileState={setHeadteacherFileState} currentDbUrlField="headteacherAppointmentLetterUrl" description="Optional: For verification purposes."/>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
              {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>}
              Save Document Settings
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
    