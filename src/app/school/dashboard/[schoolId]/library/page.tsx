// src/app/school/dashboard/[schoolId]/library/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Library } from "lucide-react";

export default function LibraryPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Library className="mr-3 h-6 w-6 text-primary"/>
            Library Management Module
          </CardTitle>
          <CardDescription>
            This module for managing library books, lending, and cataloging is coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground">Functionality to catalog books, manage check-ins and check-outs, and track overdue items will be available here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
