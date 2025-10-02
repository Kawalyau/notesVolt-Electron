
// src/app/school/dashboard/[schoolId]/finance/dashboard/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, getFeeTransactions } from '@/services';
import type { School, SchoolIncome, SchoolExpense, Student, FeeTransaction, AppTimestamp } from '@/types/school';
import { Timestamp } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, DollarSign, TrendingUp, TrendingDown, BarChart2, PieChart as PieChartIcon, AlertTriangle, LayoutDashboard, Users, ArrowLeft } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { ChartContainer, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from 'next/link';

const KPI_CARD_CLASS = "bg-card shadow-lg rounded-xl p-6 flex flex-col justify-between hover:shadow-xl transition-shadow duration-300";
const CHART_CARD_CLASS = "bg-card shadow-lg rounded-xl p-6 hover:shadow-xl transition-shadow duration-300 min-h-[350px] flex flex-col";


interface MonthlyDataPoint {
  month: string; // e.g., "Jan '24"
  income: number;
  expenses: number;
}

interface BreakdownDataPoint {
  name: string;
  value: number;
  fill?: string;
}

const COLORS_PIE = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];


const parseAppTimestamp = (timestamp: AppTimestamp | undefined): Date | null => {
  if (!timestamp) return null;
  if (timestamp instanceof Timestamp) return timestamp.toDate();
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? null : d;
  }
  if (timestamp instanceof Date) return timestamp;
  return null;
};


export default function FinancialDashboardPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfYear(new Date()),
    to: endOfYear(new Date()),
  });

  const [kpiData, setKpiData] = useState<{
    totalIncome: number;
    totalExpenses: number;
    netProfitLoss: number;
    totalOutstandingFees: number;
  } | null>(null);

  const [incomeVsExpenseData, setIncomeVsExpenseData] = useState<MonthlyDataPoint[]>([]);
  const [revenueBreakdownData, setRevenueBreakdownData] = useState<BreakdownDataPoint[]>([]);
  const [expenseBreakdownData, setExpenseBreakdownData] = useState<BreakdownDataPoint[]>([]);


  const fetchDashboardData = useCallback(async () => {
    if (!user || !schoolId || !dateRange?.from || !dateRange?.to) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" }); router.push(`/school/dashboard/${schoolId}`); return;
      }
      setSchool(fetchedSchool);

      const from = dateRange.from;
      const to = dateRange.to;

      const [allIncomeEntries, allExpenseEntries, allStudentsData, allFeeTransactionsData] = await Promise.all([
        getSchoolSubcollectionItems<SchoolIncome>(schoolId, 'income'),
        getSchoolSubcollectionItems<SchoolExpense>(schoolId, 'expenses'),
        getSchoolSubcollectionItems<Student>(schoolId, 'students'),
        Promise.all((await getSchoolSubcollectionItems<Student>(schoolId, 'students')).map(s => getFeeTransactions(schoolId, s.id))).then(txArrays => txArrays.flat())
      ]);

      const periodIncome = allIncomeEntries
        .filter(inc => { const d = parseAppTimestamp(inc.date); return d && d >= from && d <= to; })
        .reduce((sum, item) => sum + item.amount, 0);

      const periodStudentFeesCollected = allFeeTransactionsData
        .filter(tx => tx.type === 'credit' && (()=>{ const d = parseAppTimestamp(tx.transactionDate); return d && d >= from && d <= to; })())
        .reduce((sum, item) => sum + item.amount, 0);

      const totalPeriodRevenue = periodIncome + periodStudentFeesCollected;

      const periodExpenses = allExpenseEntries
        .filter(exp => { const d = parseAppTimestamp(exp.date); return d && d >= from && d <= to; })
        .reduce((sum, item) => sum + item.amount, 0);

      const netProfitLoss = totalPeriodRevenue - periodExpenses;
      
      const totalOutstandingFees = allStudentsData.reduce((sum, s) => sum + (s.feeBalance && s.feeBalance > 0 ? s.feeBalance : 0), 0);


      setKpiData({ totalIncome: totalPeriodRevenue, totalExpenses: periodExpenses, netProfitLoss, totalOutstandingFees });

      const trendEndDate = to;
      const trendStartDate = startOfMonth(subMonths(trendEndDate, 11)); // Get data for the last 12 months including the current one
      const monthsInterval = eachMonthOfInterval({ start: trendStartDate, end: trendEndDate });

      const monthlyData: MonthlyDataPoint[] = monthsInterval.map(monthStart => {
        const monthEnd = endOfMonth(monthStart);
        const monthStr = format(monthStart, "MMM ''yy");

        const monthlyOtherIncome = allIncomeEntries
          .filter(inc => { const d = parseAppTimestamp(inc.date); return d && d >= monthStart && d <= monthEnd; })
          .reduce((sum, item) => sum + item.amount, 0);

        const monthlyFeesCollected = allFeeTransactionsData
          .filter(tx => tx.type === 'credit' && (()=>{ const d = parseAppTimestamp(tx.transactionDate); return d && d >= monthStart && d <= monthEnd; })())
          .reduce((sum, item) => sum + item.amount, 0);

        const monthlyTotalIncome = monthlyOtherIncome + monthlyFeesCollected;

        const monthlyExpensesVal = allExpenseEntries
          .filter(exp => { const d = parseAppTimestamp(exp.date); return d && d >= monthStart && d <= monthEnd; })
          .reduce((sum, item) => sum + item.amount, 0);

        return { month: monthStr, income: monthlyTotalIncome, expenses: monthlyExpensesVal };
      });
      setIncomeVsExpenseData(monthlyData);

      const revenueSources: Record<string, number> = {};
      revenueSources['Student Fees Collected'] = periodStudentFeesCollected;
      allIncomeEntries
        .filter(inc => { const d = parseAppTimestamp(inc.date); return d && d >= from && d <= to; })
        .forEach(inc => {
          const source = inc.source || "Uncategorized Income";
          revenueSources[source] = (revenueSources[source] || 0) + inc.amount;
        });
      setRevenueBreakdownData(Object.entries(revenueSources).map(([name, value], index) => ({ name, value, fill: COLORS_PIE[index % COLORS_PIE.length] })).filter(item => item.value > 0));

      const expenseCategories: Record<string, number> = {};
      allExpenseEntries
        .filter(exp => { const d = parseAppTimestamp(exp.date); return d && d >= from && d <= to; })
        .forEach(exp => {
          const category = exp.category || "Uncategorized Expense";
          expenseCategories[category] = (expenseCategories[category] || 0) + exp.amount;
        });
      setExpenseBreakdownData(Object.entries(expenseCategories).map(([name, value], index) => ({ name, value, fill: COLORS_PIE[index % COLORS_PIE.length] })).filter(item => item.value > 0));

    } catch (error) {
      console.error("Error loading financial dashboard data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load dashboard data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router, dateRange]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const presetDateRanges = useMemo(() => [
    { label: "This Year", range: { from: startOfYear(new Date()), to: endOfYear(new Date()) } },
    { label: "Last Year", range: { from: startOfYear(subMonths(new Date(), 12)), to: endOfYear(subMonths(new Date(), 12)) } },
    { label: "This Month", range: { from: startOfMonth(new Date()), to: endOfMonth(new Date()) } },
    { label: "Last Month", range: { from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) } },
  ], []);

  const incomeExpenseChartConfig = {
    income: { label: "Total Income", color: "hsl(var(--chart-1))" },
    expenses: { label: "Total Expenses", color: "hsl(var(--chart-2))" },
  } satisfies ChartConfig;
  
  const revenueBreakdownChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    revenueBreakdownData.forEach((item, index) => {
        config[item.name] = { label: item.name, color: item.fill || COLORS_PIE[index % COLORS_PIE.length] };
    });
    return config;
  }, [revenueBreakdownData]);

  const expenseBreakdownChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    expenseBreakdownData.forEach((item, index) => {
        config[item.name] = { label: item.name, color: item.fill || COLORS_PIE[index % COLORS_PIE.length] };
    });
    return config;
  }, [expenseBreakdownData]);


  if (isLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-8 p-4 md:p-6">
      <div className="mb-6">
        <Button variant="outline" asChild>
          <Link href={`/school/dashboard/${schoolId}/finance`}>
            <ArrowLeft className="mr-2 h-4 w-4"/> Back to Finance Overview
          </Link>
        </Button>
      </div>
      <Card className="shadow-lg rounded-xl">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-3xl font-bold text-primary flex items-center">
                <LayoutDashboard className="mr-3 h-7 w-7" /> Financial Dashboard
              </CardTitle>
              <CardDescription>Overview of {school?.name || 'the school'}'s financial performance.</CardDescription>
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
            </div>
          </div>
           {dateRange?.from && dateRange.to && (
            <p className="text-sm text-muted-foreground mt-2">
              Showing data for: {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
            </p>
          )}
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className={KPI_CARD_CLASS}>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center"><DollarSign className="mr-2"/>Total Revenue</CardTitle>
          <p className="text-3xl font-bold text-green-600 mt-2">UGX {kpiData?.totalIncome.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0}) || '0'}</p>
        </div>
        <div className={KPI_CARD_CLASS}>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center"><TrendingDown className="mr-2"/>Total Expenses</CardTitle>
          <p className="text-3xl font-bold text-red-600 mt-2">UGX {kpiData?.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0}) || '0'}</p>
        </div>
        <div className={KPI_CARD_CLASS}>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center"><BarChart2 className="mr-2"/>Net Profit / Loss</CardTitle>
          <p className={`text-3xl font-bold mt-2 ${kpiData && kpiData.netProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            UGX {kpiData?.netProfitLoss.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0}) || '0'}
          </p>
        </div>
        <div className={KPI_CARD_CLASS}>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center"><Users className="mr-2"/>Outstanding Fees</CardTitle>
          <p className="text-3xl font-bold text-amber-600 mt-2">UGX {kpiData?.totalOutstandingFees.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0}) || '0'}</p>
          <p className="text-xs text-muted-foreground mt-1">Current overall student balances.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className={CHART_CARD_CLASS}>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-primary">Income vs. Expense Trend</CardTitle>
            <CardDescription>Monthly performance over the last 12 months (ending {dateRange?.to ? format(dateRange.to, "MMM yyyy") : "selected date"}).</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            {incomeVsExpenseData.length > 0 ? (
              <ChartContainer config={incomeExpenseChartConfig} className="min-h-[250px] w-full">
                <LineChart data={incomeVsExpenseData} margin={{ left: -20, right: 10, top:5, bottom:5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickMargin={5} />
                  <YAxis tickFormatter={(value) => `UGX ${Number(value) / 1000}k`} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} width={70}/>
                  <Tooltip content={<ChartTooltipContent indicator="line" />} />
                  <Legend wrapperStyle={{fontSize: "12px"}}/>
                  <Line type="monotone" dataKey="income" name="Total Income" stroke="var(--color-income)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}/>
                  <Line type="monotone" dataKey="expenses" name="Total Expenses" stroke="var(--color-expenses)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}/>
                </LineChart>
              </ChartContainer>
            ) : <p className="text-muted-foreground text-center pt-10">No trend data available for the selected period.</p>}
          </CardContent>
        </Card>

        <div className="space-y-6">
            <Card className={CHART_CARD_CLASS}>
            <CardHeader>
                <CardTitle className="text-xl font-semibold text-primary">Revenue Breakdown</CardTitle>
                <CardDescription>Sources of revenue for the selected period.</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
                {revenueBreakdownData.length > 0 ? (
                <ChartContainer config={revenueBreakdownChartConfig} className="min-h-[250px] w-full aspect-square">
                    <PieChart>
                    <Tooltip content={<ChartTooltipContent nameKey="name" hideIndicator />} />
                    <Pie data={revenueBreakdownData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} labelLine={false}
                         label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                            const RADIAN = Math.PI / 180;
                            const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                            const x = cx + radius * Math.cos(-midAngle * RADIAN);
                            const y = cy + radius * Math.sin(-midAngle * RADIAN);
                            if (percent < 0.05) return null;
                            return (
                                <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="10px">
                                {`${(percent * 100).toFixed(0)}%`}
                                </text>
                            );
                        }}
                    >
                        {revenueBreakdownData.map((entry, index) => (
                         <Cell key={entry.name} fill={entry.fill || COLORS_PIE[index % COLORS_PIE.length]} name={entry.name} />
                        ))}
                    </Pie>
                    <Legend wrapperStyle={{fontSize: "10px", marginTop:"10px"}} layout="horizontal" verticalAlign="bottom" align="center"/>
                    </PieChart>
                </ChartContainer>
                ) : <p className="text-muted-foreground text-center pt-10">No revenue breakdown data for this period.</p>}
            </CardContent>
            </Card>
        </div>
      </div>
       <Card className={CHART_CARD_CLASS}>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-primary">Expense Breakdown by Category</CardTitle>
            <CardDescription>Major expense categories for the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            {expenseBreakdownData.length > 0 ? (
            <ChartContainer config={expenseBreakdownChartConfig} className="min-h-[250px] w-full aspect-square">
                <PieChart>
                <Tooltip content={<ChartTooltipContent nameKey="name" hideIndicator />} />
                <Pie data={expenseBreakdownData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false}
                     label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                        const RADIAN = Math.PI / 180;
                        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        if (percent < 0.05) return null;
                        return (
                            <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="10px">
                            {`${(percent * 100).toFixed(0)}%`}
                            </text>
                        );
                    }}
                >
                    {expenseBreakdownData.map((entry, index) => (
                     <Cell key={entry.name} fill={entry.fill || COLORS_PIE[index % COLORS_PIE.length]} name={entry.name} />
                    ))}
                </Pie>
                <Legend wrapperStyle={{fontSize: "10px", marginTop:"10px"}} layout="horizontal" verticalAlign="bottom" align="center"/>
                </PieChart>
            </ChartContainer>
            ) : <p className="text-muted-foreground text-center pt-10">No expense breakdown data for this period.</p>}
          </CardContent>
        </Card>

      <Alert variant="default" className="bg-accent/10 border-accent/30 text-accent-foreground/90">
        <AlertTriangle className="h-4 w-4 !text-accent" />
        <AlertTitle className="text-sm">Data Accuracy Note</AlertTitle>
        <AlertDescription className="text-xs">
          This dashboard provides an overview based on recorded income, expenses, and student fee transactions.
          For official accounting, consult comprehensive financial statements. Outstanding fees are based on current balances and may not reflect historical aging.
        </AlertDescription>
      </Alert>
    </div>
  );
}
