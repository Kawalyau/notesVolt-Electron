
// src/components/school/import-fee-items-dialog.tsx
"use client";

import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Download, FileText, UploadCloud, AlertTriangle, CheckCircle, Tag } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSchoolSubcollectionItems, addSchoolSubcollectionItem, addFeeTransaction } from '@/services/schoolService';
import { getDocs, query, collection as firestoreCollection, where, serverTimestamp, Timestamp } from 'firebase/firestore'; // Corrected imports
import { firestore } from '@/config/firebase'; // Import firestore instance
import type { SchoolClass, FeeItem, SchoolAcademicYear, SchoolTerm, Student, FeeTransaction } from '@/types/school';


interface ImportFeeItemsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  schoolId: string;
  schoolClasses: SchoolClass[];
  academicYears: SchoolAcademicYear[];
  schoolTerms: SchoolTerm[];
  onImportCompleted: () => void;
}

interface ParsedFeeItemRow {
  rowIndex: number;
  feeItemName?: string;
  description?: string;
  isRecurring?: boolean;
  isCompulsory?: boolean;
  academicYearName?: string;
  termName?: string;
  applicableClassCodeOrName?: string;
  amountForThisClass?: number;
  
  // Resolved IDs
  academicYearId?: string;
  classId?: string;

  errors?: string[];
  importStatus?: 'pending' | 'success' | 'failed';
  importMessage?: string;
}

// Structure for grouping rows into FeeItem objects
interface GroupedFeeItem {
    name: string;
    description?: string | null;
    isRecurring: boolean;
    isCompulsory: boolean;
    academicYearId: string;
    term: string;
    classAmounts: Array<{ classId: string; amount: number }>;
    originalRows: ParsedFeeItemRow[]; // To trace back for status updates
}


const normalizeHeaderForFeeItems = (header: string) => header?.trim().toLowerCase().replace(/\s+/g, '');

export function ImportFeeItemsDialog({ 
    isOpen, 
    onOpenChange, 
    schoolId, 
    schoolClasses, 
    academicYears, 
    schoolTerms, 
    onImportCompleted 
}: ImportFeeItemsDialogProps) {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsedFeeItemRows, setParsedFeeItemRows] = useState<ParsedFeeItemRow[]>([]);
  const [groupedFeeItemsForImport, setGroupedFeeItemsForImport] = useState<GroupedFeeItem[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setParsedFeeItemRows([]);
      setGroupedFeeItemsForImport([]);
      setIsProcessingFile(false);
      setIsImporting(false);
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
            setParsedFeeItemRows([]);
            setGroupedFeeItemsForImport([]);
        } else {
            toast({ variant: "destructive", title: "Invalid File Type", description: "Please upload an Excel (.xlsx) or CSV (.csv) file." });
            event.target.value = '';
        }
    }
  };

  const getClassName = (classId: string) => {
    const foundClass = schoolClasses.find(c => c.id === classId);
    return foundClass ? (foundClass.code ? `${foundClass.class} (${foundClass.code})` : foundClass.class) : 'N/A';
  };

  const handleDownloadFeeItemSample = () => {
    const mainHeaders = [
      "FeeItemName", "Description (Optional)", "IsRecurring (TRUE/FALSE)", "IsCompulsory (TRUE/FALSE)",
      "AcademicYearName", "TermName", "ApplicableClassCodeOrName", "AmountForThisClass"
    ];
    const exampleData = [
      { 
        FeeItemName: "Term 1 Tuition", Description: "Standard tuition for the first term", 
        "IsRecurring (TRUE/FALSE)": "TRUE", "IsCompulsory (TRUE/FALSE)": "TRUE",
        AcademicYearName: academicYears.length > 0 ? academicYears[0].year : "2024", 
        TermName: schoolTerms.filter(t => t.academicYearId === (academicYears.length > 0 ? academicYears[0].id : ""))[0]?.name || "Term 1",
        ApplicableClassCodeOrName: schoolClasses.length > 0 ? (schoolClasses[0].code || schoolClasses[0].class) : "P1",
        AmountForThisClass: 500000
      },
    ];
    const wsMain = XLSX.utils.json_to_sheet(exampleData, { header: mainHeaders, skipHeader: false });
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsMain, "FeeItems_To_Import");

    const wsYears = XLSX.utils.json_to_sheet(academicYears.map(ay => ({ AcademicYearName: ay.year, YearID: ay.id })));
    XLSX.utils.book_append_sheet(wb, wsYears, "Valid_AcademicYears");
    
    const wsTerms = XLSX.utils.json_to_sheet(schoolTerms.map(st => ({ TermName: st.name, AssociatedAcademicYear: st.academicYearName, TermID: st.id })));
    XLSX.utils.book_append_sheet(wb, wsTerms, "Valid_Terms");

    const wsClasses = XLSX.utils.json_to_sheet(schoolClasses.map(sc => ({ ClassName: sc.class, ClassCode: sc.code || "", ClassID: sc.id })));
    XLSX.utils.book_append_sheet(wb, wsClasses, "Valid_Classes");
    
    XLSX.writeFile(wb, "fee_items_import_template.xlsx");
    toast({ title: "Template Downloaded", description: "Sample template for fee items has been downloaded." });
  };

  const processFeeItemFile = async () => {
    if (!file) return;
    setIsProcessingFile(true);
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        if (!data) { setIsProcessingFile(false); toast({ variant: "destructive", title: "Error", description: "Could not read file data." }); return; }
        
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });

        if (jsonData.length < 2) { setParsedFeeItemRows([]); toast({ variant: "default", title: "Empty File" }); setIsProcessingFile(false); return; }

        const headers = (jsonData[0] as string[]).map(normalizeHeaderForFeeItems);
        const rowsToValidate: ParsedFeeItemRow[] = [];

        const findCol = (possibleNames: string[]) => {
            for (const name of possibleNames) {
                const idx = headers.indexOf(normalizeHeaderForFeeItems(name));
                if (idx !== -1) return idx;
            }
            return -1;
        };

        const nameCol = findCol(["feeitemname"]);
        const descCol = findCol(["description(optional)", "description"]);
        const recurringCol = findCol(["isrecurring(true/false)", "isrecurring"]);
        const compulsoryCol = findCol(["iscompulsory(true/false)", "iscompulsory"]);
        const yearNameCol = findCol(["academicyearname"]);
        const termNameCol = findCol(["termname"]);
        const classNameCol = findCol(["applicableclasscodeorname"]);
        const amountCol = findCol(["amountforthisclass"]);

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          if (row.every(cell => cell === undefined || String(cell).trim() === "")) continue;

          const parsedRow: ParsedFeeItemRow = { rowIndex: i, importStatus: 'pending' };
          const errors: string[] = [];
          
          const getRowVal = (colIndex: number) => (colIndex !== -1 && row[colIndex] !== undefined && row[colIndex] !== null) ? String(row[colIndex]).trim() : undefined;

          parsedRow.feeItemName = getRowVal(nameCol);
          if (!parsedRow.feeItemName) errors.push("FeeItemName is required.");

          parsedRow.description = getRowVal(descCol) || "";
          
          const recurringStr = getRowVal(recurringCol)?.toLowerCase();
          parsedRow.isRecurring = recurringStr === 'true' ? true : (recurringStr === 'false' ? false : true); // Default true

          const compulsoryStr = getRowVal(compulsoryCol)?.toLowerCase();
          parsedRow.isCompulsory = compulsoryStr === 'true' ? true : (compulsoryStr === 'false' ? false : false); // Default false

          parsedRow.academicYearName = getRowVal(yearNameCol);
          if (!parsedRow.academicYearName) errors.push("AcademicYearName is required.");
          else {
            const year = academicYears.find(ay => ay.year.toLowerCase() === parsedRow.academicYearName!.toLowerCase());
            if (!year) errors.push(`AcademicYear "${parsedRow.academicYearName}" not found.`);
            else parsedRow.academicYearId = year.id;
          }

          parsedRow.termName = getRowVal(termNameCol);
          if (!parsedRow.termName) errors.push("TermName is required.");
          else if (parsedRow.academicYearId) {
            const term = schoolTerms.find(st => st.name.toLowerCase() === parsedRow.termName!.toLowerCase() && st.academicYearId === parsedRow.academicYearId);
            if (!term) errors.push(`Term "${parsedRow.termName}" not found for year "${parsedRow.academicYearName}".`);
          } else {
            errors.push("Cannot validate TermName without a valid AcademicYear.");
          }

          parsedRow.applicableClassCodeOrName = getRowVal(classNameCol);
          if (!parsedRow.applicableClassCodeOrName) errors.push("ApplicableClassCodeOrName is required.");
          else {
            const sClass = schoolClasses.find(sc => (sc.class.toLowerCase() === parsedRow.applicableClassCodeOrName!.toLowerCase()) || (sc.code && sc.code.toLowerCase() === parsedRow.applicableClassCodeOrName!.toLowerCase()));
            if (!sClass) errors.push(`Class "${parsedRow.applicableClassCodeOrName}" not found.`);
            else parsedRow.classId = sClass.id;
          }

          const amountStr = getRowVal(amountCol);
          const parsedAmount = parseFloat(amountStr || "");
          if (!amountStr || isNaN(parsedAmount) || parsedAmount <= 0) errors.push("AmountForThisClass must be a positive number.");
          else parsedRow.amountForThisClass = parsedAmount;

          parsedRow.errors = errors;
          rowsToValidate.push(parsedRow);
        }
        setParsedFeeItemRows(rowsToValidate);

        // Group valid rows into FeeItem structures
        const grouped: Record<string, GroupedFeeItem> = {};
        rowsToValidate.filter(row => row.errors?.length === 0).forEach(row => {
            const key = `${row.feeItemName}-${row.academicYearId}-${row.termName}-${row.description}-${row.isRecurring}-${row.isCompulsory}`;
            if (!grouped[key]) {
                grouped[key] = {
                    name: row.feeItemName!,
                    description: row.description || null,
                    isRecurring: row.isRecurring!,
                    isCompulsory: row.isCompulsory!,
                    academicYearId: row.academicYearId!,
                    term: row.termName!,
                    classAmounts: [],
                    originalRows: []
                };
            }
            grouped[key].classAmounts.push({ classId: row.classId!, amount: row.amountForThisClass! });
            grouped[key].originalRows.push(row);
        });
        setGroupedFeeItemsForImport(Object.values(grouped));
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      console.error("Error processing fee item file:", error);
      toast({ variant: "destructive", title: "File Processing Error" });
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleImportValidFeeItems = async () => {
    if (!userProfile) { toast({ variant: "destructive", title: "Admin not identified." }); return; }
    
    const itemsToImport = groupedFeeItemsForImport.filter(gfi => 
        gfi.originalRows.every(row => parsedFeeItemRows.find(pRow => pRow.rowIndex === row.rowIndex)?.importStatus === 'pending')
    );

    if (itemsToImport.length === 0) {
      toast({ title: "No New Fee Items", description: "No valid fee items to import or all have been processed." });
      return;
    }
    setIsImporting(true);
    let successCount = 0;
    let failCount = 0;
    const updatedParsedRows = [...parsedFeeItemRows];

    for (const groupedItem of itemsToImport) {
      try {
        const feeItemData: Omit<FeeItem, 'id' | 'createdAt' | 'updatedAt'> = {
          name: groupedItem.name,
          description: groupedItem.description,
          isRecurring: groupedItem.isRecurring,
          isCompulsory: groupedItem.isCompulsory,
          academicYearId: groupedItem.academicYearId,
          term: groupedItem.term,
          classAmounts: groupedItem.classAmounts,
        };
        const newFeeItemId = await addSchoolSubcollectionItem(schoolId, 'feeItems', feeItemData);
        successCount++;
        
        groupedItem.originalRows.forEach(row => {
            const idx = updatedParsedRows.findIndex(pr => pr.rowIndex === row.rowIndex);
            if (idx !== -1) updatedParsedRows[idx] = { ...updatedParsedRows[idx], importStatus: 'success', importMessage: 'Imported.' };
        });
        
        if (groupedItem.isCompulsory) {
            const studentsSnapshot = await getFirestoreDocs(
              firestoreQuery(
                firestoreCollection(firestore, `schools/${schoolId}/students`), 
                firestoreWhere("status", "==", "Active")
              )
            );
            const activeStudents = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
            let assignmentsMade = 0;
            for (const student of activeStudents) {
                const studentClassAmountObj = groupedItem.classAmounts.find(ca => ca.classId === student.classId);
                if (studentClassAmountObj && studentClassAmountObj.amount > 0) {
                    const q = firestoreQuery(
                        firestoreCollection(firestore, `schools/${schoolId}/students/${student.id}/feeTransactions`),
                        firestoreWhere("feeItemId", "==", newFeeItemId),
                        firestoreWhere("academicYearId", "==", groupedItem.academicYearId), 
                        firestoreWhere("term", "==", groupedItem.term),                     
                        firestoreWhere("type", "==", "debit")
                    );
                    const existingBillSnapshot = await getFirestoreDocs(q);
                    if (existingBillSnapshot.empty) {
                        const debitTransaction: Omit<FeeTransaction, 'id' | 'createdAt'> = {
                            studentId: student.id, schoolId: schoolId, type: 'debit',
                            description: groupedItem.name, amount: studentClassAmountObj.amount,
                            feeItemId: newFeeItemId, academicYearId: groupedItem.academicYearId, term: groupedItem.term,
                            transactionDate: firestoreServerTimestamp() as Timestamp,
                            recordedByAdminId: userProfile.uid, recordedByAdminName: userProfile.displayName || userProfile.email,
                        };
                        await addFeeTransaction(schoolId, student.id, debitTransaction);
                        assignmentsMade++;
                    }
                }
            }
             if (assignmentsMade > 0) {
                 toast({ title: "Fees Auto-Assigned", description: `Compulsory fee "${groupedItem.name}" assigned to ${assignmentsMade} active students.` });
             }
        }


      } catch (error: any) {
        failCount++;
        groupedItem.originalRows.forEach(row => {
            const idx = updatedParsedRows.findIndex(pr => pr.rowIndex === row.rowIndex);
            if (idx !== -1) updatedParsedRows[idx] = { ...updatedParsedRows[idx], importStatus: 'failed', importMessage: error.message || "Failed." };
        });
        console.error("Error importing fee item:", groupedItem.name, error);
      }
      setParsedFeeItemRows([...updatedParsedRows]); // Update UI after each item for feedback
    }
    toast({ title: "Import Complete", description: `${successCount} fee items created/updated. ${failCount} failed.` });
    setIsImporting(false);
    if (successCount > 0) onImportCompleted();
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!isImporting && !isProcessingFile) onOpenChange(open); }}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl text-primary flex items-center">
            <Tag className="mr-2 h-5 w-5"/> Import Fee Items
          </DialogTitle>
          <DialogDescription>
            Upload an Excel (.xlsx) or CSV file for fee items. See template for required columns.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow space-y-3 overflow-hidden flex flex-col p-1 pr-2">
          <div className="flex items-center gap-2">
            <Button onClick={handleDownloadFeeItemSample} variant="outline" size="sm" disabled={academicYears.length === 0 || schoolTerms.length === 0 || schoolClasses.length === 0}>
              <Download className="mr-2 h-4 w-4"/> Download Sample (with School Data)
            </Button>
            {(academicYears.length === 0 || schoolTerms.length === 0 || schoolClasses.length === 0) && 
              <p className="text-xs text-destructive">Please define Academic Years, Terms, and Classes in settings before downloading template.</p>}
          </div>
          <div className="flex items-center gap-2">
            <Input id="feeitem-import-file" type="file" accept=".xlsx, .csv" onChange={handleFileChange} disabled={isProcessingFile || isImporting} className="text-xs"/>
            <Button onClick={processFeeItemFile} disabled={!file || isProcessingFile || isImporting} size="sm">
              {isProcessingFile ? <Loader2 className="animate-spin mr-2 h-4 w-4"/> : <FileText className="mr-2 h-4 w-4"/>}
              Process File
            </Button>
          </div>
          {file && !isProcessingFile && <p className="text-xs text-muted-foreground">Selected: {file.name}</p>}

          {parsedFeeItemRows.length > 0 && (
            <ScrollArea className="border rounded-md flex-grow h-0 min-h-[150px]">
              <Table>
                <TableHeader><TableRow>
                    <TableHead className="text-xs">#</TableHead><TableHead className="text-xs">Fee Name</TableHead><TableHead className="text-xs">Year</TableHead>
                    <TableHead className="text-xs">Term</TableHead><TableHead className="text-xs">Class</TableHead><TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Validation</TableHead><TableHead className="text-xs">Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {parsedFeeItemRows.map(row => (
                    <TableRow key={row.rowIndex} className={row.errors && row.errors.length > 0 ? 'bg-destructive/10' : (row.importStatus === 'success' ? 'bg-green-100' : '')}>
                      <TableCell className="text-xs">{row.rowIndex}</TableCell>
                      <TableCell className="text-xs truncate max-w-[100px]">{row.feeItemName}</TableCell>
                      <TableCell className="text-xs">{row.academicYearName}</TableCell>
                      <TableCell className="text-xs">{row.termName}</TableCell>
                      <TableCell className="text-xs">{row.applicableClassCodeOrName}</TableCell>
                      <TableCell className="text-xs">{row.amountForThisClass}</TableCell>
                      <TableCell className="text-xs">
                        {row.errors && row.errors.length > 0 ? <span className="text-destructive flex items-center gap-1" title={row.errors.join('\n')}><AlertTriangle className="h-3 w-3"/>Invalid</span> : <span className="text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3"/>Valid</span>}
                      </TableCell>
                      <TableCell className="text-xs">{row.importStatus === 'pending' ? 'Pending' : row.importMessage}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
           {groupedFeeItemsForImport.length > 0 && parsedFeeItemRows.every(r => r.errors && r.errors.length > 0 ? true : (r.importStatus !== 'pending')) &&
             <p className="text-sm text-muted-foreground text-center py-2">All processed rows from the file have been imported or had errors.</p>
           }
        </div>
        <DialogFooter className="pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting || isProcessingFile}>Cancel</Button>
          <Button type="button" onClick={handleImportValidFeeItems} disabled={isImporting || isProcessingFile || groupedFeeItemsForImport.filter(gfi => gfi.originalRows.some(row => parsedFeeItemRows.find(pRow => pRow.rowIndex === row.rowIndex)?.importStatus === 'pending')).length === 0} className="bg-primary hover:bg-primary/90">
            {isImporting ? <Loader2 className="animate-spin mr-2"/> : null}
            Import Valid ({groupedFeeItemsForImport.filter(gfi => gfi.originalRows.some(row => parsedFeeItemRows.find(pRow => pRow.rowIndex === row.rowIndex)?.importStatus === 'pending')).length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    