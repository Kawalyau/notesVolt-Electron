
// src/app/school/dashboard/[schoolId]/payroll/run/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolSubcollectionItems } from '@/services';
import type { Teacher, StaffSalaryItem } from '@/types/school';
import { Timestamp } from 'firebase/firestore';
import { format, parse, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, HandCoins, Users, Banknote, FileText } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface PayslipData {
    teacherId: string;
    teacherName: string;
    baseSalary: number;
    totalAllowances: number;
    totalDeductions: number;
    netPay: number;
    status: 'Pending' | 'Paid'; // Simplified for now
}

export default function RunPayrollPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const { user } = useAuth();
  const { toast } = useToast();

  const [allStaff, setAllStaff] = useState<Teacher[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [periodName, setPeriodName] = useState('');
  const [payslipsForPeriod, setPayslipsForPeriod] = useState<PayslipData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const fetchInitialData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const staff = await getSchoolSubcollectionItems<Teacher>(schoolId, 'teachers', [{field: 'status', op: '==', value: 'Active'}]);
      setAllStaff(staff);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load staff data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);
  
  const handleGeneratePayslips = useCallback(() => {
    if (!periodName) {
        toast({variant: "destructive", title: "Missing Information", description: "Please provide a name for the payment period (e.g., August 2024)."});
        return;
    }
    
    // Attempt to parse a date from the period name to determine the month
    const parsedDate = parse(periodName, 'MMMM yyyy', new Date());
    if (isNaN(parsedDate.getTime())) {
        toast({variant: "destructive", title: "Invalid Period Name", description: "Could not determine a valid month from the period name. Please use a format like 'August 2024'."});
        return;
    }

    setIsGenerating(true);
    const periodStartDate = startOfMonth(parsedDate);
    const periodEndDate = endOfMonth(parsedDate);

    const activeStaffForPeriod = allStaff.filter(staff => {
      const contractStart = staff.contractStartDate ? (staff.contractStartDate as Timestamp).toDate() : null;
      const contractEnd = staff.contractEndDate ? (staff.contractEndDate as Timestamp).toDate() : null;
      
      if (!contractStart) return false; // Must have a start date to be considered

      // The contract is active if it started before the period ends, AND
      // it either has no end date OR it ends after the period starts.
      const isActive = contractStart <= periodEndDate && (!contractEnd || contractEnd >= periodStartDate);
      return isActive;
    });

    const generatedPayslips = activeStaffForPeriod.map(staff => {
        const baseSalary = staff.baseSalary || 0;
        const totalAllowances = staff.recurringItems?.filter(i => i.type === 'Allowance').reduce((sum, i) => sum + i.amount, 0) || 0;
        const totalDeductions = staff.recurringItems?.filter(i => i.type === 'Deduction').reduce((sum, i) => sum + i.amount, 0) || 0;
        const grossPay = baseSalary + totalAllowances;
        const netPay = grossPay - totalDeductions;
        
        return {
            teacherId: staff.id,
            teacherName: `${staff.firstName} ${staff.lastName}`,
            baseSalary,
            totalAllowances,
            totalDeductions,
            netPay,
            status: 'Pending'
        } as PayslipData;
    });

    setPayslipsForPeriod(generatedPayslips);
    setIsGenerating(false);
    toast({title: "Payslips Generated", description: `Generated ${generatedPayslips.length} payslips for ${periodName}.`})

  }, [periodName, allStaff, toast]);
  

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <HandCoins className="mr-3 h-6 w-6 text-primary"/>
            Run Staff Payments
          </CardTitle>
          <CardDescription>
            Enter a payment period (e.g., "August 2024") to generate payslips for all staff with active contracts in that month.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className='flex items-end gap-4'>
                <div className='flex-grow max-w-sm'>
                    <Label>Payment Period Name*</Label>
                    <Input 
                        value={periodName} 
                        onChange={(e) => setPeriodName(e.target.value)}
                        placeholder="e.g., August 2024"
                    />
                </div>
                 <Button onClick={handleGeneratePayslips} disabled={isGenerating}>
                    {isGenerating ? <Loader2 className="animate-spin mr-2"/> : <Users className="mr-2 h-4 w-4"/>}
                    Generate
                </Button>
            </div>
            {payslipsForPeriod.length > 0 && (
                <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-2">Generated Payslips for {periodName}</h3>
                    <div className="border rounded-md">
                        <Table>
                        <TableHeader><TableRow>
                            <TableHead>Staff Name</TableHead>
                            <TableHead className="text-right">Base Salary</TableHead>
                            <TableHead className="text-right">Allowances</TableHead>
                            <TableHead className="text-right">Deductions</TableHead>
                            <TableHead className="text-right font-bold">Net Pay</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                        {payslipsForPeriod.map(p => (
                            <TableRow key={p.teacherId}>
                                <TableCell>{p.teacherName}</TableCell>
                                <TableCell className="text-right">{p.baseSalary.toLocaleString()}</TableCell>
                                <TableCell className="text-right">{p.totalAllowances.toLocaleString()}</TableCell>
                                <TableCell className="text-right text-destructive">({p.totalDeductions.toLocaleString()})</TableCell>
                                <TableCell className="text-right font-bold">{p.netPay.toLocaleString()}</TableCell>
                                <TableCell>{p.status}</TableCell>
                                <TableCell className="text-right"><Button variant="outline" size="xs">Record Payment</Button></TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                        </Table>
                    </div>
                     <CardFooter className="mt-4 flex justify-end">
                        <Button>Record All as Paid</Button>
                    </CardFooter>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
