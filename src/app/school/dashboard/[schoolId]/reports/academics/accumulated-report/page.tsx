
// src/app/school/dashboard/[schoolId]/reports/academics/accumulated-report/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, getStudentExamProfile } from '@/services';
import type { School, ReportConfiguration, Student, SchoolClass, Exam, StudentExamProfile, GradingScale, AppTimestamp, ExamSubject as ExamSubjectType } from '@/types/school';
import { Loader2, BarChart3, Filter, Printer, Settings2, FileText, Sparkles, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { generateReportCardComments, type ReportCardCommentsInput } from '@/ai/flows/generate-report-card-comments-flow';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { where } from 'firebase/firestore';

interface AccumulatedReportRow {
  student: Student;
  scores: Record<string, { // key is subjectId
    finalScore?: number | null,
    grade?: string | null,
    value?: number | null,
    sourceScores: { examId: string; examName: string; score: number | null; }[]
  }>;
  sourceExamResults: Record<string, { // key is examId
      aggregate?: number | null;
      division?: string | null;
  }>;
  finalAggregate?: number | null;
  finalDivision?: string | null;
  totalMarks?: number | null;
  principalComment?: string;
  classTeacherComment?: string;
}

const getGradeBadgeVariant = (grade: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (!grade) return 'outline';
  const gradeUpper = grade.toUpperCase();
  if (gradeUpper.startsWith('D')) return 'default'; // Distinctions
  if (gradeUpper.startsWith('C')) return 'secondary'; // Credits
  if (gradeUpper.startsWith('P')) return 'outline'; // Passes
  if (gradeUpper.startsWith('F')) return 'destructive'; // Fails
  return 'outline';
};

export default function AccumulatedReportPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params.schoolId as string;
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportConfigs, setReportConfigs] = useState<ReportConfiguration[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);
  const [school, setSchool] = useState<School | null>(null);

  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  const [reportData, setReportData] = useState<AccumulatedReportRow[]>([]);
  const [allSourceExamsSubjects, setAllSourceExamsSubjects] = useState<Array<ExamSubjectType & {examId: string}>>([]);
  const [uniqueSubjectsForReport, setUniqueSubjectsForReport] = useState<Array<{id: string, name: string}>>([]);
  const [isGeneratingComments, setIsGeneratingComments] = useState(false);
  
  const printAreaRef = useRef<HTMLDivElement>(null);
  
  const fetchInitialData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const [configs, classes, scales, schoolData] = await Promise.all([
        getSchoolSubcollectionItems<ReportConfiguration>(schoolId, 'reportConfigurations'),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        getSchoolSubcollectionItems<GradingScale>(schoolId, 'gradingScales'),
        getSchoolById(schoolId),
      ]);
      setReportConfigs(configs);
      setSchoolClasses(classes.sort((a,b) => (a.class || "").localeCompare(b.class || "")));
      setGradingScales(scales);
      setSchool(schoolData);
    } catch (error) { 
      toast({ 
        variant: "destructive", 
        title: "Error Loading Data", 
        description: "Could not load required configuration data. Please try again." 
      }); 
    }
    finally { setIsLoading(false); }
  }, [schoolId, user, toast]);

  useEffect(() => { fetchInitialData(); }, [fetchInitialData]);
  
  const selectedConfig = useMemo(() => reportConfigs.find(c => c.id === selectedConfigId), [selectedConfigId, reportConfigs]);

  useEffect(() => {
    const fetchAllExamSubjects = async () => {
        if (!selectedConfig) {
            setAllSourceExamsSubjects([]);
            setUniqueSubjectsForReport([]);
            return;
        }
        
        const subjects: Array<ExamSubjectType & {examId: string}> = [];
        for(const source of selectedConfig.sources) {
            const sourceSubjects = await getSchoolSubcollectionItems<ExamSubjectType>(schoolId, `exams/${source.examId}/subjects`);
            subjects.push(...sourceSubjects.map(s => ({ ...s, examId: source.examId })));
        }
        setAllSourceExamsSubjects(subjects);
        
        const subjectMap = new Map<string, string>();
        subjects.forEach(s => {
          if (!subjectMap.has(s.subjectId)) {
            subjectMap.set(s.subjectId, s.subjectName);
          }
        });
        setUniqueSubjectsForReport(Array.from(subjectMap, ([id, name]) => ({ id, name })).sort((a,b) => a.name.localeCompare(b.name)));
    };
    fetchAllExamSubjects();
  }, [selectedConfig, schoolId]);

  const generateReport = useCallback(async () => {
    if (!selectedConfigId || !selectedClassId) {
        setReportData([]);
        return;
    }
    const config = reportConfigs.find(c => c.id === selectedConfigId);
    if (!config) return;
    const scale = gradingScales.find(s => s.id === config.gradingScaleId);
    if (!scale) { 
      toast({ 
        variant: "destructive", 
        title: "Configuration Error", 
        description: "The grading scale for this configuration could not be found. Please check your settings." 
      }); 
      return; 
    }
    
    setIsGenerating(true);
    setReportData([]); 
    try {
      const studentQueryConstraints = [where('classId', '==', selectedClassId), where('status', '==', 'Active')];
      const students = await getSchoolSubcollectionItems<Student>(schoolId, 'students', studentQueryConstraints);

      if (students.length === 0) {
        toast({
          title: "No Students Found", 
          description: `There are no active students in the selected class.`,
        });
        setIsGenerating(false);
        return;
      }
      
      const studentProfilesData = await Promise.all(
        students.map(async (student) => {
          const profiles: Record<string, StudentExamProfile | null> = {};
          for (const source of config.sources) {
            profiles[source.examId] = await getStudentExamProfile(schoolId, source.examId, student.id);
          }
          return { student, profiles };
        })
      );

      const data: AccumulatedReportRow[] = studentProfilesData.map(({ student, profiles }) => {
        const finalScores: AccumulatedReportRow['scores'] = {};
        const sourceExamResults: AccumulatedReportRow['sourceExamResults'] = {};
        let finalAggregate = 0;
        let totalMarks = 0;
        let missedCoreSubject = false;
        
        // Pre-calculate source exam results
        config.sources.forEach(source => {
            const profile = profiles[source.examId];
            if (profile) {
                sourceExamResults[source.examId] = { aggregate: profile.aggregate, division: profile.division };
            }
        });

        uniqueSubjectsForReport.forEach(subject => {
            const isCore = allSourceExamsSubjects.some(s => s.subjectId === subject.id && s.isCoreSubject);
            
            let totalWeightedScore = 0;
            let totalWeightUsed = 0;
            const sourceScores: { examId: string; examName: string; score: number | null; }[] = [];
            let hasScoreForThisSubject = false;

            config.sources.forEach(source => {
                const examSubjectForMaxScore = allSourceExamsSubjects.find(es => es.examId === source.examId && es.subjectId === subject.id);
                
                let sourceScoreValue: number | null = null;
                if (examSubjectForMaxScore && profiles[source.examId]) {
                  const scoreInfo = profiles[source.examId]?.scores.find(s => s.examSubjectId === examSubjectForMaxScore.id);
                  sourceScoreValue = scoreInfo?.score ?? null;
                  
                  const maxScore = examSubjectForMaxScore?.maxScore;
                  if (sourceScoreValue !== null && maxScore && maxScore > 0) {
                      hasScoreForThisSubject = true;
                      const normalizedScore = (sourceScoreValue / maxScore) * 100;
                      totalWeightedScore += normalizedScore * (source.weight / 100);
                      totalWeightUsed += source.weight;
                  }
                }
                sourceScores.push({ examId: source.examId, examName: source.examName, score: sourceScoreValue });
            });
            
            if (isCore && !hasScoreForThisSubject) {
                missedCoreSubject = true;
            }

            if (totalWeightUsed > 0) {
                const finalScore = totalWeightUsed < 100 && totalWeightUsed > 0 ? (totalWeightedScore / totalWeightUsed) * 100 : totalWeightedScore;
                
                let gradeInfo: { grade: string, value: number } | null = null;
                const grade = scale.grades.find(g => finalScore >= g.lowerBound && finalScore <= g.upperBound);
                if (grade) {
                    if (grade.value >= scale.failValue) missedCoreSubject = true;
                    gradeInfo = { grade: grade.name, value: grade.value };
                }

                finalScores[subject.id] = { 
                  finalScore: Math.round(finalScore), 
                  grade: gradeInfo?.grade, 
                  value: gradeInfo?.value, 
                  sourceScores 
                };
                
                if (isCore) {
                    if (gradeInfo) finalAggregate += gradeInfo.value;
                }
                totalMarks += Math.round(finalScore);
            } else {
                 finalScores[subject.id] = { finalScore: null, grade: null, value: null, sourceScores };
            }
        });
        
        let finalDivision: string | null = null;
        if (missedCoreSubject) {
            finalDivision = 'X';
        } else if (uniqueSubjectsForReport.some(sub => allSourceExamsSubjects.some(s => s.subjectId === sub.id && s.isCoreSubject)) && finalAggregate > 0) {
            finalDivision = scale.divisions.find(d => finalAggregate >= d.minAggregate && finalAggregate <= d.maxAggregate)?.name || 'Ungraded';
        }

        return { 
          student, 
          scores: finalScores, 
          sourceExamResults,
          finalAggregate: uniqueSubjectsForReport.some(sub => allSourceExamsSubjects.some(s => s.subjectId === sub.id && s.isCoreSubject)) ? finalAggregate : null, 
          finalDivision, 
          totalMarks 
        };
      });
      setReportData(data.sort((a,b) => (a.finalAggregate || 99) - (b.finalAggregate || 99)));
    } catch (error) { 
      toast({ 
        variant: "destructive", 
        title: "Report Generation Failed", 
        description: "An error occurred while generating the reports. Please check your data and try again." 
      }); 
      console.error("Report generation error:", error); 
    }
    finally { setIsGenerating(false); }
  }, [selectedConfigId, selectedClassId, reportConfigs, gradingScales, schoolId, toast, allSourceExamsSubjects, uniqueSubjectsForReport]);

  const handleGenerateComments = async () => {
    if (reportData.length === 0) return;
    setIsGeneratingComments(true);
    toast({
      title: "Generating AI Comments",
      description: `Please wait while we generate personalized comments for ${reportData.length} students...`,
    });
    
    try {
      const studentDataForApi: ReportCardCommentsInput['students'] = reportData.map((row) => {
        const subjectsPerformance = Object.entries(row.scores)
          .map(([subjectId, scoreData]) => {
              const subject = uniqueSubjectsForReport.find(s => s.id === subjectId);
              return { 
                subjectName: subject?.name || 'Unknown', 
                grade: scoreData.grade || 'N/A',
              };
          });

        return {
          studentId: row.student.id,
          studentName: `${row.student.firstName} ${row.student.lastName}`,
          division: row.finalDivision || 'N/A',
          aggregate: row.finalAggregate || 0,
          subjectsPerformance,
        };
      });

      const result = await generateReportCardComments({ students: studentDataForApi });
      
      const commentsMap = new Map(result.comments.map(c => [c.studentId, c]));

      setReportData(prevData =>
        prevData.map(row => {
          const comments = commentsMap.get(row.student.id);
          return comments ? {
            ...row,
            principalComment: comments.principalComment,
            classTeacherComment: comments.classTeacherComment,
          } : row;
        })
      );

      toast({
        title: "Comments Generated Successfully",
        description: "Personalized comments have been added to all student reports.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Comment Generation Failed",
        description: `An error occurred while generating comments: ${error.message}`
      });
    } finally {
      setIsGeneratingComments(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-area, #printable-area * { visibility: visible; }
          #printable-area { position: absolute; left: 0; top: 0; width: 100%; }
          .report-card-container { 
            page-break-after: always !important; 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="space-y-6 no-print">
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                <div>
                    <CardTitle className="text-2xl flex items-center"><FileText className="mr-3 h-6 w-6 text-primary"/>Accumulated Report Cards</CardTitle>
                    <CardDescription>Generate professional, printable report cards based on your saved configurations.</CardDescription>
                </div>
                 <div className="flex flex-wrap gap-2">
                    <Button onClick={handleGenerateComments} disabled={reportData.length === 0 || isGeneratingComments} variant="outline">
                        {isGeneratingComments ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Sparkles className="h-4 w-4 mr-2"/>}
                        AI Comments
                    </Button>
                    <Button onClick={handlePrint} disabled={reportData.length === 0}>
                        <Printer className="mr-2 h-4 w-4"/> Print Reports
                    </Button>
                </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t items-end">
              <div className="flex-grow"><Label>Report Configuration</Label><Select value={selectedConfigId} onValueChange={setSelectedConfigId}><SelectTrigger><SelectValue placeholder="Select configuration..." /></SelectTrigger><SelectContent>{reportConfigs.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="flex-grow"><Label>Class</Label><Select value={selectedClassId} onValueChange={setSelectedClassId} disabled={!selectedConfigId || schoolClasses.length === 0}><SelectTrigger><SelectValue placeholder="Select class..." /></SelectTrigger><SelectContent>{schoolClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.class}</SelectItem>)}</SelectContent></Select></div>
              <Button onClick={generateReport} disabled={isGenerating || isLoading || !selectedConfigId || !selectedClassId} className="w-full sm:w-auto">
                {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <BarChart3 className="h-4 w-4 mr-2"/>}
                Generate
              </Button>
            </div>
          </CardHeader>
        </Card>
      </div>

      <div id="printable-area">
        {isGenerating && <div className="flex flex-col items-center justify-center p-12 space-y-4 no-print"><Loader2 className="animate-spin h-12 w-12 text-primary"/><p className="text-muted-foreground">Generating reports. This may take a moment...</p></div>}
          {!isGenerating && reportData.length > 0 ? (
            <div className="space-y-8">
              {reportData.map(row => (
                <div key={row.student.id} className="report-card-container">
                  <div className="report-card bg-white p-6 border-2 border-double border-black shadow-lg" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                    <div className="report-content" style={{position: 'relative', zIndex: 1}}>
                      <div className="report-header text-center mb-4">
                        {school?.badgeImageUrl && (
                          <Image src={school.badgeImageUrl} alt="School Logo" width={80} height={80} className="mx-auto" data-ai-hint="school logo"/>
                        )}
                        <h2 className="text-3xl font-bold uppercase tracking-wide text-black">{school?.name}</h2>
                        <p className="text-sm italic">{school?.motto}</p>
                        <h3 className="text-xl font-semibold text-gray-800 mt-2">{selectedConfig?.name || 'Accumulated Report'}</h3>
                        <p className="text-md text-gray-600 mt-1">{selectedConfig?.term} &bull; {format(new Date(), 'yyyy')}</p>
                      </div>
                      
                      <div className="student-details text-sm my-4 border-y-2 border-black py-2 grid grid-cols-2 gap-x-4 gap-y-1">
                        <p><strong>NAME:</strong> {row.student.firstName} {row.student.lastName}</p>
                        <p><strong>REG NO:</strong> {row.student.studentRegistrationNumber}</p>
                        <p><strong>CLASS:</strong> {schoolClasses.find(c=>c.id === row.student.classId)?.class || 'N/A'}</p>
                        <p><strong>SchoolPay ID:</strong> {row.student.schoolPayStudentId || 'N/A'}</p>
                      </div>
                      
                      <div className="overflow-x-auto">
                        <Table className="results-table w-full text-sm">
                          <TableHeader><TableRow className="bg-gray-100 hover:bg-gray-100"><TableHead className="py-2 px-2 font-bold text-gray-700 min-w-[150px]">SUBJECT</TableHead>{selectedConfig?.sources.map(source => (<TableHead key={source.examId} className="text-center py-2 px-2 font-bold text-gray-700">{source.examName} ({source.weight}%)</TableHead>))}<TableHead className="text-center py-2 px-2 font-bold text-gray-700">FINAL MARK</TableHead><TableHead className="text-center py-2 px-2 font-bold text-gray-700">GRADE</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {uniqueSubjectsForReport.map(subject => {
                              const studentScore = row.scores[subject.id];
                              return (
                                <TableRow key={subject.id} className="even:bg-gray-50">
                                  <TableCell className="font-semibold py-1 px-2 text-gray-800">{subject.name}</TableCell>
                                  {selectedConfig?.sources.map(source => {
                                    const sourceScore = studentScore?.sourceScores.find(ss => ss.examId === source.examId);
                                    return <TableCell key={source.examId} className="text-center py-1 px-2">{sourceScore?.score !== null && sourceScore?.score !== undefined ? sourceScore?.score : '-'}</TableCell>;
                                  })}
                                  <TableCell className="text-center font-bold py-1 px-2">{studentScore?.finalScore ?? '-'}</TableCell>
                                  <TableCell className="text-center font-bold py-1 px-2">{studentScore?.grade || '-'}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                      
                       <Table className="summary-table w-full text-sm mt-4 border">
                          <TableHeader>
                            <TableRow>
                              <TableHead>PERFORMANCE SUMMARY</TableHead>
                              <TableHead className="text-center">AGGREGATE</TableHead>
                              <TableHead className="text-center">DIVISION</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedConfig?.sources.map(source => {
                              const result = row.sourceExamResults[source.examId];
                              return (
                                <TableRow key={source.examId}>
                                  <TableCell>{source.examName}</TableCell>
                                  <TableCell className="text-center">{result?.aggregate ?? 'N/A'}</TableCell>
                                  <TableCell className="text-center">{result?.division ?? 'N/A'}</TableCell>
                                </TableRow>
                              );
                            })}
                            <TableRow className="font-bold bg-gray-100">
                              <TableCell>Final Result</TableCell>
                              <TableCell className="text-center">{row.finalAggregate ?? 'N/A'}</TableCell>
                              <TableCell className="text-center">{row.finalDivision || 'N/A'}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>

                      <div className="comments-section text-sm mt-4 space-y-3">
                        <div><strong className="font-semibold text-gray-800">Class Teacher's Comment:</strong><div className="comment-box text-gray-700 p-2 border-b border-dotted border-gray-400 min-h-[40px]">{row.classTeacherComment || ""}</div></div>
                        <div><strong className="font-semibold text-gray-800">Principal's Comment:</strong><div className="comment-box text-gray-700 p-2 border-b border-dotted border-gray-400 min-h-[40px]">{row.principalComment || ""}</div></div>
                      </div>

                      <div className="footer-section text-xs mt-4 pt-4">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div><p><strong>Next term begins:</strong> 15 September</p></div>
                        </div>
                        <div className="signature-area mt-8 flex justify-between">
                          <div><div className="w-48 border-t border-gray-400 mt-8"></div><p className="pt-1">Class Teacher's Signature</p></div>
                          <div><div className="w-48 border-t border-gray-400 mt-8"></div><p className="pt-1">Principal's Signature</p></div>
                        </div>
                        <p className="text-center mt-6 text-gray-500">Report generated on: {format(new Date(), 'PPpp')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
             <div className="no-print"><Card className="border-0 shadow-sm"><CardContent className="flex flex-col items-center justify-center p-12 text-center"><FileText className="h-12 w-12 text-gray-400 mb-4" /><h3 className="text-lg font-medium text-gray-700 mb-2">{selectedConfigId && selectedClassId ? "No report data available" : "Ready to generate reports"}</h3><p className="text-gray-500 max-w-md">{selectedConfigId && selectedClassId ? "No students or marks were found for the selected configuration and class." : "Please select a report configuration and a class to begin."}</p></CardContent></Card></div>
          )}
      </div>
    </>
  );
}
