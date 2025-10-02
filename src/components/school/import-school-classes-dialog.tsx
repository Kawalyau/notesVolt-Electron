
// src/components/school/import-school-classes-dialog.tsx
"use client";

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Download, FileText, UploadCloud, AlertTriangle, CheckCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addSchoolSubcollectionItem } from '@/services/schoolService';
import type { SchoolClass } from '@/types/school';

interface ImportSchoolClassesDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  schoolId: string;
  onImportCompleted: () => void;
}

interface ParsedClass {
  rowIndex: number;
  className?: string;
  classCode?: string;
  errors?: string[];
  importStatus?: 'pending' | 'success' | 'failed';
  importMessage?: string;
}

const normalizeHeaderForClasses = (header: string) => header?.trim().toLowerCase().replace(/\s+/g, '');

export function ImportSchoolClassesDialog({ isOpen, onOpenChange, schoolId, onImportCompleted }: ImportSchoolClassesDialogProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsedClasses, setParsedClasses] = useState<ParsedClass[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setParsedClasses([]);
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
        setParsedClasses([]);
      } else {
        toast({ variant: "destructive", title: "Invalid File Type", description: "Please upload an Excel (.xlsx) or CSV (.csv) file." });
        event.target.value = '';
      }
    }
  };

  const handleDownloadClassSample = () => {
    const headers = ["ClassName", "ClassCode (Optional)"];
    const exampleData = [
      { ClassName: "Primary One", "ClassCode (Optional)": "P1" },
      { ClassName: "Senior One", "ClassCode (Optional)": "S1A" },
    ];
    const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers, skipHeader: false });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Classes_Template");
    XLSX.writeFile(wb, "school_classes_import_template.xlsx");
    toast({ title: "Template Downloaded", description: "Sample template for classes has been downloaded." });
  };

  const processClassFile = async () => {
    if (!file) return;
    setIsProcessingFile(true);
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        if (!data) {
          setIsProcessingFile(false);
          toast({ variant: "destructive", title: "Error", description: "Could not read file data." });
          return;
        }
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });

        if (jsonData.length < 2) {
          setParsedClasses([]);
          toast({ variant: "default", title: "Empty File", description: "No class data found or only headers." });
          setIsProcessingFile(false); return;
        }

        const headers = (jsonData[0] as string[]).map(normalizeHeaderForClasses);
        const classesToValidate: ParsedClass[] = [];

        const classNameCol = headers.indexOf(normalizeHeaderForClasses("ClassName"));
        const classCodeCol = headers.indexOf(normalizeHeaderForClasses("ClassCode(Optional)")); // Matches template

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          if (row.every(cell => cell === undefined || String(cell).trim() === "")) continue;

          const parsed: ParsedClass = { rowIndex: i, importStatus: 'pending' };
          const errors: string[] = [];

          parsed.className = (classNameCol !== -1 && row[classNameCol] !== undefined) ? String(row[classNameCol]).trim() : undefined;
          parsed.classCode = (classCodeCol !== -1 && row[classCodeCol] !== undefined) ? String(row[classCodeCol]).trim() : undefined;

          if (!parsed.className) errors.push("ClassName is required.");

          parsed.errors = errors;
          classesToValidate.push(parsed);
        }
        setParsedClasses(classesToValidate);
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      console.error("Error processing class file:", error);
      toast({ variant: "destructive", title: "File Processing Error" });
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleImportValidClasses = async () => {
    const validClasses = parsedClasses.filter(c => c.errors?.length === 0 && c.importStatus === 'pending');
    if (validClasses.length === 0) {
      toast({ title: "No Valid Classes", description: "No classes to import after validation." });
      return;
    }
    setIsImporting(true);
    let successCount = 0;
    let failCount = 0;
    const updatedParsedClasses = [...parsedClasses];

    for (const pClass of validClasses) {
      try {
        await addSchoolSubcollectionItem(schoolId, 'schoolClasses', {
          class: pClass.className!,
          code: pClass.classCode || null,
        });
        successCount++;
        const classIndex = updatedParsedClasses.findIndex(c => c.rowIndex === pClass.rowIndex);
        if (classIndex !== -1) {
          updatedParsedClasses[classIndex] = { ...pClass, importStatus: 'success', importMessage: 'Imported.' };
        }
      } catch (error: any) {
        failCount++;
        const classIndex = updatedParsedClasses.findIndex(c => c.rowIndex === pClass.rowIndex);
        if (classIndex !== -1) {
          updatedParsedClasses[classIndex] = { ...pClass, importStatus: 'failed', importMessage: error.message || "Failed." };
        }
        console.error("Error importing class:", pClass.className, error);
      }
      setParsedClasses([...updatedParsedClasses]);
    }
    toast({ title: "Import Complete", description: `${successCount} classes imported. ${failCount} failed.` });
    setIsImporting(false);
    if (successCount > 0) onImportCompleted();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!isImporting && !isProcessingFile) onOpenChange(open); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl text-primary flex items-center">
            <UploadCloud className="mr-2 h-5 w-5"/> Import School Classes
          </DialogTitle>
          <DialogDescription>
            Upload an Excel (.xlsx) or CSV file. Required columns: ClassName. Optional: ClassCode.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow space-y-3 overflow-hidden flex flex-col p-1 pr-2">
          <div className="flex items-center gap-2">
            <Button onClick={handleDownloadClassSample} variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4"/> Download Sample Template
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input id="class-import-file" type="file" accept=".xlsx, .csv" onChange={handleFileChange} disabled={isProcessingFile || isImporting} className="text-xs"/>
            <Button onClick={processClassFile} disabled={!file || isProcessingFile || isImporting} size="sm">
              {isProcessingFile ? <Loader2 className="animate-spin mr-2 h-4 w-4"/> : <FileText className="mr-2 h-4 w-4"/>}
              Process File
            </Button>
          </div>
          {file && !isProcessingFile && <p className="text-xs text-muted-foreground">Selected: {file.name}</p>}

          {parsedClasses.length > 0 && (
            <ScrollArea className="border rounded-md flex-grow h-0 min-h-[150px]">
              <Table>
                <TableHeader><TableRow><TableHead className="text-xs">#</TableHead><TableHead className="text-xs">Class Name</TableHead><TableHead className="text-xs">Class Code</TableHead><TableHead className="text-xs">Validation</TableHead><TableHead className="text-xs">Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {parsedClasses.map(c => (
                    <TableRow key={c.rowIndex} className={c.errors && c.errors.length > 0 ? 'bg-destructive/10' : (c.importStatus === 'success' ? 'bg-green-100' : '')}>
                      <TableCell className="text-xs">{c.rowIndex}</TableCell>
                      <TableCell className="text-xs">{c.className}</TableCell>
                      <TableCell className="text-xs">{c.classCode}</TableCell>
                      <TableCell className="text-xs">
                        {c.errors && c.errors.length > 0 ? <span className="text-destructive flex items-center gap-1" title={c.errors.join('\n')}><AlertTriangle className="h-3 w-3"/>Invalid</span> : <span className="text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3"/>Valid</span>}
                      </TableCell>
                      <TableCell className="text-xs">{c.importStatus === 'pending' ? 'Pending' : c.importMessage}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
        <DialogFooter className="pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting || isProcessingFile}>Cancel</Button>
          <Button type="button" onClick={handleImportValidClasses} disabled={isImporting || isProcessingFile || parsedClasses.filter(c => c.errors?.length === 0 && c.importStatus === 'pending').length === 0} className="bg-primary hover:bg-primary/90">
            {isImporting ? <Loader2 className="animate-spin mr-2"/> : null}
            Import Valid Classes ({parsedClasses.filter(c => c.errors?.length === 0 && c.importStatus === 'pending').length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
