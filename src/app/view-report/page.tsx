// src/app/view-report/page.tsx
"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { searchStudentsByName, getPublishedExamsForStudent, getExamReportForStudent } from './actions';
import type { StudentSuggestion, ExamForStudent, StudentExamProfile, School, SchoolClass, GradingScale, Exam } from './types';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services'; // Re-using schoolService

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Search, GraduationCap, UserCircle, CheckCircle, AlertTriangle, ArrowLeft, Printer, FileText, Settings2, Sparkles, MessageSquare } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO } from 'date-fns';

type ViewStep = "search" | "select_exam" | "view_report";

const getGradeBadgeVariant = (grade: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (!grade) return 'outline';
  const gradeUpper = grade.toUpperCase();
  if (gradeUpper.startsWith('D')) return 'default'; // Distinctions
  if (gradeUpper.startsWith('C')) return 'secondary'; // Credits
  if (gradeUpper.startsWith('P')) return 'outline'; // Passes
  if (gradeUpper.startsWith('F')) return 'destructive'; // Fails
  return 'outline';
};

export default function ViewReportPage() {
  const [step, setStep] = useState<ViewStep>("search");
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StudentSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchSchoolId, setSearchSchoolId] = useState(''); // Assuming a single school for this public page for now
  
  // Selection state
  const [selectedStudent, setSelectedStudent] = useState<StudentSuggestion | null>(null);
  const [availableExams, setAvailableExams] = useState<ExamForStudent[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  
  // Report view state
  const [reportData, setReportData] = useState<StudentExamProfile | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [schoolData, setSchoolData] = useState<School | null>(null);

  // Popover state
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // In a multi-school public setup, you might get this from a search param or school selection
    // For now, let's assume one main school or it's provided somehow.
    // If you have a primary school ID, set it here.
    const primarySchoolId = process.env.NEXT_PUBLIC_PRIMARY_SCHOOL_ID || "REPLACE_WITH_A_DEFAULT_SCHOOL_ID";
    setSearchSchoolId(primarySchoolId);
    
    const fetchSchoolData = async () => {
        if (!primarySchoolId) return;
        const school = await getSchoolById(primarySchoolId);
        if (school) {
            setSchoolData(school);
        }
    };
    fetchSchoolData();
  }, []);

  const handleSearchChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setSearchQuery(query);

    if (query.trim().length < 2) {
      setSuggestions([]); setIsPopoverOpen(false); return;
    }
    setIsSearching(true);
    const results = await searchStudentsByName(searchSchoolId, query);
    setSuggestions(results);
    setIsPopoverOpen(results.length > 0);
    setIsSearching(false);
  };
  
  const handleSelectSuggestion = async (suggestion: StudentSuggestion) => {
    setIsPopoverOpen(false);
    setSearchQuery(suggestion.name); 
    setSelectedStudent(suggestion);
    setIsLoadingReport(true);
    
    const exams = await getPublishedExamsForStudent(searchSchoolId, suggestion.id);
    setAvailableExams(exams);
    setStep("select_exam");
    setIsLoadingReport(false);
  };

  const handleViewReport = async () => {
    if (!selectedStudent || !selectedExamId) return;
    setIsLoadingReport(true);
    const report = await getExamReportForStudent(searchSchoolId, selectedExamId, selectedStudent.id);
    setReportData(report);
    setStep("view_report");
    setIsLoadingReport(false);
  };
  
  const resetSearch = () => {
    setStep("search");
    setSearchQuery('');
    setSuggestions([]);
    setSelectedStudent(null);
    setAvailableExams([]);
    setSelectedExamId('');
    setReportData(null);
  };

  return (
    <div className="bg-gradient-to-br from-background to-muted/50 min-h-screen-minus-navbar flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-primary flex items-center justify-center">
            <GraduationCap className="mr-3 h-8 w-8" />
            Student Report Viewer
          </CardTitle>
          <CardDescription>
            {step === 'search' && "Start typing a student's name or registration number to find their report."}
            {step === 'select_exam' && `Select an exam for ${selectedStudent?.name} to view the report.`}
            {step === 'view_report' && `Displaying report for ${selectedStudent?.name}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>

          {step === "search" && (
            <div className="max-w-md mx-auto">
              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                  <div className="relative" ref={inputRef}>
                    <Input
                      id="student-name-search"
                      placeholder="e.g., John Doe or S1001"
                      value={searchQuery}
                      onChange={handleSearchChange}
                      className="pl-9"
                      autoComplete="off"
                      onFocus={() => { if (suggestions.length > 0) setIsPopoverOpen(true); }}
                    />
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  </div>
                </PopoverTrigger>
                <PopoverContent ref={popoverContentRef} className="w-full p-1" style={{width: 'var(--radix-popover-trigger-width)'}} onOpenAutoFocus={(e) => e.preventDefault()}>
                   {isSearching && <div className="p-2 text-sm text-muted-foreground flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin mr-2"/> Searching...</div>}
                   {!isSearching && suggestions.length === 0 && searchQuery.trim().length >= 2 && <div className="p-2 text-sm text-center text-muted-foreground">No students found.</div>}
                   {!isSearching && suggestions.length > 0 && (
                      <div className="space-y-1">
                        {suggestions.map(student => (
                            <Button key={student.id} variant="ghost" className="w-full justify-start h-auto py-2 text-left" onClick={() => handleSelectSuggestion(student)}>
                                <div>
                                    <p className="font-medium text-sm">{student.name}</p>
                                    <p className="text-xs text-muted-foreground">Reg No: {student.registrationNumber}</p>
                                </div>
                            </Button>
                        ))}
                      </div>
                   )}
                </PopoverContent>
              </Popover>
            </div>
          )}

          {step === "select_exam" && (
             <div className="max-w-md mx-auto space-y-4">
               {isLoadingReport ? <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto"/> : (
                  availableExams.length > 0 ? (
                    <>
                      <Select value={selectedExamId} onValueChange={setSelectedExamId}>
                        <SelectTrigger><SelectValue placeholder="Select an available exam..." /></SelectTrigger>
                        <SelectContent>
                          {availableExams.map(exam => <SelectItem key={exam.examId} value={exam.examId}>{exam.examName}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={resetSearch}>Back to Search</Button>
                        <Button onClick={handleViewReport} disabled={!selectedExamId}>View Report</Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center text-muted-foreground p-4 border rounded-md">
                      <p>No published reports found for {selectedStudent?.name}.</p>
                      <Button variant="link" onClick={resetSearch}>Try another student</Button>
                    </div>
                  )
               )}
            </div>
          )}
          
          {step === "view_report" && (
             <div className="space-y-4">
               <Button variant="outline" size="sm" onClick={resetSearch}><ArrowLeft className="mr-2 h-4 w-4"/>Search Again</Button>
               {isLoadingReport ? <div className="flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div> : 
                !reportData ? <p>Could not load report data.</p> : (
                  <div ref={popoverContentRef} className="report-card bg-white p-6 border-2 border-gray-400 shadow-lg print:border-none print:shadow-none">
                     <div className="report-header text-center mb-4">
                        {schoolData?.badgeImageUrl && (
                        <Image src={schoolData.badgeImageUrl} alt="School Logo" width={80} height={80} className="mx-auto" />
                        )}
                        <h2 className="text-xl font-bold uppercase tracking-wide text-gray-800">{schoolData?.name}</h2>
                        <h3 className="text-lg font-semibold text-gray-600 mt-1">{reportData.examName}</h3>
                     </div>
                     <div className="student-details text-sm my-4 border-y border-gray-200 py-3 grid grid-cols-2 gap-2">
                        <p><strong>NAME:</strong> {reportData.studentName}</p>
                        <p><strong>REG NO:</strong> {reportData.studentRegNo}</p>
                        <p><strong>CLASS:</strong> {reportData.studentClass}</p>
                      </div>
                      <Table className="results-table w-full text-xs">
                        <TableHeader>
                            <TableRow className="bg-gray-50 hover:bg-gray-50">
                            <TableHead className="py-2 px-2 font-semibold text-gray-700 min-w-[150px]">SUBJECT</TableHead>
                            <TableHead className="text-center py-2 px-2 font-semibold text-gray-700">SCORE</TableHead>
                            <TableHead className="text-center py-2 px-2 font-semibold text-gray-700">GRADE</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reportData.scores.map((scoreItem) => (
                                <TableRow key={scoreItem.examSubjectId}>
                                    <TableCell className="font-medium">{scoreItem.subjectName}</TableCell>
                                    <TableCell className="text-center">{scoreItem.score ?? '-'}</TableCell>
                                    <TableCell className="text-center"><Badge variant={getGradeBadgeVariant(scoreItem.grade || '')}>{scoreItem.grade || '-'}</Badge></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                       <div className="summary-section text-sm mt-4 font-medium text-center bg-blue-50 rounded-lg py-2 px-4 grid grid-cols-2 gap-4">
                            <div><p className="text-gray-600 text-xs uppercase">AGGREGATES</p><p className="font-bold text-lg text-gray-800">{reportData.aggregate ?? 'N/A'}</p></div>
                            <div><p className="text-gray-600 text-xs uppercase">DIVISION</p><div className="font-bold text-lg text-gray-800">{reportData.division ? <Badge variant="default" className="px-3 py-1 bg-blue-600">{reportData.division}</Badge> : 'N/A'}</div></div>
                       </div>
                  </div>
                )
               }
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
