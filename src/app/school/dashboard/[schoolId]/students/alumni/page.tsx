// src/app/school/dashboard/[schoolId]/students/alumni/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCog } from "lucide-react";

export default function AlumniManagementPage() {

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <UserCog className="mr-3 h-6 w-6 text-primary"/>
            Alumni Management
          </CardTitle>
          <CardDescription>
            This module for managing graduated students and alumni networks is coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground">Functionality for tracking and engaging with alumni will be available here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
