
// src/app/school/dashboard/[schoolId]/teachers/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Banknote, GraduationCap, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function TeachersOverviewPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;

  const teacherSections = [
    {
      title: "Staff Directory",
      description: "View, search, and manage all teaching and non-teaching staff.",
      href: `/school/dashboard/${schoolId}/teachers/directory`,
      icon: Users,
    },
    {
      title: "Staff Payment Accounts",
      description: "Access individual staff accounts to manage payments and deductions.",
      href: `/school/dashboard/${schoolId}/teachers/directory`,
      icon: Banknote,
    }
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <GraduationCap className="mr-3 h-6 w-6 text-primary"/>
            Teachers & Staff Module
          </CardTitle>
          <CardDescription>
            Manage staff information, contracts, and payment accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teacherSections.map((section) => (
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
