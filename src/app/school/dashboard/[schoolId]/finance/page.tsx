
// src/app/school/dashboard/[schoolId]/finance/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, BookText, Scale, LayoutDashboard, TrendingUp, TrendingDown, Briefcase, Target, Settings, FileSpreadsheet, ListChecks, BookKey, Library, UsersRound, Percent, BookOpen, CalendarDays, BarChart, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from '@/components/ui/button';

export default function FinanceOverviewPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;

  const financeSections = [
    {
      title: "Financial Dashboard",
      description: "High-level overview of key financial metrics and trends.",
      href: `/school/dashboard/${schoolId}/finance/dashboard`,
      icon: LayoutDashboard,
    },
    {
      title: "Manage Income",
      description: "Record all non-fee related income like grants and donations.",
      href: `/school/dashboard/${schoolId}/finance/income`,
      icon: TrendingUp,
    },
    {
      title: "Manage Expenses",
      description: "Track all school expenditures and operational costs.",
      href: `/school/dashboard/${schoolId}/finance/expenses`,
      icon: TrendingDown,
    },
    {
      title: "Journal Entries",
      description: "Manually create and review journal entries for accounting adjustments.",
      href: `/school/dashboard/${schoolId}/finance/journal-entries`,
      icon: Briefcase,
    },
     {
      title: "Budgets",
      description: "Set up and track budgets vs. actuals for income and expenses.",
      href: `/school/dashboard/${schoolId}/finance/budgets`,
      icon: Target,
    },
    {
      title: "Finance Settings",
      description: "Configure Chart of Accounts, Fee Items, and default accounts.",
      href: `/school/dashboard/${schoolId}/settings/finance`,
      icon: Settings,
    },
  ];

  return (
    <div className="container mx-auto px-2 sm:px-4 py-8">
       <div className="mb-6">
        <Button variant="outline" asChild>
          <Link href={`/school/dashboard/${schoolId}`}>
            <ArrowLeft className="mr-2 h-4 w-4"/> Back to School Dashboard
          </Link>
        </Button>
      </div>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <DollarSign className="mr-3 h-6 w-6 text-primary"/>
            Finance Module
          </CardTitle>
          <CardDescription>
            Manage all financial operations, from fee collections and expense tracking to comprehensive reporting.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {financeSections.map((section) => (
            <Link key={section.title} href={section.href} passHref>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col">
                <CardHeader className="flex-grow">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <section.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-medium text-primary">{section.title}</CardTitle>
                      <CardDescription className="text-xs mt-1">{section.description}</CardDescription>
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
