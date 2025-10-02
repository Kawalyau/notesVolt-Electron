
// src/app/school/dashboard/[schoolId]/exercise-books/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ListChecks, Book } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ExerciseBooksOverviewPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;

  const exerciseBookSections = [
    {
      title: "Student Book Balances",
      description: "Record payments, issue books, and view balances for all students.",
      href: `/school/dashboard/${schoolId}/exercise-books/balances`,
      icon: Users,
    },
    {
      title: "Outstanding Balances Report",
      description: "View a list of all students who are still owed exercise books.",
      href: `/school/dashboard/${schoolId}/exercise-books/report`,
      icon: ListChecks,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Book className="mr-3 h-6 w-6 text-primary"/>
            Exercise Book Management
          </CardTitle>
          <CardDescription>
            Manage the issuance and tracking of student exercise books.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exerciseBookSections.map((section) => (
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
