// src/components/school/print-student-list-dialog.tsx
"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Printer } from 'lucide-react';
import type { School, Student, SchoolClass } from '@/types/school';
import { format } from 'date-fns';

interface PrintStudentListDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  school: School | null;
  schoolClasses: SchoolClass[];
  allStudents: Student[];
}

export function PrintStudentListDialog({
  isOpen,
  onOpenChange,
  school,
  schoolClasses,
  allStudents,
}: PrintStudentListDialogProps) {
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) {
      setSelectedClassIds(new Set());
    }
  }, [isOpen]);

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked) {
      setSelectedClassIds(new Set(schoolClasses.map(c => c.id)));
    } else {
      setSelectedClassIds(new Set());
    }
  };

  const handleClassSelectionChange = (classId: string, checked: boolean | 'indeterminate') => {
    const newSelection = new Set(selectedClassIds);
    if (checked) {
      newSelection.add(classId);
    } else {
      newSelection.delete(classId);
    }
    setSelectedClassIds(newSelection);
  };

  const handlePrintSelected = () => {
    if (selectedClassIds.size === 0 || !school) return;

    const printWindow = window.open('', '_blank', 'height=800,width=1000');
    if (printWindow) {
      const studentsToPrint = allStudents.filter(s => selectedClassIds.has(s.classId));
      const studentsByClass = studentsToPrint.reduce((acc, student) => {
        (acc[student.classId] = acc[student.classId] || []).push(student);
        return acc;
      }, {} as Record<string, Student[]>);

      // Sort students within each class alphabetically
      Object.keys(studentsByClass).forEach(classId => {
        studentsByClass[classId].sort((a, b) => 
          `${a.firstName || ''} ${a.middleName || ''} ${a.lastName || ''}`.localeCompare(`${b.firstName || ''} ${b.middleName || ''} ${b.lastName || ''}`)
        );
      });
      
      const sortedClassIds = Array.from(selectedClassIds).sort((aId, bId) => {
          const aIndex = schoolClasses.findIndex(c => c.id === aId);
          const bIndex = schoolClasses.findIndex(c => c.id === bId);
          return aIndex - bIndex;
      });

      let html = `
        <html>
          <head>
            <title>Student Lists - ${school.name}</title>
            <style>
              @media print {
                body { font-family: Arial, sans-serif; margin: 20px; }
                .page-break { page-break-before: always; }
                .print-header { text-align: center; margin-bottom: 20px; }
                .class-header { font-size: 1.2rem; font-weight: bold; margin-top: 20px; }
                h1 { margin: 0; } h2 { margin: 0; font-weight: normal; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 10pt; }
                th, td { border: 1px solid #000; padding: 6px; text-align: left; }
                th { background-color: #f2f2f2; }
                .name-col { font-weight: bold; }
                .no-print { display: none !important; }
              }
            </style>
          </head>
          <body>
      `;

      sortedClassIds.forEach((classId, index) => {
        if (index > 0) {
          html += '<div class="page-break"></div>';
        }
        const classInfo = schoolClasses.find(c => c.id === classId);
        const className = classInfo ? (classInfo.code ? `${classInfo.class} (${classInfo.code})` : classInfo.class) : 'Unknown Class';
        
        html += `
          <div class="print-header">
            <h1>${school.name}</h1>
            <h2>Student List</h2>
            <p><strong>Class:</strong> ${className} | <strong>Date:</strong> ${format(new Date(), "PP")}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 35%;" class="name-col">Name</th>
                <th style="width: 20%;">AGE</th>
                <th style="width: 20%;">LIN</th>
                <th style="width: 20%;">DOB</th>
              </tr>
            </thead>
            <tbody>
        `;
        
        const classStudents = studentsByClass[classId] || [];
        classStudents.forEach((student, studentIndex) => {
          const studentName = `${student.firstName || ''} ${student.middleName || ''} ${student.lastName || ''}`.replace(/\s+/g, ' ').trim();
          html += `
            <tr>
              <td>${studentIndex + 1}</td>
              <td class="name-col">${studentName}</td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          `;
        });

        html += '</tbody></table>';
      });

      html += '</body></html>';
      
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    }
  };
  
  const handlePrintSummary = () => {
    if (selectedClassIds.size === 0 || !school) return;

    const printWindow = window.open('', '_blank', 'height=800,width=1000');
    if (printWindow) {
      const sortedClassIds = Array.from(selectedClassIds).sort((aId, bId) => {
          const aIndex = schoolClasses.findIndex(c => c.id === aId);
          const bIndex = schoolClasses.findIndex(c => c.id === bId);
          return aIndex - bIndex;
      });

      let totalPopulation = 0;

      let html = `
        <html>
          <head>
            <title>Class Population Summary - ${school.name}</title>
            <style>
              @media print {
                body { font-family: Arial, sans-serif; margin: 20px; }
                .print-header { text-align: center; margin-bottom: 20px; }
                h1 { margin: 0; } h2 { margin: 0; font-weight: normal; }
                table { width: 60%; border-collapse: collapse; margin: 20px auto; font-size: 12pt; }
                th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
                .total-row td { font-weight: bold; border-top: 2px solid #000; }
                .no-print { display: none !important; }
              }
            </style>
          </head>
          <body>
            <div class="print-header">
              <h1>${school.name}</h1>
              <h2>Class Population Summary</h2>
              <p><strong>Date:</strong> ${format(new Date(), "PP")}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Population</th>
                </tr>
              </thead>
              <tbody>
      `;

      sortedClassIds.forEach(classId => {
        const classInfo = schoolClasses.find(c => c.id === classId);
        const className = classInfo ? (classInfo.code ? `${classInfo.class} (${classInfo.code})` : classInfo.class) : 'Unknown Class';
        const population = allStudents.filter(s => s.classId === classId).length;
        totalPopulation += population;
        html += `
          <tr>
            <td>${className}</td>
            <td>${population}</td>
          </tr>
        `;
      });
      
      html += `
            <tr class="total-row">
              <td>Total</td>
              <td>${totalPopulation}</td>
            </tr>
          </tbody></table>
          </body></html>`;
      
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print Student Lists by Class</DialogTitle>
          <DialogDescription>
            Select the classes you want to include in the printable list or summary.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="flex items-center space-x-2 pb-2 border-b">
            <Checkbox
              id="select-all-classes"
              checked={selectedClassIds.size === schoolClasses.length && schoolClasses.length > 0}
              onCheckedChange={handleSelectAll}
            />
            <Label htmlFor="select-all-classes" className="font-semibold">
              Select All Classes
            </Label>
          </div>
          <ScrollArea className="h-64 mt-2">
            <div className="space-y-2 p-1">
              {schoolClasses.map((cls) => (
                <div key={cls.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`class-select-${cls.id}`}
                    checked={selectedClassIds.has(cls.id)}
                    onCheckedChange={(checked) => handleClassSelectionChange(cls.id, checked)}
                  />
                  <Label htmlFor={`class-select-${cls.id}`} className="font-normal">
                    {cls.code ? `${cls.class} (${cls.code})` : cls.class}
                  </Label>
                </div>
              ))}
              {schoolClasses.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No classes found.</p>
              )}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handlePrintSummary} disabled={selectedClassIds.size === 0} variant="secondary">
            <Printer className="mr-2 h-4 w-4" /> Print Summary ({selectedClassIds.size})
          </Button>
          <Button onClick={handlePrintSelected} disabled={selectedClassIds.size === 0}>
            <Printer className="mr-2 h-4 w-4" /> Print List ({selectedClassIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
