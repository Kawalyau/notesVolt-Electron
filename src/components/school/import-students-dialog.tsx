
// src/components/school/import-students-dialog.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileText, AlertTriangle, CheckCircle, Download, UploadCloud, Users } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Student, School, SchoolClass } from '@/types/school';
import { format as formatDateFns } from 'date-fns';
import { Alert, AlertTitle, AlertDescription as ShadCnAlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { storage, functions } from '@/config/firebase';
import { ref, uploadBytesResumable } from "firebase/storage";
import { httpsCallable } from 'firebase/functions';
import { Label } from '@/components/ui/label';

interface ImportStudentsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  school: School;
  schoolClasses: SchoolClass[];
  onImportCompleted: () => void;
}

export function ImportStudentsDialog({ isOpen, onOpenChange, school, schoolClasses, onImportCompleted }: ImportStudentsDialogProps) {
  const { user, userProfile } = useAuth(); // user is Firebase Auth user, userProfile is admin's Firestore profile
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false); // For server-side processing
  const [importResults, setImportResults] = useState<{ totalRows: number; successfulImports: number; failedImports: number; errors: any[] } | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setIsUploading(false);
      setUploadProgress(null);
      setIsImporting(false);
      setImportResults(null);
      setProcessingMessage(null);
      setIsGeneratingTemplate(false);
    }
  }, [isOpen]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
        'text/csv', 'application/csv', 'application/x-csv', 'text/x-csv', 
        'text/comma-separated-values', 'text/x-comma-separated-values'
      ];
      const allowedExtensions = ['.xlsx', '.csv'];
      const fileExtension = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();

      if (allowedMimeTypes.includes(selectedFile.type) || allowedExtensions.includes(fileExtension)) {
        setFile(selectedFile);
        setImportResults(null); // Reset previous results if a new file is selected
        setProcessingMessage(null);
      } else {
        toast({ variant: "destructive", title: "Invalid File Type", description: "Please upload an Excel (.xlsx) or CSV (.csv) file." });
        event.target.value = ''; // Clear the input
      }
    }
  };

  const handleUploadAndImport = async () => {
    if (!file || !user || !userProfile) {
      toast({ variant: "destructive", title: "Error", description: "File or user information is missing." });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setImportResults(null);
    setProcessingMessage("Uploading file to server...");

    const temporaryStoragePath = `temp_imports/students/${user.uid}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, temporaryStoragePath);

    try {
      const uploadTask = uploadBytesResumable(storageRef, file);
      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
          setProcessingMessage(`Uploading: ${Math.round(progress)}%`);
        },
        (error) => {
          console.error("Upload to Firebase Storage failed:", error);
          toast({ variant: "destructive", title: "Upload Failed", description: `Could not upload file: ${error.message}` });
          setIsUploading(false);
          setUploadProgress(null);
          setProcessingMessage("Upload failed.");
        },
        async () => { // Upload completed successfully
          setIsUploading(false);
          setUploadProgress(100);
          setProcessingMessage("File uploaded. Starting import on server...");
          setIsImporting(true); // Indicate server-side processing has started

          const importStudentsFunction = httpsCallable(functions, 'importStudentsFromFile');
          try {
            const result = await importStudentsFunction({
              schoolId: school.id,
              storageFilePath: temporaryStoragePath,
              adminUserId: userProfile.uid, // Pass admin UID
              adminUserName: userProfile.displayName, // Pass admin name
              adminEmail: userProfile.email, // Pass admin email
            });
            
            setImportResults(result.data as any);
            toast({ title: "Import Processed", description: (result.data as any).message || "Server finished processing." });
            setProcessingMessage(`Import Complete: ${(result.data as any).successfulImports} successful, ${(result.data as any).failedImports} failed.`);
            if ((result.data as any).successfulImports > 0 && onImportCompleted) {
              onImportCompleted();
            }
          } catch (error: any) {
            console.error("Cloud Function 'importStudentsFromFile' error:", error);
            let description = "Failed to process import on the server.";
            if (error.message) description += ` Error: ${error.message}`;
            if (error.details) description += ` Details: ${JSON.stringify(error.details)}`;
            
            setImportResults({ totalRows: 0, successfulImports: 0, failedImports: 0, errors: [{rowIndex:0, identifier: "Cloud Function Call", messages:[description]}] });
            toast({ variant: "destructive", title: "Import Error", description: description, duration: 10000 });
            setProcessingMessage("Import failed on server.");
          } finally {
            setIsImporting(false);
            // File deletion is handled by the Cloud Function
          }
        }
      );
    } catch (error:any) {
      console.error("Error during upload initiation or function call setup:", error);
      toast({ variant: "destructive", title: "Processing Error", description: error.message || "An unexpected error occurred." });
      setIsUploading(false);
      setIsImporting(false);
      setUploadProgress(null);
      setProcessingMessage("An error occurred.");
    }
  };
  
  const handleDownloadSample = () => {
    setIsGeneratingTemplate(true);
    setProcessingMessage("Generating sample template...");
    try {
        const headers = ["FirstName", "LastName", "MiddleName", "Gender", "DateOfBirth (YYYY-MM-DD)", "ClassName or ClassCode", "StudentRegistrationNumber (Optional)", "GuardianPhone", "Status (Optional, defaults Active)"];
        const exampleData = [
        { FirstName: "John", LastName: "Doe", MiddleName: "", Gender: "Male", "DateOfBirth (YYYY-MM-DD)": "2005-08-15", "ClassName or ClassCode": schoolClasses.length > 0 ? (schoolClasses[0].code || schoolClasses[0].class) : "P1", "StudentRegistrationNumber (Optional)": "P7R001", GuardianPhone: "0777123456", "Status (Optional, defaults Active)": "Active"},
        { FirstName: "Jane", LastName: "Smith", MiddleName: "Anne", Gender: "Female", "DateOfBirth (YYYY-MM-DD)": "2006-03-22", "ClassName or ClassCode": schoolClasses.length > 1 ? (schoolClasses[1].code || schoolClasses[1].class) : (schoolClasses.length > 0 ? schoolClasses[0].code || schoolClasses[0].class : "P2" ), "StudentRegistrationNumber (Optional)": "", GuardianPhone: "0788123456", "Status (Optional, defaults Active)": ""},
        ];
        const wsStudents = XLSX.utils.json_to_sheet(exampleData, { header: headers, skipHeader: false });
        const validClassesSheetData = schoolClasses.map(c => ({ ClassName: c.class, Code: c.code || '' }));
        const wsClasses = XLSX.utils.json_to_sheet(validClassesSheetData.length > 0 ? validClassesSheetData : [{ClassName: "No classes defined in school settings", Code: ""}]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsStudents, "Students_To_Import");
        XLSX.utils.book_append_sheet(wb, wsClasses, "Valid_ClassNames_And_Codes");
        XLSX.writeFile(wb, "student_import_template_with_classes.xlsx");
        toast({ title: "Template Downloaded" });
        setProcessingMessage("Sample template downloaded.");
    } catch (error) {
      toast({ variant: "destructive", title: "Template Error", description: "Could not generate sample template." });
      setProcessingMessage("Error generating template.");
    } finally {
      setIsGeneratingTemplate(false);
      setTimeout(() => setProcessingMessage(null), 2000);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!isUploading && !isImporting) onOpenChange(open); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center"><Users className="mr-3 h-6 w-6"/> Import Students</DialogTitle>
          <DialogDescription>Upload Excel (.xlsx) or CSV (.csv). Format RegNo & Phone as Text in Excel.</DialogDescription>
        </DialogHeader>
        
        <div className="flex-grow space-y-4 overflow-y-auto p-1 pr-2">
          <Alert variant="default" className="bg-blue-50 border-blue-200 text-blue-700">
            <AlertTriangle className="h-4 w-4 !text-blue-600" />
            <AlertTitle className="font-semibold">Important: Format as Text</AlertTitle>
            <ShadCnAlertDescription className="text-xs">
              For columns like 'StudentRegistrationNumber' or 'GuardianPhone', ensure they are formatted as "Text" in your Excel/CSV file before uploading to prevent issues with long numbers.
            </ShadCnAlertDescription>
          </Alert>

          <div className="p-3 border rounded-md bg-muted/50 space-y-2">
            <h4 className="font-semibold text-sm flex items-center"><FileText className="mr-1 h-4 w-4"/>Step 1: Prepare File</h4>
            <Button onClick={handleDownloadSample} disabled={isGeneratingTemplate || schoolClasses.length === 0} variant="outline" size="sm">
              {isGeneratingTemplate ? <Loader2 className="animate-spin mr-1 h-3 w-3"/> : <Download className="mr-1 h-3 w-3"/>}
              {schoolClasses.length === 0 ? "Define Classes First" : "Download Sample Template"}
            </Button>
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                <li>Required: FirstName, LastName, Gender, DateOfBirth, ClassName or ClassCode.</li>
                <li>Optional: MiddleName, StudentRegistrationNumber (auto-generated if blank & school config exists), GuardianPhone, Status (Active, Inactive, etc. Defaults Active).</li>
                <li>Date format: YYYY-MM-DD or other common formats.</li>
            </ul>
          </div>

          <div className="p-3 border rounded-md bg-muted/50 space-y-2">
            <h4 className="font-semibold text-sm flex items-center"><UploadCloud className="mr-1 h-4 w-4"/>Step 2: Upload & Initiate Import</h4>
            <Input id="student-import-file" type="file" accept=".xlsx, .csv, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} disabled={isUploading || isImporting} className="text-sm"/>
            {file && <p className="text-xs text-muted-foreground mt-1">Selected: {file.name}</p>}
            {isUploading && uploadProgress !== null && (
              <div className="mt-2">
                <Progress value={uploadProgress} className="w-full h-2"/>
                <p className="text-xs text-center mt-1">Uploading: {Math.round(uploadProgress)}%</p>
              </div>
            )}
          </div>
          
          {processingMessage && (
            <div className="text-sm text-primary py-1 px-2 bg-primary/10 rounded-md text-center">
              {processingMessage}
            </div>
          )}

          {isImporting && !importResults && (
            <div className="flex items-center justify-center p-4 my-2 text-primary">
              <Loader2 className="animate-spin mr-2 h-5 w-5"/>
              <span>Processing import on server, please wait... This may take a few minutes for large files.</span>
            </div>
          )}

          {importResults && (
            <div className="mt-4 p-4 border rounded-md bg-card shadow">
              <h3 className="font-semibold text-lg mb-2">Import Results:</h3>
              <p className="text-sm">Total Rows Processed: {importResults.totalRows}</p>
              <p className="text-sm text-green-600">Successfully Imported: {importResults.successfulImports}</p>
              <p className="text-sm text-destructive">Failed Imports: {importResults.failedImports}</p>
              {importResults.errors && importResults.errors.length > 0 && (
                <div className="mt-3">
                  <h4 className="font-medium text-destructive mb-1">Error Details:</h4>
                  <ScrollArea className="h-32 border rounded-md p-2 bg-destructive/5">
                    <ul className="list-disc pl-5 space-y-1">
                      {importResults.errors.map((err: any, index: number) => (
                        <li key={index} className="text-xs">
                          Row {err.rowIndex}: {err.identifier ? `(ID: ${err.identifier}) ` : ''}
                          {err.messages.join(', ')}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading || isImporting}>Cancel</Button>
          <Button 
            type="button" 
            onClick={handleUploadAndImport} 
            disabled={!file || isUploading || isImporting}
            className="bg-primary hover:bg-primary/90"
          >
            {(isUploading || isImporting) ? <Loader2 className="animate-spin mr-2"/> : <UploadCloud className="mr-2 h-5 w-5"/>}
            {isUploading ? "Uploading..." : (isImporting ? "Importing..." : "Upload & Start Import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
