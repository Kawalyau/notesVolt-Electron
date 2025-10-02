
// src/components/school/import-fee-transactions-dialog.tsx
"use client";

import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, FileText, UploadCloud, AlertTriangle, CheckCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Student, SchoolClass, FeeItem, SchoolAcademicYear, SchoolTerm } from '@/types/school';
import { getSchoolSubcollectionItems } from '@/services/schoolService';
import { format as formatDateFns } from 'date-fns';
import { Alert, AlertTitle, AlertDescription as ShadCnAlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { storage, functions } from '@/config/firebase';
import { ref, uploadBytesResumable } from "firebase/storage";
import { httpsCallable } from 'firebase/functions';

interface ImportFeeTransactionsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  schoolId: string;
  schoolClasses: SchoolClass[]; 
  onImportCompleted?: () => void;
}

export function ImportFeeTransactionsDialog({
    isOpen,
    onOpenChange,
    schoolId,
    schoolClasses, 
    onImportCompleted
}: ImportFeeTransactionsDialogProps) {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [fileToImport, setFileToImport] = useState<File | null>(null);
  const [isLoadingReferenceData, setIsLoadingReferenceData] = useState(false);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ totalRows: number; successfulImports: number; failedImports: number; errors: any[] } | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);

  const [studentsList, setStudentsList] = useState<Student[]>([]);
  const [feeItemsList, setFeeItemsList] = useState<FeeItem[]>([]);
  const [academicYearsList, setAcademicYearsList] = useState<SchoolAcademicYear[]>([]);
  const [schoolTermsList, setSchoolTermsList] = useState<SchoolTerm[]>([]);

  const fetchReferenceData = useCallback(async () => {
    if (!schoolId) return;
    setIsLoadingReferenceData(true);
    setProcessingMessage("Loading school reference data...");
    try {
      const [students, feeItems, academicYears, terms] = await Promise.all([
        getSchoolSubcollectionItems<Student>(schoolId, 'students'),
        getSchoolSubcollectionItems<FeeItem>(schoolId, 'feeItems'),
        getSchoolSubcollectionItems<SchoolAcademicYear>(schoolId, 'schoolAcademicYears'),
        getSchoolSubcollectionItems<SchoolTerm>(schoolId, 'schoolTerms'),
      ]);
      setStudentsList(students);
      setFeeItemsList(feeItems);
      const sortedAcademicYears = academicYears.sort((a,b) => (b.year || "").localeCompare(a.year || ""));
      setAcademicYearsList(sortedAcademicYears);
      setSchoolTermsList(terms.map(t => ({...t, academicYearName: sortedAcademicYears.find(ay => ay.id === t.academicYearId)?.year || t.academicYearId })));
      setProcessingMessage("Reference data loaded.");
    } catch (error) {
      console.error("Error fetching reference data for template:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load reference data for sample template." });
      setProcessingMessage("Error loading reference data.");
    } finally {
      setIsLoadingReferenceData(false);
       setTimeout(() => setProcessingMessage(null), 2000);
    }
  }, [schoolId, toast]);

  useEffect(() => {
    if (isOpen) {
      fetchReferenceData();
      setFileToImport(null);
      setIsUploading(false);
      setUploadProgress(null);
      setIsImporting(false);
      setImportResults(null);
      setProcessingMessage(null);
      setIsGeneratingTemplate(false);
    }
  }, [isOpen, fetchReferenceData]);

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
        setFileToImport(selectedFile);
        setImportResults(null);
        setProcessingMessage(null);
      } else {
        toast({ variant: "destructive", title: "Invalid File Type", description: "Please upload an Excel (.xlsx) or CSV (.csv) file." });
        event.target.value = ''; 
      }
    }
  };

  const getClassNameForDialog = (classId: string) => {
    const foundClass = schoolClasses.find(c => c.id === classId);
    return foundClass ? (foundClass.code ? `${foundClass.class} (${foundClass.code})` : foundClass.class) : 'N/A';
  };

  const handleDownloadSample = () => {
    setIsGeneratingTemplate(true);
    setProcessingMessage("Generating sample template...");
    try {
      const wb = XLSX.utils.book_new();
      const transactionsHeaders = [
        "StudentRegistrationNumber", "FirstName(Optional)", "LastName(Optional)",
        "TransactionDate(Optional-YYYY-MM-DD,defaultstoJan1stofcurrentyear)",
        "TransactionType(debit/credit)",
        "Amount", "Description", "FeeItemName(Optional-mustmatchexisting)",
        "PaymentMethod(Optional-forcredits)", "Reference(Optional-forcredits)",
        "AcademicYear(Optional-e.g.,2024)", "Term(Optional-e.g.,Term1)"
      ];
      const exampleTransaction = [{
        StudentRegistrationNumber: studentsList.length > 0 ? studentsList[0].studentRegistrationNumber : "S1001",
        "FirstName(Optional)": studentsList.length > 0 ? studentsList[0].firstName : "John",
        "LastName(Optional)": studentsList.length > 0 ? studentsList[0].lastName : "Doe",
        "TransactionDate(Optional-YYYY-MM-DD,defaultstoJan1stofcurrentyear)": formatDateFns(new Date(), 'yyyy-MM-dd'),
        "TransactionType(debit/credit)": "credit", // Example credit
        Amount: 50000,
        Description: "Part payment for Term 1 Tuition",
        "FeeItemName(Optional-mustmatchexisting)": feeItemsList.length > 0 ? feeItemsList[0].name : "Sample Tuition Fee",
        "PaymentMethod(Optional-forcredits)": "Cash",
        "Reference(Optional-forcredits)": "Receipt #123",
        "AcademicYear(Optional-e.g.,2024)": academicYearsList.find(ay => ay.year === String(new Date().getFullYear()))?.year || (academicYearsList[0]?.year || String(new Date().getFullYear())),
        "Term(Optional-e.g.,Term1)": schoolTermsList.length > 0 ? schoolTermsList[0].name : "Term 1",
      }];
      const wsTransactions = XLSX.utils.json_to_sheet(exampleTransaction, { header: transactionsHeaders, skipHeader: false });
      XLSX.utils.book_append_sheet(wb, wsTransactions, "Transactions_To_Import");

      const studentsDataForSheet = studentsList.map(s => ({ StudentRegistrationNumber: s.studentRegistrationNumber, FullName: `${s.firstName} ${s.lastName}`, ClassName: getClassNameForDialog(s.classId) }));
      const wsStudents = XLSX.utils.json_to_sheet(studentsDataForSheet.length > 0 ? studentsDataForSheet : [{ StudentRegistrationNumber: "No Students Found in School Settings" }]);
      XLSX.utils.book_append_sheet(wb, wsStudents, "Valid_Students_Reference");

      const feeItemsDataForSheet = feeItemsList.map(fi => ({ FeeItemName: fi.name, FeeItemID: fi.id, AssociatedYear: academicYearsList.find(ay => ay.id === fi.academicYearId)?.year || "N/A", AssociatedTerm: fi.term || "N/A" }));
      const wsFeeItems = XLSX.utils.json_to_sheet(feeItemsDataForSheet.length > 0 ? feeItemsDataForSheet : [{ FeeItemName: "No Fee Items Defined in School Settings" }]);
      XLSX.utils.book_append_sheet(wb, wsFeeItems, "Valid_FeeItems_Reference");

      const academicYearsDataForSheet = academicYearsList.map(ay => ({ Year: ay.year, YearID: ay.id }));
      const wsAcademicYears = XLSX.utils.json_to_sheet(academicYearsDataForSheet.length > 0 ? academicYearsDataForSheet : [{ Year: "No Academic Years Defined" }]);
      XLSX.utils.book_append_sheet(wb, wsAcademicYears, "Valid_AcademicYears_Ref");

      const termsDataForSheet = schoolTermsList.map(st => ({ TermName: st.name, AssociatedAcademicYear: st.academicYearName || st.academicYearId, TermID: st.id }));
      const wsTerms = XLSX.utils.json_to_sheet(termsDataForSheet.length > 0 ? termsDataForSheet : [{ TermName: "No Terms Defined" }]);
      XLSX.utils.book_append_sheet(wb, wsTerms, "Valid_Terms_Reference");

      XLSX.writeFile(wb, "Fee_Transactions_Import_Template_With_Data.xlsx");
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

   const handleUploadAndImportTransactions = async () => {
    if (!fileToImport || !userProfile) {
      toast({ variant: "destructive", title: "Error", description: "File or admin information is missing." });
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);
    setImportResults(null);
    setProcessingMessage("Uploading transaction file...");

    const temporaryStoragePath = `temp_imports/transactions/${userProfile.uid}/${Date.now()}_${fileToImport.name}`;
    const storageRef = ref(storage, temporaryStoragePath);

    try {
      const uploadTask = uploadBytesResumable(storageRef, fileToImport);
      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
          setProcessingMessage(`Uploading: ${Math.round(progress)}%`);
        },
        (error) => {
          console.error("Upload to Firebase Storage failed (transactions):", error);
          toast({ variant: "destructive", title: "Upload Failed", description: `Could not upload file: ${error.message}` });
          setIsUploading(false);
          setUploadProgress(null);
          setProcessingMessage("Upload failed.");
        },
        async () => {
          setIsUploading(false);
          setUploadProgress(100);
          setProcessingMessage("File uploaded. Starting transaction import on server...");
          setIsImporting(true);

          const importTransactionsFunction = httpsCallable(functions, 'importFeeTransactionsFromFile');
          try {
            const result = await importTransactionsFunction({
              schoolId: schoolId,
              storageFilePath: temporaryStoragePath,
              adminUserId: userProfile.uid,
              adminUserName: userProfile.displayName || userProfile.email,
              adminEmail: userProfile.email,
            });
            setImportResults(result.data as any);
            toast({ title: "Transaction Import Processed", description: (result.data as any).message || "Server finished processing transactions." });
            setProcessingMessage(`Import Complete: ${(result.data as any).successfulImports} successful, ${(result.data as any).failedImports} failed.`);

            if ((result.data as any).successfulImports > 0 && onImportCompleted) {
              onImportCompleted();
            }
          } catch (error: any) {
            console.error("Cloud Function 'importFeeTransactionsFromFile' error:", error);
            let description = "Failed to process transaction import on the server.";
            if (error.message) description += ` Error: ${error.message}`;
            if (error.details) description += ` Details: ${JSON.stringify(error.details)}`;
            
            setImportResults({ totalRows: 0, successfulImports: 0, failedImports: 0, errors: [{rowIndex:0, identifier: "Cloud Function Call", messages:[description]}] });
            toast({ variant: "destructive", title: "Transaction Import Error", description: description, duration: 10000 });
            setProcessingMessage("Import failed on server.");
          } finally {
            setIsImporting(false);
            // File deletion is handled by the Cloud Function
          }
        }
      );
    } catch (error:any) {
      console.error("Error during transaction upload initiation:", error);
      toast({ variant: "destructive", title: "Processing Error", description: error.message || "An unexpected error occurred." });
      setIsUploading(false);
      setIsImporting(false);
      setUploadProgress(null);
      setProcessingMessage("An error occurred.");
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!isUploading && !isImporting && !isGeneratingTemplate) onOpenChange(open); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center"><Download className="mr-3 h-6 w-6"/> Import Student Fee Transactions</DialogTitle>
          <DialogDescription>Upload Excel/CSV. Identify students by RegNo or FirstName &amp; LastName. Format long numbers as Text in Excel.</DialogDescription>
        </DialogHeader>
        
        <div className="flex-grow space-y-4 overflow-y-auto p-1 pr-2">
           <Alert variant="default" className="bg-blue-50 border-blue-200 text-blue-700">
              <AlertTriangle className="h-4 w-4 !text-blue-600" />
              <AlertTitle className="font-semibold">Important: Format as Text</AlertTitle>
              <ShadCnAlertDescription className="text-xs">
                For columns like 'StudentRegistrationNumber' or 'Reference', ensure they are formatted as "Text" in your Excel/CSV file before uploading.
              </ShadCnAlertDescription>
            </Alert>

            <div className="p-3 border rounded-md bg-muted/50 space-y-2">
                <h4 className="font-semibold text-sm flex items-center"><FileText className="mr-1 h-4 w-4"/>Step 1: Prepare File</h4>
                <Button onClick={handleDownloadSample} disabled={isLoadingReferenceData || isGeneratingTemplate} variant="outline" size="sm">
                {isLoadingReferenceData ? <Loader2 className="animate-spin mr-1 h-3 w-3"/> : <Download className="mr-1 h-3 w-3"/>}
                {isLoadingReferenceData ? "Loading Refs..." : (isGeneratingTemplate ? "Generating..." : "Sample Template (with School Data)")}
                </Button>
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                <li>Required: Student Identifier (RegNo or Name), TransactionType (debit/credit), Amount, Description.</li>
                <li>Optional: TransactionDate, FeeItemName, PaymentMethod, Reference, AcademicYear, Term.</li>
                </ul>
            </div>

            <div className="p-3 border rounded-md bg-muted/50 space-y-2">
                <h4 className="font-semibold text-sm flex items-center"><UploadCloud className="mr-1 h-4 w-4"/>Step 2: Upload & Initiate Import</h4>
                <Input id="transaction-import-file" type="file" accept=".xlsx, .csv, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} disabled={isUploading || isImporting} className="text-sm"/>
                {fileToImport && <p className="text-xs text-muted-foreground mt-1">Selected: {fileToImport.name}</p>}
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
                <span>Processing transaction import on server... This may take some time.</span>
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
                            Row {err.rowIndex}: {err.identifier ? `(For: ${err.identifier}) ` : ''}
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading || isImporting || isGeneratingTemplate}>Cancel</Button>
          <Button 
            type="button" 
            onClick={handleUploadAndImportTransactions} 
            disabled={!fileToImport || isUploading || isImporting}
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
