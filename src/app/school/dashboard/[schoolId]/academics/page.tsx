
// src/app/school/dashboard/[schoolId]/academics/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PenSquare, Settings2, FileSignature, Send, BarChart2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function AcademicsOverviewPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;

  const academicsSections = [
    { name: 'Exams & Grading Scales', href: `/school/dashboard/${schoolId}/academics/exams`, icon: PenSquare, description: "Manage examination series and define grading systems." },
    { name: 'Report Configurations', href: `/school/dashboard/${schoolId}/academics/report-configs`, icon: Settings2, description: "Set up how accumulated report cards are generated." },
    { name: 'Marks Entry', href: `/school/dashboard/${schoolId}/academics/marks-entry`, icon: FileSignature, description: "Enter student marks for different exams and subjects." },
    { name: 'Release Reports', href: `/school/dashboard/${schoolId}/academics/release-reports`, icon: Send, description: "Publish final reports and notify parents via SMS." },
    { name: 'Academic Reports', href: `/school/dashboard/${schoolId}/reports/academics`, icon: BarChart2, description: "View broadsheets, marksheets, and other academic analyses." },
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
                <PenSquare className="mr-3 h-6 w-6 text-primary"/>
                Academics Module
            </CardTitle>
            <CardDescription>
                Manage all aspects of your school's academic cycle, from exam setup to report generation.
            </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {academicsSections.map((section) => (
                <Link key={section.name} href={section.href} passHref>
                <Card className={`hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col`}>
                    <CardHeader className="flex-grow">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-primary/10 rounded-lg">
                        <section.icon className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                        <CardTitle className="text-lg font-medium text-primary">{section.name}</CardTitle>
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
