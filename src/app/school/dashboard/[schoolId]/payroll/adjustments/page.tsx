// src/app/school/dashboard/[schoolId]/staff-payments/adjustments/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MinusCircle } from "lucide-react";

export default function SalaryAdjustmentsPage() {

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MinusCircle className="mr-3 h-6 w-6 text-primary"/>
            Salary Adjustments
          </CardTitle>
          <CardDescription>
            This module for managing salary adjustments like advances and deductions is coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground">Functionality to manage monthly adjustments for each staff member will be available here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
