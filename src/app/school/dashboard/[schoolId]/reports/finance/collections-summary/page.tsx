
// src/app/school/dashboard/[schoolId]/reports/finance/collections-summary/page.tsx
"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById } from '@/services';
import type { School } from '@/types/school';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';
import { getDailyCollections } from './actions';
import type { DailyCollectionData } from './actions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, BarChart, CalendarDays, Download, Printer } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Bar, BarChart as RechartsBarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import Image from 'next/image';

export default function CollectionsSummaryReportPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [school, setSchool] = useState<School | null>(null);
  const [reportData, setReportData] = useState<DailyCollectionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const fetchReportData = useCallback(async () => {
    if (!user || !schoolId || !dateRange?.from || !dateRange?.to) {
      if (!dateRange?.from || !dateRange?.to) setReportData([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" });
        router.push(`/school/dashboard/${schoolId}`); return;
      }
      setSchool(fetchedSchool);

      const data = await getDailyCollections(schoolId, dateRange.from, dateRange.to);
      setReportData(data);
    } catch (error) {
      console.error("Error loading collections summary data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load report data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router, dateRange]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const totalCollectedForPeriod = useMemo(() => 
    reportData.reduce((sum, item) => sum + item.totalAmount, 0),
    [reportData]
  );
  
  const presetDateRanges = [
    { label: "This Month", range: { from: startOfMonth(new Date()), to: endOfMonth(new Date()) } },
    { label: "Last Month", range: { from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) } },
    { label: "This Year", range: { from: startOfYear(new Date()), to: endOfYear(new Date()) } },
  ];

  const handleExport = () => {
    if (!school || !dateRange?.from || !dateRange?.to || reportData.length === 0) {
      toast({ title: "No data to export" });
      return;
    }
    const schoolName = school.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fromStr = format(dateRange.from, "yyyyMMdd");
    const toStr = format(dateRange.to, "yyyyMMdd");
    const filename = `Collections_Summary_${schoolName}_${fromStr}_to_${toStr}.xlsx`;

    const dataForExport = reportData.map(item => ({
      Date: item.date,
      "Total Collected (UGX)": item.totalAmount,
    }));
    
    dataForExport.push({ "Date": "TOTAL", "Total Collected (UGX)": totalCollectedForPeriod });

    const worksheet = XLSX.utils.json_to_sheet(dataForExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Collections Summary");
    XLSX.writeFile(workbook, filename);
    toast({ title: "Export Successful", description: "Collections summary exported to Excel." });
  };
  
  const handlePrint = () => {
    const printContent = printRef.current;
    if (printContent) {
      const printWindow = window.open('', '_blank', 'height=800,width=1200');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Collections Summary - ${school?.name}</title>
              <style>
                @media print {
                  @page { size: A4 portrait; margin: 0.7in; }
                  body { font-family: Arial, sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                  .report-header { text-align: center; margin-bottom: 20px; }
                  .report-header img { max-height: 80px; margin-bottom: 10px; }
                  h1, h2, h3, p { margin: 0; padding: 0; }
                  h1 { font-size: 1.5rem; }
                  h2 { font-size: 1.2rem; font-weight: normal; margin-bottom: 5px;}
                  p { font-size: 0.9rem; color: #555; }
                  table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 9pt; }
                  th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
                  th { background-color: #f2f2f2 !important; font-weight: bold; }
                  tfoot tr { font-weight: bold; background-color: #f2f2f2 !important; border-top: 2px solid black; }
                  .text-right { text-align: right; }
                  .no-print { display: none !important; }
                  .chart-container { margin-top: 30px; width: 100%; page-break-inside: avoid; }
                }
              </style>
            </head>
            <body>${printContent.innerHTML}</body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
      }
    }
  };

  return (
    <>
      <Card className="shadow-lg no-print">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center"><BarChart className="mr-3 h-6 w-6 text-primary"/>Daily Collections Summary</CardTitle>
              <CardDescription>Aggregated summary of student fee payments received per day for {school?.name || 'the school'}.</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                <div className="flex gap-1 sm:gap-2 flex-wrap">
                    {presetDateRanges.map(preset => (
                        <Button key={preset.label} variant="outline" size="xs" onClick={() => setDateRange(preset.range)}
                                className={dateRange?.from?.getTime() === preset.range.from.getTime() && dateRange?.to?.getTime() === preset.range.to.getTime() ? "bg-primary/10 text-primary border-primary" : ""}>
                            {preset.label}
                        </Button>
                    ))}
                </div>
                <DatePickerWithRange date={dateRange} onDateChange={setDateRange} className="w-full sm:w-auto" />
                <Button onClick={handleExport} variant="outline" size="sm" disabled={isLoading || reportData.length === 0}>
                    <Download className="mr-2 h-4 w-4"/> Export
                </Button>
                 <Button onClick={handlePrint} variant="outline" size="sm" disabled={isLoading || reportData.length === 0}>
                    <Printer className="mr-2 h-4 w-4"/> Print
                </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
          ) : !dateRange?.from || !dateRange?.to ? (
             <div className="text-center py-10 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-3"/>
                <p>Please select a date range to view the collections summary.</p>
            </div>
          ) : reportData.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
                <BarChart className="h-12 w-12 mx-auto mb-3"/>
                <p>No fee payments found for the selected period.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total Collected (UGX)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.map((item) => (
                      <TableRow key={item.date}>
                        <TableCell className="font-medium">{item.date}</TableCell>
                        <TableCell className="text-right font-semibold">{item.totalAmount.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="font-bold text-md bg-muted/50">
                        <TableCell className="text-right">Total</TableCell>
                        <TableCell className="text-right">{totalCollectedForPeriod.toLocaleString()}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
              <div className="lg:col-span-3 min-h-[300px]">
                <ChartContainer config={{ totalAmount: { label: "Collected", color: "hsl(var(--chart-1))" } }}>
                    <RechartsBarChart data={reportData} margin={{ top: 20, right: 20, left: 20, bottom: 5 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            tickFormatter={(value) => format(new Date(value), 'd MMM')}
                        />
                         <YAxis
                            tickFormatter={(value) => `UGX ${Number(value) / 1000}k`}
                            tickLine={false}
                            axisLine={false}
                            width={80}
                        />
                        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                        <Bar dataKey="totalAmount" fill="var(--color-totalAmount)" radius={4} />
                    </RechartsBarChart>
                </ChartContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Hidden div for printing */}
      <div className="hidden">
        <div ref={printRef}>
            <div className="report-header">
                {school?.badgeImageUrl && <img src={school.badgeImageUrl} alt={`${school.name} Logo`} />}
                <h1>{school?.name}</h1>
                <h2>Daily Collections Summary</h2>
                {dateRange?.from && dateRange?.to && (
                  <p>Period: {format(dateRange.from, 'PP')} to {format(dateRange.to, 'PP')}</p>
                )}
            </div>
            <table>
                <thead>
                    <tr><th>Date</th><th className="text-right">Total Collected (UGX)</th></tr>
                </thead>
                <tbody>
                    {reportData.map((item) => (
                        <tr key={item.date}>
                            <td>{item.date}</td>
                            <td className="text-right">{item.totalAmount.toLocaleString()}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="total-row">
                        <td>Total</td>
                        <td className="text-right">{totalCollectedForPeriod.toLocaleString()}</td>
                    </tr>
                </tfoot>
            </table>
            <div className="chart-container">
                 {/* Chart might not render well in print. A simple table is more reliable. */}
            </div>
        </div>
      </div>
    </>
  );
}
