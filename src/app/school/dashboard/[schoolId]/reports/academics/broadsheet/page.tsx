
// src/app/school/dashboard/[schoolId]/reports/academics/broadsheet/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, getStudentExamProfile } from '@/services';
import type { School, Exam, SchoolClass, Student, ExamSubject, StudentExamProfile, GradingScale, AppTimestamp } from '@/types/school';
import { Loader2, BarChart3, Filter, Printer, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ReactToPrint from 'react-to-print';
import { format } from 'date-fns';
import Image from 'next/image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { where } from 'firebase/firestore';
import { PrintButton } from '@/components/ui/print-button';


interface BroadsheetRow {
  student: Student;
  scores: Record<string, { score?: number | null, grade?: string | null }>; // { subjectId: { score, grade } }
  aggregate?: number | null;
  division?: string | null;
  position?: number | string;
}

export default function BroadsheetReportPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const printAreaRef = useRef<HTMLDivElement>(null);
  const singleReportRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [school, setSchool] = useState<School | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [examSubjects, setExamSubjects] = useState<ExamSubject[]>([]);
  const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);

  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  const [broadsheetData, setBroadsheetData] = useState<BroadsheetRow[]>([]);
  const [studentToPrint, setStudentToPrint] = useState<BroadsheetRow | null>(null);

  const fetchInitialData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const [schoolData, examData, classData, scalesData] = await Promise.all([
        getSchoolById(schoolId),
        getSchoolSubcollectionItems<Exam>(schoolId, 'exams'),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        getSchoolSubcollectionItems<GradingScale>(schoolId, 'gradingScales'),
      ]);
      setSchool(schoolData);
      setExams(examData);
      setSchoolClasses(classData);
      setGradingScales(scalesData);
    } catch (error) { toast({ variant: "destructive", title: "Error", description: "Could not load page data." }); }
    finally { setIsLoading(false); }
  }, [schoolId, user, toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    const fetchExamDetails = async () => {
      if (!selectedExamId) { setExamSubjects([]); return; }
      try {
        const subjects = await getSchoolSubcollectionItems<ExamSubject>(schoolId, `exams/${selectedExamId}/subjects`);
        setExamSubjects(subjects.sort((a,b) => (a.subjectName || "").localeCompare(b.subjectName || "")));
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Could not fetch subjects for the selected exam." });
      }
    };
    fetchExamDetails();
  }, [selectedExamId, schoolId, toast]);

  useEffect(() => {
    const generateBroadsheet = async () => {
      if (!selectedExamId || !selectedClassId || examSubjects.length === 0 || gradingScales.length === 0) {
        setBroadsheetData([]);
        return;
      }
      setIsLoading(true);

      const selectedExam = exams.find(e => e.id === selectedExamId);
      const examScale = gradingScales.find(s => s.id === selectedExam?.defaultGradingScaleId);

      if (!selectedExam || !examScale) {
        toast({variant: "destructive", title: "Configuration Error", description: "Selected exam or its grading scale is missing."});
        setIsLoading(false);
        return;
      }

      try {
        const studentQueryConstraints = [
            where('classId', '==', selectedClassId),
            where('status', '==', 'Active')
        ];
        const students = await getSchoolSubcollectionItems<Student>(schoolId, 'students', studentQueryConstraints);
        const studentProfiles = await Promise.all(
          students.map(student => getStudentExamProfile(schoolId, selectedExamId, student.id))
        );
        
        const coreSubjects = examSubjects.filter(s => s.isCoreSubject);
        const coreSubjectIds = coreSubjects.map(s => s.id);

        const dataWithRecalculation = students.map(student => {
            const profile = studentProfiles.find(p => p?.studentId === student.id);
            const studentScores: BroadsheetRow['scores'] = {};
            let aggregate = 0;
            let missedCorePaper = false;

            if (profile) {
              examSubjects.forEach(subject => {
                const scoreInfo = profile.scores.find(s => s.examSubjectId === subject.id);
                studentScores[subject.id] = { score: scoreInfo?.score, grade: scoreInfo?.grade };
              });
              
              const coreScores = profile.scores.filter(s => coreSubjectIds.includes(s.examSubjectId));

              // Check for completeness
              if(coreScores.length < coreSubjectIds.length) {
                missedCorePaper = true;
              } else {
                coreScores.forEach(score => {
                    if (score.gradeValue !== null && score.gradeValue !== undefined) {
                      aggregate += score.gradeValue;
                    } else {
                      missedCorePaper = true;
                    }
                });
              }
            } else {
              // If no profile, all scores are null and they missed papers
              missedCorePaper = coreSubjectIds.length > 0;
              examSubjects.forEach(subject => {
                studentScores[subject.id] = { score: null, grade: null };
              });
            }

            const division = missedCorePaper 
                ? 'X' 
                : (examScale.divisions.find(d => aggregate >= d.minAggregate && aggregate <= d.maxAggregate)?.name || 'Ungraded');

            return {
                student,
                scores: studentScores,
                aggregate: missedCorePaper ? null : aggregate,
                division: division,
            };
        });

        // --- Position Calculation based on recalculated data ---
        const eligibleForRanking = dataWithRecalculation
          .filter(row => row.division !== 'X' && row.aggregate !== null)
          .sort((a, b) => (a.aggregate!) - (b.aggregate!));
        
        const rankedStudentsWithPosition: Array<{ studentId: string, position: number | string }> = [];
        let lastAggregate = -1;
        let lastRank = 0;
        eligibleForRanking.forEach((row, index) => {
          if (row.aggregate !== lastAggregate) {
            lastRank = index + 1;
          }
          rankedStudentsWithPosition.push({ studentId: row.student.id, position: lastRank });
          lastAggregate = row.aggregate!;
        });

        const finalData = dataWithRecalculation.map(row => {
            const ranking = rankedStudentsWithPosition.find(r => r.studentId === row.student.id);
            return {
                ...row,
                position: ranking ? ranking.position : 'X'
            };
        });
        
        setBroadsheetData(finalData.sort((a,b) => {
            if(typeof a.position === 'number' && typeof b.position === 'number') return a.position - b.position;
            if(typeof a.position === 'number') return -1; // Numbers first
            if(typeof b.position === 'number') return 1;
            return (a.aggregate || 999) - (b.aggregate || 999);
        }));

      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Failed to generate broadsheet." });
      } finally { setIsLoading(false); }
    };
    generateBroadsheet();
  }, [selectedExamId, selectedClassId, examSubjects, schoolId, toast, gradingScales, exams]);
  
  const selectedExam = exams.find(e => e.id === selectedExamId);

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .printable-area, .printable-area * { visibility: visible; }
          .printable-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="space-y-6 no-print">
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                <div>
                    <CardTitle className="text-2xl flex items-center"><BarChart3 className="mr-3 h-6 w-6 text-primary"/>Class Broadsheet / Marksheet</CardTitle>
                    <CardDescription>View a comprehensive marksheet for a selected class and examination.</CardDescription>
                </div>
                 <ReactToPrint
                    trigger={() => (
                        <Button variant="outline" size="sm" disabled={broadsheetData.length === 0}>
                            <Printer className="mr-2 h-4 w-4"/> Print Marksheet
                        </Button>
                    )}
                    content={() => printAreaRef.current}
                    pageStyle={`
                        @page { 
                            size: A4 landscape; 
                            margin: 0.5in;
                        }
                    `}
                />
            </div>
             <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t items-end">
              <div className="flex-grow"><Label>Select Exam</Label><Select value={selectedExamId} onValueChange={setSelectedExamId}><SelectTrigger><SelectValue placeholder="Choose an examination" /></SelectTrigger><SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.id}>{e.name} - {e.term}</SelectItem>)}</SelectContent></Select></div>
              <div className="flex-grow"><Label>Select Class</Label><Select value={selectedClassId} onValueChange={setSelectedClassId} disabled={!selectedExamId}><SelectTrigger><SelectValue placeholder="Choose a class" /></SelectTrigger><SelectContent>{schoolClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.class}</SelectItem>)}</SelectContent></Select></div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="flex justify-center p-8"><Loader2 className="animate-spin h-10 w-10 text-primary"/></div> : (
              broadsheetData.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-xs font-bold sticky left-0 bg-card z-10">#</TableHead>
                      <TableHead className="text-xs font-bold sticky left-0 bg-card z-10 pl-10">Student Name</TableHead>
                      {examSubjects.map(sub => <TableHead key={sub.id} className="text-center text-xs">{sub.subjectName}</TableHead>)}
                      <TableHead className="text-center text-xs font-bold">Agg.</TableHead>
                      <TableHead className="text-center text-xs font-bold">Div.</TableHead>
                      <TableHead className="text-center text-xs font-bold">Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {broadsheetData.map(row => (
                        <TableRow key={row.student.id}>
                          <TableCell className="font-medium text-xs sticky left-0 bg-card">{row.position}</TableCell>
                          <TableCell className="font-medium text-xs sticky left-0 bg-card z-10 pl-10">{row.student.firstName} {row.student.lastName}</TableCell>
                          {examSubjects.map(sub => (
                            <TableCell key={sub.id} className="text-center text-xs">
                              {row.scores[sub.id]?.score !== undefined && row.scores[sub.id]?.score !== null ? `${row.scores[sub.id]?.score} (${row.scores[sub.id]?.grade})` : '-'}
                            </TableCell>
                          ))}
                          <TableCell className="text-center text-xs font-bold">{row.aggregate ?? 'N/A'}</TableCell>
                          <TableCell className="text-center text-xs font-bold">{row.division ?? 'N/A'}</TableCell>
                          <TableCell className="text-center">
                            <ReactToPrint
                                trigger={() => (
                                    <PrintButton variant="ghost" size="sm" onClick={() => setStudentToPrint(row)}>
                                        <Printer className="h-4 w-4"/>
                                    </PrintButton>
                                )}
                                content={() => singleReportRef.current}
                                pageStyle={`
                                    @page { 
                                        size: A4 portrait; 
                                        margin: 0;
                                    }
                                `}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : <p className="text-muted-foreground text-center p-6">{selectedClassId ? "No students or marks found for this selection." : "Please select an exam and class."}</p>
            )}
          </CardContent>
        </Card>
      </div>

       {/* Hidden div for printing the entire marksheet */}
      <div className="hidden printable-area">
        <div ref={printAreaRef} className="p-4">
            <div className="text-center mb-4">
                <h2 className="text-xl font-bold">{school?.name}</h2>
                <h3 className="text-lg font-semibold">{exams.find(e => e.id === selectedExamId)?.name} - Broadsheet</h3>
                <p className="text-sm">Class: {schoolClasses.find(c => c.id === selectedClassId)?.class}</p>
                <p className="text-xs">Date: {format(new Date(), "PP")}</p>
            </div>
            <table className="w-full text-xs border-collapse border border-black">
              <thead><tr>
                  <th className="border border-black p-1">#</th>
                  <th className="border border-black p-1">Student Name</th>
                  {examSubjects.map(sub => <th key={sub.id} className="border border-black p-1 text-center">{sub.subjectName}</th>)}
                  <th className="border border-black p-1 text-center">Agg.</th>
                  <th className="border border-black p-1 text-center">Div.</th>
              </tr></thead>
              <tbody>
                  {broadsheetData.map(row => (
                  <tr key={row.student.id}>
                      <td className="border border-black p-1">{row.position}</td>
                      <td className="border border-black p-1 font-medium">{row.student.firstName} {row.student.lastName}</td>
                      {examSubjects.map(sub => (
                          <td key={sub.id} className="border border-black p-1 text-center">
                          {row.scores[sub.id]?.score !== undefined && row.scores[sub.id]?.score !== null ? `${row.scores[sub.id]?.score}(${row.scores[sub.id]?.grade})` : '-'}
                          </td>
                      ))}
                      <td className="border border-black p-1 text-center font-bold">{row.aggregate ?? 'N/A'}</td>
                      <td className="border border-black p-1 text-center font-bold">{row.division ?? 'N/A'}</td>
                  </tr>
                  ))}
              </tbody>
            </table>
        </div>
      </div>

      {/* Hidden div for printing a single student report */}
      <div className="hidden printable-area">
        <div ref={singleReportRef}>
          {studentToPrint && school && selectedExam && (
            <div className="report-card bg-white p-6 border-2 border-double border-black shadow-lg" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
              <div className="report-content" style={{position: 'relative', zIndex: 1}}>
                  <div className="report-header text-center mb-4">
                    {school?.badgeImageUrl && (
                      <Image src={school.badgeImageUrl} alt="School Logo" width={80} height={80} className="mx-auto" data-ai-hint="school logo"/>
                    )}
                    <h2 className="text-3xl font-bold uppercase tracking-wide text-black">{school?.name}</h2>
                    <p className="text-sm italic">{school?.motto}</p>
                    <h3 className="text-xl font-semibold text-gray-800 mt-2">{selectedExam?.name || 'Report'}</h3>
                    <p className="text-md text-gray-600 mt-1">{selectedExam?.term} &bull; {format(new Date(), 'yyyy')}</p>
                  </div>
                  
                  <div className="student-details text-sm my-4 border-y-2 border-black py-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    <p><strong>NAME:</strong> {studentToPrint.student.firstName} {studentToPrint.student.lastName}</p>
                    <p><strong>REG NO:</strong> {studentToPrint.student.studentRegistrationNumber}</p>
                    <p><strong>CLASS:</strong> {schoolClasses.find(c=>c.id === studentToPrint.student.classId)?.class || 'N/A'}</p>
                    <p><strong>SchoolPay ID:</strong> {studentToPrint.student.schoolPayStudentId || 'N/A'}</p>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <Table className="results-table w-full text-sm">
                      <TableHeader><TableRow className="bg-gray-100 hover:bg-gray-100"><TableHead className="py-2 px-2 font-bold text-gray-700 min-w-[150px]">SUBJECT</TableHead><TableHead className="text-center py-2 px-2 font-bold text-gray-700">SCORE</TableHead><TableHead className="text-center py-2 px-2 font-bold text-gray-700">GRADE</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {examSubjects.map(subject => {
                          const studentScore = studentToPrint.scores[subject.id];
                          return (
                            <TableRow key={subject.id} className="even:bg-gray-50"><TableCell className="font-semibold py-1 px-2 text-gray-800">{subject.subjectName}</TableCell><TableCell className="text-center font-bold py-1 px-2">{studentScore?.score ?? '-'}</TableCell><TableCell className="text-center font-bold py-1 px-2">{studentScore?.grade || '-'}</TableCell></TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  
                  <div className="summary-section text-md mt-4 font-semibold text-center bg-gray-100 rounded-lg py-2 px-4 grid grid-cols-3 gap-4">
                    <div><p className="text-gray-700 text-xs uppercase">TOTAL MARKS</p><p className="font-bold text-lg text-black">N/A</p></div>
                    <div><p className="text-gray-700 text-xs uppercase">AGGREGATES</p><p className="font-bold text-lg text-black">{studentToPrint.aggregate ?? 'N/A'}</p></div>
                    <div><p className="text-gray-700 text-xs uppercase">DIVISION</p><p className="font-bold text-lg text-black">{studentToPrint.division || 'N/A'}</p></div>
                  </div>
                  
                  <div className="footer-section text-xs mt-4 pt-4">
                    <div className="signature-area mt-8 flex justify-between">
                      <div><div className="w-48 border-t border-gray-400 mt-8"></div><p className="pt-1">Class Teacher's Signature</p></div>
                      <div><div className="w-48 border-t border-gray-400 mt-8"></div><p className="pt-1">Principal's Signature</p></div>
                    </div>
                    <p className="text-center mt-6 text-gray-500">Report generated on: {format(new Date(), 'PPpp')}</p>
                  </div>
                </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
