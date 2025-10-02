// src/app/school/dashboard/[schoolId]/reports/finance/fee-item-billing/page.tsx
"use client";

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getSchoolById, getSchoolSubcollectionItems, getFeeTransactions } from '@/services/schoolService'; // Assuming getFeeTransactions fetches all transactions
import type { School, FeeItem, FeeTransaction, SchoolAcademicYear, SchoolClass } from '@/types/school'; // Added SchoolClass
import { firestore } from '@/config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';


import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from '@/hooks/use-toast';
import { Loader2, BookOpen, Filter, ShieldAlert, Tag } from 'lucide-react';

const ALL_SENTINEL = "_ALL_";

export default function FeeItemBillingReportPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [allFeeItems, setAllFeeItems] = useState<FeeItem[]>([]);
  const [allDebitTransactions, setAllDebitTransactions] = useState<FeeTransaction[]>([]);
  const [academicYears, setAcademicYears] = useState<SchoolAcademicYear[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminForSchool, setIsAdminForSchool] = useState(false);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>(ALL_SENTINEL);
  const [selectedTerm, setSelectedTerm] = useState<string>(ALL_SENTINEL);

  useEffect(() => {
    if (authLoading || !user || !schoolId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const fetchedSchool = await getSchoolById(schoolId);
        if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
          toast({ variant: "destructive", title: "Access Denied" });
          router.push(`/school/dashboard/${schoolId}`);
          setIsAdminForSchool(false); return;
        }
        setSchool(fetchedSchool); setIsAdminForSchool(true);

        // Fetch all fee items and academic years
        const [feeItemsData, academicYearsData] = await Promise.all([
          getSchoolSubcollectionItems<FeeItem>(schoolId, 'feeItems'),
          getSchoolSubcollectionItems<SchoolAcademicYear>(schoolId, 'schoolAcademicYears'),
        ]);
        setAllFeeItems(feeItemsData.sort((a,b) => (a.name || "").localeCompare(b.name || "")));
        setAcademicYears(academicYearsData.sort((a,b) => (b.year || "").localeCompare(a.year || "")));
        
        // Fetch all debit transactions for ALL students
        // This can be a very large query for schools with many students & transactions
        const studentsSnapshot = await getDocs(query(collection(firestore, `schools/${schoolId}/students`)));
        let allDebits: FeeTransaction[] = [];
        for (const studentDoc of studentsSnapshot.docs) {
            const studentTransactions = await getFeeTransactions(schoolId, studentDoc.id);
            allDebits.push(...studentTransactions.filter(tx => tx.type === 'debit'));
        }
        setAllDebitTransactions(allDebits);

      } catch (error) {
        console.error("Error fetching report data:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load report data." });
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [schoolId, user, authLoading, router, toast]);

  const reportData = useMemo(() => {
    if (isLoading) return [];

    return allFeeItems
      .filter(item => 
        (selectedAcademicYearId === ALL_SENTINEL || item.academicYearId === selectedAcademicYearId) &&
        (selectedTerm === ALL_SENTINEL || item.term === selectedTerm)
      )
      .map(item => {
        const totalBilled = allDebitTransactions
          .filter(tx => 
              tx.feeItemId === item.id &&
              tx.academicYearId === item.academicYearId && // Match the fee item's specific academic context
              tx.term === item.term                        // Match the fee item's specific term
          )
          .reduce((sum, tx) => sum + tx.amount, 0);
        
        const yearName = academicYears.find(ay => ay.id === item.academicYearId)?.year || 'N/A';

        return {
          id: item.id,
          name: item.name,
          academicYear: yearName,
          term: item.term || 'N/A',
          totalBilled,
          isCompulsory: item.isCompulsory, // Include for display
          classAmounts: item.classAmounts, // Include for reference
        };
      });
  }, [allFeeItems, allDebitTransactions, selectedAcademicYearId, selectedTerm, academicYears, isLoading]);

  const uniqueTermsForFilter = useMemo(() => {
    const terms = new Set(allFeeItems.map(item => item.term).filter(Boolean));
    return Array.from(terms).sort();
  }, [allFeeItems]);


  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-15rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  if (!isAdminForSchool && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar bg-background p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">You do not have permission to view this report.</p>
        <Button onClick={() => router.push(`/school/dashboard/${schoolId}`)} variant="outline">Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex-grow">
              <CardTitle className="text-2xl flex items-center"><BookOpen className="mr-3 h-6 w-6 text-primary"/>Fee Item Billing Report</CardTitle>
              <CardDescription>Summary of total amounts billed for each fee item in {school?.name || 'the school'}.</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <div className="w-full sm:w-auto sm:min-w-[200px]">
                <Select
                  value={selectedAcademicYearId}
                  onValueChange={(value) => setSelectedAcademicYearId(value)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <Filter className="mr-2 h-4 w-4 text-muted-foreground"/>
                    <SelectValue placeholder="Filter by Academic Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_SENTINEL}>All Academic Years</SelectItem>
                    {academicYears.map(ay => (
                      <SelectItem key={ay.id} value={ay.id}>{ay.year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-auto sm:min-w-[150px]">
                <Select
                  value={selectedTerm}
                  onValueChange={(value) => setSelectedTerm(value)}
                  disabled={uniqueTermsForFilter.length === 0}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <Filter className="mr-2 h-4 w-4 text-muted-foreground"/>
                    <SelectValue placeholder="Filter by Term" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_SENTINEL}>All Terms</SelectItem>
                    {uniqueTermsForFilter.map(term => (
                      <SelectItem key={term} value={term!}>{term}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {reportData.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Tag className="h-12 w-12 mx-auto mb-3"/>
              <p>No fee items or billing data match your criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fee Item Name</TableHead>
                    <TableHead>Academic Year</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead className="text-right">Total Billed (UGX)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-xs">{item.name}</TableCell>
                      <TableCell className="text-xs">{item.academicYear}</TableCell>
                      <TableCell className="text-xs">{item.term}</TableCell>
                      <TableCell className="text-right text-xs font-semibold">
                        {item.totalBilled.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
