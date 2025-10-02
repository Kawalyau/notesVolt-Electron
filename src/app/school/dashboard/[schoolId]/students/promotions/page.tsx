// src/app/school/dashboard/[schoolId]/students/promotions/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";

export default function StudentPromotionsPage() {

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <GraduationCap className="mr-3 h-6 w-6 text-primary"/>
            Student Promotions
          </CardTitle>
          <CardDescription>
            This module for promoting students to the next class at the end of an academic year is coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground">Functionality to bulk-promote students will be available here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
