
// src/app/school/dashboard/[schoolId]/students/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserCog, GraduationCap } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function StudentsOverviewPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;

  const studentSections = [
    {
      title: "Student Directory",
      description: "View, search, and manage all student records.",
      href: `/school/dashboard/${schoolId}/students/directory`,
      icon: Users,
    },
    {
      title: "Duplicate Check",
      description: "Find and resolve students with duplicate registration numbers.",
      href: `/school/dashboard/${schoolId}/students/duplicate-check`,
      icon: UserCheck,
    },
    {
      title: "Student Promotions",
      description: "Promote students to the next class at the end of an academic year.",
      href: `/school/dashboard/${schoolId}/students/promotions`,
      icon: GraduationCap,
      disabled: true,
    },
    {
      title: "Alumni Management",
      description: "Track and engage with graduated students and alumni.",
      href: `/school/dashboard/${schoolId}/students/alumni`,
      icon: UserCog,
      disabled: true,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Users className="mr-3 h-6 w-6 text-primary"/>
            Students Module
          </CardTitle>
          <CardDescription>
            Manage student information, enrollment, promotions, and alumni records.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {studentSections.map((section) => (
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
