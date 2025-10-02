
// src/app/school/dashboard/[schoolId]/fees/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ListChecks, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function FeesOverviewPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;

  const feesSections = [
    {
      title: "Student Fee Management",
      description: "Search for a student to record payments, bill items, and view their ledger.",
      href: `/school/dashboard/${schoolId}/fees/manage-student`,
      icon: Users,
    },
    {
      title: "Payment Receipts",
      description: "View and print recent payment receipts for all students.",
      href: `/school/dashboard/${schoolId}/fees/receipts`,
      icon: Printer,
    },
    {
      title: "Fee Items & Requirements",
      description: "Configure all billable items, both monetary and physical.",
      href: `/school/dashboard/${schoolId}/settings/finance`, // Links to the unified finance settings now
      icon: ListChecks,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Users className="mr-3 h-6 w-6 text-primary"/>
            Fees Management Module
          </CardTitle>
          <CardDescription>
            Manage student fee payments, billing, and financial configurations.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {feesSections.map((section) => (
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
