
// src/app/school/dashboard/[schoolId]/staff-payments/settings/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function StaffPaymentSettingsPage() {

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="mr-3 h-6 w-6 text-primary"/>
            Salary & Payment Settings
          </CardTitle>
          <CardDescription>
            This module for managing staff salary structures, allowances, and deductions is coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground">Functionality to define base salaries and recurring payment items for each staff member will be available here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
