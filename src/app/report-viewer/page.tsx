// src/app/report-viewer/page.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Search, FileText, AlertTriangle } from 'lucide-react';
import { firestore } from '@/config/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

interface PublishedReport {
  studentName: string;
  configName: string;
  // ... and all other fields from the report document
}

export default function ReportViewerPage() {
  const [regNo, setRegNo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<any | null>(null); // Use 'any' for now, can be typed later
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regNo.trim()) {
      setError("Please enter a registration number.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setReport(null);
    try {
      const reportsRef = collection(firestore, 'publishedReports');
      const q = query(reportsRef, where('studentRegNo', '==', regNo.trim()), limit(1));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError("No published report found for this registration number. Please check the number or contact the school.");
      } else {
        const reportData = querySnapshot.docs[0].data();
        setReport(reportData);
      }
    } catch (err) {
      console.error("Error searching for report:", err);
      setError("An error occurred while searching. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen-minus-navbar flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl text-primary">Student Report Viewer</CardTitle>
          <CardDescription>Enter the student's registration number to view their latest published report.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSearch}>
          <CardContent className="space-y-4">
            <Input
              id="registrationNumber"
              placeholder="Enter registration number..."
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
              disabled={isLoading}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="animate-spin mr-2"/> : <Search className="mr-2"/>}
              Find Report
            </Button>
          </CardContent>
        </form>
        <CardFooter>
          {error && (
            <div className="text-destructive text-sm p-3 bg-destructive/10 rounded-md w-full flex items-center gap-2">
              <AlertTriangle className="h-5 w-5"/>
              {error}
            </div>
          )}
          {report && (
            <Card className="w-full bg-green-50 border-green-200">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-green-800">
                        <FileText/>Report Found
                    </CardTitle>
                    <CardDescription className="text-green-700">
                        Displaying report for {report.studentName}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p><strong>Report:</strong> {report.configName}</p>
                    <p><strong>Division:</strong> {report.division || 'N/A'}</p>
                    <p><strong>Aggregate:</strong> {report.aggregate ?? 'N/A'}</p>
                    {/* Add more detailed display logic here later */}
                </CardContent>
            </Card>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
