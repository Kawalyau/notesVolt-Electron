// src/app/school/dashboard/[schoolId]/communications/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, BellRing } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function CommunicationsOverviewPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;

  const communicationsSections = [
    {
      title: "Bulk SMS",
      description: "Send custom SMS messages to parents of selected classes or individuals.",
      href: `/school/dashboard/${schoolId}/communications/bulk-sms`,
      icon: Send,
    },
    {
      title: "Send for Fees",
      description: "Generate lists and send reminders for outstanding fee balances.",
      href: `/school/dashboard/${schoolId}/communications/send-for-fees`,
      icon: BellRing,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Send className="mr-3 h-6 w-6 text-primary"/>
            Communications Module
          </CardTitle>
          <CardDescription>
            Engage with parents and guardians through bulk SMS and targeted fee reminders.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {communicationsSections.map((section) => (
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
    
