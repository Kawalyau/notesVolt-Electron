// src/app/school/dashboard/[schoolId]/reports/academics/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, FileText, Settings2, CalendarCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function AcademicReportsOverviewPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;

  const academicReports = [
    {
      title: "Class Broadsheet / Marksheet",
      description: "View a comprehensive marksheet for a selected class and examination.",
      href: `/school/dashboard/${schoolId}/reports/academics/broadsheet`,
      icon: BarChart3,
    },
    {
      title: "Accumulated Report Cards",
      description: "Generate combined report cards from multiple exams with weighted scores.",
      href: `/school/dashboard/${schoolId}/reports/academics/accumulated-report`,
      icon: Settings2,
    },
    {
      title: "Primary Leaving Mock Report",
      description: "Generate PLE-style mock reports for candidate classes.",
      href: `/school/dashboard/${schoolId}/reports/academics/primary-leaving-mock`,
      icon: FileText,
    },
    {
      title: "Attendance Reports",
      description: "View daily, weekly, and monthly attendance summaries.",
      href: `/school/dashboard/${schoolId}/attendance/reports`,
      icon: CalendarCheck,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <BarChart3 className="mr-3 h-6 w-6 text-primary"/>
            Academic Reports
          </CardTitle>
          <CardDescription>
            Generate and view various academic reports for performance analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {academicReports.map((report) => (
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
