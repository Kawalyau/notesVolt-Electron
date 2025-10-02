
// src/app/school/dashboard/[schoolId]/nursery/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Baby, BarChart3, FileSignature, Settings } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function NurseryDashboardPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;

  const nurserySections = [
    {
      title: "Assessment Entry",
      description: "Enter competence-based assessment results for nursery learners.",
      href: `/school/dashboard/${schoolId}/nursery/assessment-entry`,
      icon: FileSignature,
    },
    {
      title: "Progress Reports",
      description: "Generate and view colorful, printable progress reports for nursery classes.",
      href: `/school/dashboard/${schoolId}/nursery/reports`,
      icon: BarChart3,
    },
    {
      title: "Nursery Settings",
      description: "Configure grading scales, competences, and assessment sheets.",
      href: `/school/dashboard/${schoolId}/nursery/settings`,
      icon: Settings,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Baby className="mr-3 h-6 w-6 text-primary"/>
            Nursery Module
          </CardTitle>
          <CardDescription>
            A central place to manage all aspects of your nursery or early childhood section.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {nurserySections.map((section) => (
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
