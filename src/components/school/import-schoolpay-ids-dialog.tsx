// src/components/school/import-schoolpay-ids-dialog.tsx
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, FileText, UploadCloud, AlertTriangle, CheckCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Student, SchoolClass } from '@/types/school';
import { writeBatch, doc } from 'firebase/firestore';
import { firestore } from '@/config/firebase';
import { Label } from '@/components/ui/label';

interface ImportSchoolPayIdsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  schoolId: string;
  allStudents: Student[]; // Pass all students for matching
  schoolClasses: SchoolClass[]; // Pass for getClassName if needed in reference sheet
  onImportCompleted?: () => void;
}

interface ParsedSchoolPayIdRow {
  rowIndex: number;
  firstNameFromFile?: string;
  lastNameFromFile?: string;
  paymentCodeFromFile?: string; // This is the SchoolPay Student ID to be imported
  studentMatches?: Student[]; // Can now be multiple matches
  errors?: string[];
  importStatus?: 'pending' | 'success' | 'failed' | 'skipped' | 'partial_success';
  importMessage?: string;
}

const normalizeHeaderForSchoolPayIds = (header: string) => header?.trim().toLowerCase().replace(/\s+/g, '') || '';

export function ImportSchoolPayIdsDialog({
  isOpen,
  onOpenChange,
  schoolId,
  allStudents,
  schoolClasses,
  onImportCompleted
}: ImportSchoolPayIdsDialogProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedSchoolPayIdRow[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [sortOrder, setSortOrder] = useState<'default' | 'validFirst' | 'invalidFirst'>('default');
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setParsedData([]);
      setIsProcessingFile(false);
      setIsImporting(false);
      setSortOrder('default');
      setIsGeneratingTemplate(false);
    }
  }, [isOpen]);
  
  const getClassName = (classId?: string): string => {
    if (!classId) return 'N/A';
    if (!schoolClasses || schoolClasses.length === 0) {
      return 'N/A';
    }
    const foundClass = schoolClasses.find(c => c.id === classId);
    return foundClass ? (foundClass.code ? `${foundClass.class} (${foundClass.code})` : foundClass.class) : 'Unknown Class';
  };


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
        setParsedData([]);
      } else {
        toast({ variant: "destructive", title: "Invalid File Type", description: "Please upload an Excel (.xlsx) or CSV (.csv) file." });
        event.target.value = '';
      }
    }
  };

  const handleDownloadSample = () => {
     if (!allStudents || allStudents.length === 0 || !schoolClasses || schoolClasses.length === 0) {
        toast({
            variant: "destructive",
            title: "Data Not Ready",
            description: "Student or class data is not available to generate the template. Please ensure students and classes are defined."
        });
        return;
    }
    setIsGeneratingTemplate(true);
    try {
        const wb = XLSX.utils.book_new();
        
        const mainSheetHeaders = ["First Name", "Last Name", "Payment Code (SchoolPay ID)"];
        const exampleStudent1 = allStudents.length > 0 ? allStudents.find(s => !s.schoolPayStudentId) || allStudents[0] : null;
        const exampleStudent2 = allStudents.length > 1 ? allStudents.find(s => s.id !== exampleStudent1?.id && !s.schoolPayStudentId) || allStudents[1] : null;

        const exampleData = [
          { 
            "First Name": exampleStudent1?.firstName || "John", 
            "Last Name": exampleStudent1?.lastName || "Doe",
            "Payment Code (SchoolPay ID)": "EXAMPLE_SPID123", 
          },
          { 
            "First Name": exampleStudent2?.firstName || "Jane", 
            "Last Name": exampleStudent2?.lastName || "Smith",
            "Payment Code (SchoolPay ID)": "EXAMPLE_SPID456", 
          },
        ];

        const wsMain = XLSX.utils.aoa_to_sheet([
            ["Import SchoolPay Student IDs (Match by First & Last Name)"],
            mainSheetHeaders,
            ...exampleData.map(row => mainSheetHeaders.map(header => row[header as keyof typeof row]))
        ]);
        if (!wsMain['!merges']) wsMain['!merges'] = [];
        wsMain['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: mainSheetHeaders.length - 1 } });
        XLSX.utils.book_append_sheet(wb, wsMain, "SchoolPay_IDs_To_Import");

        const studentRefData = allStudents.map(s => ({
          "First Name": s.firstName,
          "Last Name": s.lastName,
          "System RegistrationNumber": s.studentRegistrationNumber,
          "Class": getClassName(s.classId),
          "Current SchoolPay ID (System)": s.schoolPayStudentId || "Not Set"
        }));
        const wsStudentsRef = XLSX.utils.json_to_sheet(studentRefData.length > 0 ? studentRefData : [{ "Message": "No students found in system." }]);
        XLSX.utils.book_append_sheet(wb, wsStudentsRef, "Valid_Students_Reference");
        
        XLSX.writeFile(wb, "schoolpay_ids_import_by_name_template.xlsx");
        toast({ title: "Template Downloaded", description: "Sample template for SchoolPay IDs (match by name) has been downloaded." });
    } catch (error) {
        console.error("Error generating sample template:", error);
        toast({ variant: "destructive", title: "Template Error", description: "Could not generate sample template."})
    } finally {
        setIsGeneratingTemplate(false);
    }
  };


  const processFile = async () => {
    if (!file) return;
    setIsProcessingFile(true);
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        if (!data) { setIsProcessingFile(false); toast({ variant: "destructive", title: "Error", description: "Could not read file data." }); return; }

        const workbook = XLSX.read(data, { type: 'binary', cellText: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, blankrows: false });


        if (jsonData.length < 3) { 
          setParsedData([]); 
          toast({ variant: "default", title: "Empty or Invalid File", description: "File must have a title row, header row, and at least one data row." }); 
          setIsProcessingFile(false); return; 
        }

        const rawHeaders = jsonData[1] as string[]; 
        const headers = rawHeaders.map(normalizeHeaderForSchoolPayIds);
        const rowsToValidate: ParsedSchoolPayIdRow[] = [];

        const getColumnIndex = (possibleNames: string[]): number => {
          for (const name of possibleNames) {
            const normalizedName = normalizeHeaderForSchoolPayIds(name);
            const index = headers.indexOf(normalizedName);
            if (index !== -1) return index;
          }
          return -1;
        };
        
        const firstNameCol = getColumnIndex(["firstname", "first name"]);
        const lastNameCol = getColumnIndex(["lastname", "last name"]);
        const paymentCodeCol = getColumnIndex(["paymentcode", "payment code", "schoolpaystudentid", "schoolpayid"]); // This is the SchoolPay ID

        for (let i = 2; i < jsonData.length; i++) { 
          const row = jsonData[i] as any[];
          if (row.every(cell => cell === undefined || String(cell).trim() === "")) continue;

          const parsedRow: ParsedSchoolPayIdRow = { rowIndex: i, importStatus: 'pending', studentMatches: [] };
          const errors: string[] = [];

          const getCellVal = (colIndex: number) => (colIndex !== -1 && row[colIndex] !== undefined && row[colIndex] !== null) ? String(row[colIndex]).trim() : undefined;

          parsedRow.firstNameFromFile = getCellVal(firstNameCol);
          parsedRow.lastNameFromFile = getCellVal(lastNameCol);
          parsedRow.paymentCodeFromFile = getCellVal(paymentCodeCol);

          if (!parsedRow.firstNameFromFile || !parsedRow.lastNameFromFile) {
            errors.push("First Name and Last Name from file are required for matching.");
          } else {
            const nameMatches = allStudents.filter(s => 
              s.firstName.toLowerCase() === parsedRow.firstNameFromFile!.toLowerCase() &&
              s.lastName.toLowerCase() === parsedRow.lastNameFromFile!.toLowerCase()
            );
            if (nameMatches.length > 0) {
              parsedRow.studentMatches = nameMatches;
            } else {
              errors.push(`No student found matching name "${parsedRow.firstNameFromFile} ${parsedRow.lastNameFromFile}" in the system.`);
            }
          }
          
          if (!parsedRow.paymentCodeFromFile) {
            errors.push("Payment Code (SchoolPay Student ID) from the file is required.");
          }

          if (parsedRow.studentMatches && parsedRow.studentMatches.length > 0 && parsedRow.paymentCodeFromFile) {
            const studentsWhoNeedUpdate = parsedRow.studentMatches.filter(sm => !sm.schoolPayStudentId);
            if (studentsWhoNeedUpdate.length === 0) {
               parsedRow.importStatus = 'skipped';
               parsedRow.importMessage = 'All matched students already have a SchoolPay ID or this exact ID.';
            }
          }
          
          parsedRow.errors = errors;
          rowsToValidate.push(parsedRow);
        }
        setParsedData(rowsToValidate);
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      console.error("Error processing SchoolPay ID file:", error);
      toast({ variant: "destructive", title: "File Processing Error" });
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleImportValidIds = async () => {
    const validRowsToImport = parsedData.filter(row => row.errors?.length === 0 && row.importStatus === 'pending' && row.studentMatches && row.studentMatches.length > 0 && row.paymentCodeFromFile);
    
    if (validRowsToImport.length === 0) {
      toast({ title: "No New IDs to Import", description: "No valid rows found for import, or all matched students already have IDs." });
      return;
    }
    setIsImporting(true);
    let successCount = 0;
    let updatedStudentCount = 0;
    let failCount = 0;
    const updatedParsedData = [...parsedData];

    const batchSize = 400; 
    const allStudentUpdates: Array<{ studentId: string, paymentCode: string }> = [];

    validRowsToImport.forEach(pData => {
        pData.studentMatches!.forEach(studentInMatch => {
            if (!studentInMatch.schoolPayStudentId && pData.paymentCodeFromFile) { // Only update if student doesn't have an ID
                allStudentUpdates.push({ studentId: studentInMatch.id, paymentCode: pData.paymentCodeFromFile });
            }
        });
    });
    
    if (allStudentUpdates.length === 0) {
        toast({ title: "No Updates Needed", description: "All matched students in valid rows already have a SchoolPay ID."});
        validRowsToImport.forEach(pData => {
            const idx = updatedParsedData.findIndex(item => item.rowIndex === pData.rowIndex);
            if (idx !== -1) {
                updatedParsedData[idx] = { ...updatedParsedData[idx], importStatus: 'skipped', importMessage: 'All matched students already have ID.' };
            }
        });
        setParsedData([...updatedParsedData]);
        setIsImporting(false);
        return;
    }


    for (let i = 0; i < allStudentUpdates.length; i += batchSize) {
        const currentBatch = writeBatch(firestore);
        const currentChunkOfUpdates = allStudentUpdates.slice(i, i + batchSize);

        currentChunkOfUpdates.forEach(update => {
            const studentRef = doc(firestore, `schools/${schoolId}/students`, update.studentId);
            currentBatch.update(studentRef, { schoolPayStudentId: update.paymentCode });
        });

        try {
            await currentBatch.commit();
            updatedStudentCount += currentChunkOfUpdates.length;
            // Mark corresponding rows as success
             currentChunkOfUpdates.forEach(update => {
                validRowsToImport.forEach(pData => {
                    if (pData.studentMatches!.some(sm => sm.id === update.studentId)) {
                        const idx = updatedParsedData.findIndex(item => item.rowIndex === pData.rowIndex);
                        if (idx !== -1 && updatedParsedData[idx].importStatus === 'pending') {
                           updatedParsedData[idx] = { ...updatedParsedData[idx], importStatus: 'success', importMessage: 'SchoolPay ID Imported.' };
                           // If a row successfully updated at least one student, count the row as success.
                           if (!validRowsToImport.find(vr => vr.rowIndex === pData.rowIndex)?.importStatus || validRowsToImport.find(vr => vr.rowIndex === pData.rowIndex)?.importStatus === 'pending') {
                               successCount++;
                           }
                        }
                    }
                });
            });
        } catch (error: any) {
            failCount += currentChunkOfUpdates.length; // Or count by row
            console.error("Error importing SchoolPay IDs batch:", error);
            // Mark corresponding rows as failed
             currentChunkOfUpdates.forEach(update => {
                validRowsToImport.forEach(pData => {
                    if (pData.studentMatches!.some(sm => sm.id === update.studentId)) {
                         const idx = updatedParsedData.findIndex(item => item.rowIndex === pData.rowIndex);
                         if (idx !== -1 && updatedParsedData[idx].importStatus === 'pending') {
                            updatedParsedData[idx] = { ...updatedParsedData[idx], importStatus: 'failed', importMessage: error.message || "Batch commit failed." };
                        }
                    }
                });
            });
        }
        setParsedData([...updatedParsedData]);
    }

    toast({ title: "Import Complete", description: `${updatedStudentCount} student records updated with SchoolPay IDs. ${failCount > 0 ? `${failCount} student updates failed.` : ''}` });
    setIsImporting(false);
    if (updatedStudentCount > 0 && onImportCompleted) {
      onImportCompleted();
    }
  };
  
  const sortedParsedData = useMemo(() => {
    if (sortOrder === 'default') return parsedData;
    return [...parsedData].sort((a, b) => {
      const aHasErrors = (a.errors?.length || 0) > 0;
      const bHasErrors = (b.errors?.length || 0) > 0;
      if (sortOrder === 'validFirst') {
        return (aHasErrors ? 1 : 0) - (bHasErrors ? 1 : 0) || a.rowIndex - b.rowIndex;
      }
      if (sortOrder === 'invalidFirst') {
        return (bHasErrors ? 1 : 0) - (aHasErrors ? 1 : 0) || a.rowIndex - b.rowIndex;
      }
      return a.rowIndex - b.rowIndex;
    });
  }, [parsedData, sortOrder]);

  const dataReadyForTemplate = !!allStudents && allStudents.length > 0 && !!schoolClasses;


  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!isImporting && !isGeneratingTemplate && !isProcessingFile) onOpenChange(open); }}>
      <DialogContent className="sm:max-w-4xl md:max-w-5xl lg:max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl text-primary flex items-center">
            <UploadCloud className="mr-2 h-5 w-5"/> Import SchoolPay Student IDs (Match by Name)
          </DialogTitle>
          <DialogDescription>
            Upload Excel/CSV. Expected columns: "First Name", "Last Name", and "Payment Code" (this column contains the SchoolPay ID to import).
            The system will match students by First & Last Name. If multiple students match, the ID will be applied to all of them if they don't already have one.
            The first row of the Excel should be a title (e.g., "Students Datasheet"), the second row should contain headers.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow space-y-3 overflow-hidden flex flex-col p-1 pr-2">
          <div className="flex items-center gap-2">
            <Button 
              onClick={handleDownloadSample} 
              variant="outline" 
              size="sm" 
              disabled={!dataReadyForTemplate || isGeneratingTemplate}
            >
              {isGeneratingTemplate ? <Loader2 className="animate-spin mr-2 h-4 w-4"/> : <Download className="mr-2 h-4 w-4"/>}
              {isGeneratingTemplate ? "Generating..." : "Download Sample (Match by Name)"}
            </Button>
             {!dataReadyForTemplate && 
                <p className="text-xs text-destructive">Student or class data not fully loaded for template generation. Please wait or re-open dialog.</p>}
          </div>
          <div className="flex items-center gap-2">
            <Input id="schoolpayid-import-file" type="file" accept=".xlsx, .csv, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} disabled={isProcessingFile || isImporting} className="text-xs"/>
            <Button onClick={processFile} disabled={!file || isProcessingFile || isImporting} size="sm">
              {isProcessingFile ? <Loader2 className="animate-spin mr-2 h-4 w-4"/> : <FileText className="mr-2 h-4 w-4"/>}
              Process File
            </Button>
          </div>
          {file && !isProcessingFile && <p className="text-xs text-muted-foreground">Selected: {file.name}</p>}

          {parsedData.length > 0 && (
            <>
              <div className="flex justify-end items-center gap-2 mt-1">
                <Label htmlFor="sort-schoolpayid-data" className="text-xs">Sort by:</Label>
                <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as typeof sortOrder)}>
                  <SelectTrigger id="sort-schoolpayid-data" className="h-7 w-auto text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Original Order</SelectItem>
                    <SelectItem value="validFirst">Valid First</SelectItem>
                    <SelectItem value="invalidFirst">Invalid First</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <ScrollArea className="border rounded-md flex-grow min-h-[200px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead className="text-[10px] px-1 py-0.5 whitespace-nowrap">Row#</TableHead>
                      <TableHead className="text-[10px] px-1 py-0.5 whitespace-nowrap">First Name (File)</TableHead>
                      <TableHead className="text-[10px] px-1 py-0.5 whitespace-nowrap">Last Name (File)</TableHead>
                      <TableHead className="text-[10px] px-1 py-0.5 whitespace-nowrap">Payment Code (SchoolPay ID from File)</TableHead>
                      <TableHead className="text-[10px] px-1 py-0.5 whitespace-nowrap">Matched Student(s) (System)</TableHead>
                      <TableHead className="text-[10px] px-1 py-0.5 whitespace-nowrap">Validation</TableHead>
                      <TableHead className="text-[10px] px-1 py-0.5 whitespace-nowrap">Import Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedParsedData.map(row => (
                      <TableRow key={row.rowIndex} className={row.errors && row.errors.length > 0 ? 'bg-destructive/10' : (row.importStatus === 'success' ? 'bg-green-100' : (row.importStatus === 'skipped' || row.importStatus === 'partial_success' ? 'bg-yellow-100' : ''))}>
                        <TableCell className="text-[10px] px-1 py-0.5">{row.rowIndex + 1}</TableCell>
                        <TableCell className="text-[10px] px-1 py-0.5">{row.firstNameFromFile || 'N/A'}</TableCell>
                        <TableCell className="text-[10px] px-1 py-0.5">{row.lastNameFromFile || 'N/A'}</TableCell>
                        <TableCell className="text-[10px] px-1 py-0.5">{row.paymentCodeFromFile || 'N/A'}</TableCell>
                        <TableCell className="text-[10px] px-1 py-0.5">
                          {row.studentMatches && row.studentMatches.length > 0 
                            ? row.studentMatches.map(sm => `${sm.firstName} ${sm.lastName} (Reg: ${sm.schoolPayStudentId || sm.studentRegistrationNumber || 'N/A'}, Current SP ID: ${sm.schoolPayStudentId || 'None'})`).join('; ') 
                            : 'No Match'}
                        </TableCell>
                        <TableCell className="text-[10px] px-1 py-0.5">
                          {row.errors && row.errors.length > 0 ? (
                            <div className="text-destructive space-y-0.5" title={row.errors.join('\n')}>
                              <div className="flex items-center gap-0.5 font-semibold"> <AlertTriangle className="h-3 w-3 shrink-0"/> Invalid ({row.errors.length})</div>
                              <ul className="list-disc list-inside text-xs font-normal pl-1">{row.errors.slice(0,1).map((err, idx) => <li key={idx} className="truncate" title={err}>{err}</li>)}</ul>
                            </div>
                          ) : (<div className="text-green-600 flex items-center gap-0.5 font-semibold"><CheckCircle className="h-3.5 w-3.5 shrink-0"/> Valid</div>)}
                        </TableCell>
                        <TableCell className="text-[10px] px-1 py-0.5">{row.importMessage || row.importStatus}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          )}
        </div>
        <DialogFooter className="pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting || isProcessingFile || isGeneratingTemplate}>Cancel</Button>
          <Button 
            type="button" 
            onClick={handleImportValidIds} 
            disabled={isImporting || isProcessingFile || parsedData.filter(r => r.errors?.length === 0 && r.importStatus === 'pending' && r.studentMatches && r.studentMatches.length > 0 && r.studentMatches.some(sm => !sm.schoolPayStudentId) && r.paymentCodeFromFile).length === 0} 
            className="bg-primary hover:bg-primary/90"
          >
            {isImporting ? <Loader2 className="animate-spin mr-2"/> : null}
            Import Valid New IDs ({parsedData.filter(r => r.errors?.length === 0 && r.importStatus === 'pending' && r.studentMatches && r.studentMatches.length > 0 && r.studentMatches.some(sm => !sm.schoolPayStudentId) && r.paymentCodeFromFile).length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    