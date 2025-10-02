// src/app/school/dashboard/[schoolId]/transport/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bus } from "lucide-react";

export default function TransportPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Bus className="mr-3 h-6 w-6 text-primary"/>
            Transport Module
          </CardTitle>
          <CardDescription>
            This module for managing school transport routes and vehicle details is coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground">Functionality for defining routes, assigning students to buses, and tracking transport fees will be available here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
