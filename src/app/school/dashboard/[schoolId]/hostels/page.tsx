// src/app/school/dashboard/[schoolId]/hostels/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bed } from "lucide-react";

export default function HostelsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Bed className="mr-3 h-6 w-6 text-primary"/>
            Hostel Management Module
          </CardTitle>
          <CardDescription>
            This module for managing hostel rooms and student allocations is coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground">Functionality for hostel setup, room assignment, and boarding reports will be available here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
