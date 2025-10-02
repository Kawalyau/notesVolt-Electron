
// src/app/school/dashboard/[schoolId]/reports/finance/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, BookText, Scale, ListChecks, UsersRound, BookOpen, Percent, BookKey, Library, LayoutDashboard, CalendarDays, BarChart, TrendingUp, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function FinanceReportsOverviewPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;

  const financialReports = [
    {
      title: "Finance Dashboard",
      description: "High-level overview of key financial metrics and trends.",
      href: `/school/dashboard/${schoolId}/finance/dashboard`,
      icon: LayoutDashboard,
    },
    {
      title: "Collections Report",
      description: "View daily, weekly, or monthly fee collections from students.",
      href: `/school/dashboard/${schoolId}/reports/finance/collections-report`,
      icon: CalendarDays,
    },
    {
      title: "Collections Summary",
      description: "Aggregated summary of fee collections by day, week, or month.",
      href: `/school/dashboard/${schoolId}/reports/finance/collections-summary`,
      icon: BarChart,
    },
    {
      title: "Income Statement",
      description: "View a summary of revenues and expenses over a period.",
      href: `/school/dashboard/${schoolId}/reports/finance/income-statement`,
      icon: BookText,
    },
    {
      title: "Balance Sheet",
      description: "See a snapshot of your school's assets, liabilities, and equity.",
      href: `/school/dashboard/${schoolId}/reports/finance/balance-sheet`,
      icon: Scale,
    },
    {
      title: "Cash Flow Statement",
      description: "Track the inflow and outflow of cash during a period.",
      href: `/school/dashboard/${schoolId}/reports/finance/cash-flow-statement`,
      icon: TrendingUp,
    },
     {
      title: "Trial Balance",
      description: "Check if total debits equal total credits across all accounts.",
      href: `/school/dashboard/${schoolId}/reports/finance/trial-balance`,
      icon: Scale,
    },
    {
      title: "General Ledger",
      description: "View a chronological log of all financial transactions.",
      href: `/school/dashboard/${schoolId}/reports/finance/general-ledger`,
      icon: BookKey,
    },
    {
      title: "Student Balances",
      description: "Detailed list of current fee balances for all students.",
      href: `/school/dashboard/${schoolId}/reports/finance/student-balances`,
      icon: ListChecks,
    },
    {
      title: "Student Fee Statements",
      description: "Generate and print detailed fee statements for students.",
      href: `/school/dashboard/${schoolId}/reports/finance/fee-statements`,
      icon: FileSpreadsheet,
    },
    {
      title: "Fee Item Billing",
      description: "Track total amounts billed for each fee item.",
      href: `/school/dashboard/${schoolId}/reports/finance/fee-item-billing`,
      icon: BookOpen,
    },
    {
      title: "Financial Ratios",
      description: "Analyze key performance indicators for financial health.",
      href: `/school/dashboard/${schoolId}/reports/finance/financial-ratios`,
      icon: Percent,
    },
    {
      title: "Consolidated Report",
      description: "Generate a multi-page financial package for a period.",
      href: `/school/dashboard/${schoolId}/reports/finance/consolidated-report`,
      icon: FileSpreadsheet,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <DollarSign className="mr-3 h-6 w-6 text-primary"/>
            Financial Reports
          </CardTitle>
          <CardDescription>
            Select a report below to analyze your school's financial data.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {financialReports.map((report) => (
            <Link key={report.title} href={report.href} passHref>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col">
                <CardHeader className="flex-grow">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <report.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-medium text-primary">{report.title}</CardTitle>
                      <CardDescription className="text-xs mt-1">{report.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
