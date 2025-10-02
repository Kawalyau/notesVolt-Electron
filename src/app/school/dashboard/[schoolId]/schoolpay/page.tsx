
// src/app/school/dashboard/[schoolId]/schoolpay/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, Users, Settings2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function SchoolPayOverviewPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  
  const schoolPayFeatures = [
    {
      title: "Export & Sync Students",
      description: "Prepare student lists for SchoolPay or initiate API synchronization.",
      href: `/school/dashboard/${schoolId}/schoolpay/export-students`,
      icon: Users,
    },
    {
      title: "SchoolPay Configuration",
      description: "Manage your SchoolPay API credentials and other settings.",
      href: `/school/dashboard/${schoolId}/settings/schoolpay`, 
      icon: Settings2,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle className="text-2xl flex items-center">
            <CreditCard className="mr-3 h-6 w-6 text-primary"/>
            SchoolPay Integration
            </CardTitle>
            <CardDescription>
            Manage student synchronization and configure your integration settings.
            </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {schoolPayFeatures.map((feature) => (
            <Link key={feature.title} href={feature.href} passHref>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col">
                <CardHeader className="flex-grow">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-medium text-primary">{feature.title}</CardTitle>
                      <CardDescription className="text-xs mt-1">{feature.description}</CardDescription>
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
