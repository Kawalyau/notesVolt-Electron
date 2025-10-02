// src/app/school/dashboard/[schoolId]/timetables/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

export default function TimetablesPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="mr-3 h-6 w-6 text-primary"/>
            Timetable Module
          </CardTitle>
          <CardDescription>
            This module for creating and managing class and teacher timetables is coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground">Functionality for building schedules, assigning teachers, and viewing timetables will be available here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
