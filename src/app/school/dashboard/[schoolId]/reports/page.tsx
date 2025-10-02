// src/app/school/dashboard/[schoolId]/reports/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, GraduationCap, DollarSign, ListChecks, CalendarCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ReportsOverviewPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;

  const reportSections = [
    {
      title: "Academic Reports",
      description: "Generate broadsheets, report cards, and other academic performance reports.",
      href: `/school/dashboard/${schoolId}/reports/academics`,
      icon: GraduationCap,
    },
    {
      title: "Financial Reports",
      description: "View income statements, balance sheets, and detailed fee reports.",
      href: `/school/dashboard/${schoolId}/reports/finance`,
      icon: DollarSign,
    },
     {
      title: "Attendance Reports",
      description: "View daily summaries and student attendance history.",
      href: `/school/dashboard/${schoolId}/attendance/reports`,
      icon: CalendarCheck,
    },
    {
      title: "Requirement Reports",
      description: "Track student requirement fulfillment and summary status.",
      href: `/school/dashboard/${schoolId}/reports/requirements`,
      icon: ListChecks,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <BarChart3 className="mr-3 h-6 w-6 text-primary"/>
            Reports Center
          </CardTitle>
          <CardDescription>
            Select a category to view detailed academic, financial, or requirement reports for your school.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reportSections.map((section) => (
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
