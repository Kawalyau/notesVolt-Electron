// src/app/school/dashboard/[schoolId]/inventory/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package } from "lucide-react";

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Package className="mr-3 h-6 w-6 text-primary"/>
            Inventory & Assets Module
          </CardTitle>
          <CardDescription>
            This module for tracking and managing school assets and inventory is coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground">Functionality to manage school assets, track inventory levels, and handle asset depreciation will be available here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
