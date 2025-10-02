// src/app/school/dashboard/[schoolId]/academics/release-reports/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services';
import type { School, ReportConfiguration, Student, SchoolClass } from '@/types/school';
import { publishAndNotify } from './actions';
import { Loader2, Send, Filter, Users, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function ReleaseReportsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [reportConfigs, setReportConfigs] = useState<ReportConfiguration[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);

  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  
  const selectedConfig = useMemo(() => reportConfigs.find(c => c.id === selectedConfigId), [reportConfigs, selectedConfigId]);

  const applicableStudents = useMemo(() => {
    if (!selectedConfig) return [];
    // A config applies to all classes if its sources are generic. For now, assume it applies to all.
    // Logic can be refined if configs are tied to specific classes.
    return allStudents.filter(s => s.status === 'Active');
  }, [selectedConfig, allStudents]);

  const fetchInitialData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const [configs, students, classes] = await Promise.all([
        getSchoolSubcollectionItems<ReportConfiguration>(schoolId, 'reportConfigurations'),
        getSchoolSubcollectionItems<Student>(schoolId, 'students'),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
      ]);
      setReportConfigs(configs);
      setAllStudents(students);
      setSchoolClasses(classes);
    } catch (error) { toast({ variant: "destructive", title: "Error", description: "Could not load required data." }); }
    finally { setIsLoading(false); }
  }, [schoolId, user, toast]);

  useEffect(() => { fetchInitialData(); }, [fetchInitialData]);

  const handlePublish = async () => {
    if (!selectedConfig) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a report configuration to publish.' });
      return;
    }
    if (applicableStudents.length === 0) {
      toast({ variant: 'destructive', title: 'No Students', description: 'There are no active students to generate reports for.' });
      return;
    }

    if (!window.confirm(`Are you sure you want to publish the "${selectedConfig.name}" report for ${applicableStudents.length} students and send SMS notifications? This action cannot be undone.`)) {
      return;
    }
    
    setIsProcessing(true);
    toast({ title: "Publishing Reports...", description: "This may take a few moments. Please wait." });

    try {
      const result = await publishAndNotify({ configId: selectedConfigId, schoolId });
      if (result.success) {
        toast({
          title: "Reports Published Successfully!",
          description: `Generated ${result.reportsGenerated} reports and sent ${result.smsSent} SMS notifications.`,
          duration: 7000
        });
      } else {
        throw new Error(result.error || "An unknown error occurred during publishing.");
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Publishing Failed', description: error.message, duration: 10000 });
      console.error("Publishing error:", error);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const getClassName = (classId: string) => schoolClasses.find(c => c.id === classId)?.class || 'N/A';

  if (isLoading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><Send className="mr-3 h-6 w-6 text-primary"/>Release Student Reports</CardTitle>
          <CardDescription>Publish final accumulated reports for students and notify their parents via SMS.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Important Action</AlertTitle>
            <AlertDescription>
              Publishing a report is a final action. It will make the selected report configuration publicly accessible to parents via the school website and send out SMS notifications. Ensure all marks are finalized before proceeding.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Report Configuration to Publish</label>
            <Select value={selectedConfigId} onValueChange={setSelectedConfigId} disabled={isProcessing}>
              <SelectTrigger><SelectValue placeholder="Select a report configuration..." /></SelectTrigger>
              <SelectContent>
                {reportConfigs.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      {selectedConfig && (
        <Card>
          <CardHeader>
            <CardTitle>Preview of Students for "{selectedConfig.name}"</CardTitle>
            <CardDescription>
              The following {applicableStudents.length} active students will have their reports published.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72 border rounded-md">
                <Table>
                    <TableHeader className="sticky top-0 bg-muted/50">
                        <TableRow>
                            <TableHead>Student Name</TableHead>
                            <TableHead>Registration No.</TableHead>
                            <TableHead>Class</TableHead>
                            <TableHead>Guardian Phone</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {applicableStudents.map(student => (
                            <TableRow key={student.id}>
                                <TableCell>{student.firstName} {student.lastName}</TableCell>
                                <TableCell>{student.studentRegistrationNumber}</TableCell>
                                <TableCell>{getClassName(student.classId)}</TableCell>
                                <TableCell>{student.guardianPhone || 'N/A'}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </ScrollArea>
          </CardContent>
          <CardFooter>
            <Button onClick={handlePublish} disabled={isProcessing || !selectedConfigId || applicableStudents.length === 0}>
              {isProcessing ? <Loader2 className="animate-spin mr-2"/> : <Send className="mr-2"/>}
              {isProcessing ? "Publishing, Please Wait..." : `Publish & Notify ${applicableStudents.length} Students`}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
