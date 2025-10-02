
// src/app/school/dashboard/[schoolId]/reports/requirements/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ListChecks, FileText } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function RequirementsReportsOverviewPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;

  const requirementReports = [
    {
      title: "Requirements Summary",
      description: "Aggregated summary of provisions and payments for each physical requirement.",
      href: `/school/dashboard/${schoolId}/reports/requirements/summary`,
      icon: ListChecks,
    },
    {
      title: "Student Status by Requirement",
      description: "View the status of a specific requirement for all applicable students.",
      href: `/school/dashboard/${schoolId}/reports/requirements/student-status-by-requirement`,
      icon: FileText,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <ListChecks className="mr-3 h-6 w-6 text-primary"/>
            Requirement Reports
          </CardTitle>
          <CardDescription>
            Generate reports to track student requirement fulfillment and overall status.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {requirementReports.map((report) => (
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
