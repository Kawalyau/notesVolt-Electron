
// src/app/school/dashboard/[schoolId]/payroll/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HandCoins, FileText } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function PayrollOverviewPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;

  const payrollSections = [
    {
      title: "Run Payroll",
      description: "Generate and process monthly salary payments for all staff.",
      href: `/school/dashboard/${schoolId}/payroll/run`,
      icon: HandCoins,
    },
    {
      title: "Payment History",
      description: "View and review historical payroll records and payslips.",
      href: `/school/dashboard/${schoolId}/payroll/history`,
      icon: FileText,
      disabled: true,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <HandCoins className="mr-3 h-6 w-6 text-primary"/>
            Staff Payroll Module
          </CardTitle>
          <CardDescription>
            Manage and process staff salaries, allowances, and deductions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {payrollSections.map((section) => (
            <Link key={section.title} href={section.disabled ? "#" : section.href} passHref
              className={section.disabled ? "pointer-events-none" : ""}>
              <Card className={`hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col ${section.disabled ? "opacity-50" : ""}`}>
                <CardHeader className="flex-grow">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <section.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-medium text-primary">{section.title} {section.disabled ? '(Soon)' : ''}</CardTitle>
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
