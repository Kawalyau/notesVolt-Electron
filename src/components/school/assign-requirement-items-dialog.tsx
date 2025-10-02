
// src/components/school/assign-requirement-items-dialog.tsx
"use client";

import { useState, useEffect } from 'react';
import type { Student, PhysicalRequirement, StudentRequirementStatus, StudentRequirementAssignmentLog, School } from '@/types/school';
import type { UserProfile } from '@/types/user';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea'; // Import Textarea
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, PackagePlus, CheckCircle } from 'lucide-react';
import { addStudentRequirementAssignmentLog } from '@/services/schoolService';

interface AssignRequirementItemsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  student: Student | null;
  requirement: (PhysicalRequirement & { status?: StudentRequirementStatus | null, qtyAlreadyGivenToStudent: number, maxQtyAvailableForNewAssignment: number }) | null;
  schoolId: string;
  adminProfile: UserProfile | null;
  onAssignmentRecorded: (requirementId: string) => void; // Callback to refresh logs on parent page
}

export function AssignRequirementItemsDialog({
  isOpen,
  onOpenChange,
  student,
  requirement,
  schoolId,
  adminProfile,
  onAssignmentRecorded
}: AssignRequirementItemsDialogProps) {
  const { toast } = useToast();
  const [quantityToAssign, setQuantityToAssign] = useState<string>("");
  const [assignmentNotes, setAssignmentNotes] = useState<string>(""); // State for notes
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuantityToAssign(""); // Reset quantity when dialog opens
      setAssignmentNotes(""); // Reset notes
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !student || !requirement || !adminProfile) {
    return null;
  }

  const maxQty = requirement.maxQtyAvailableForNewAssignment;

  const handleConfirmAssignment = async () => {
    const qty = parseInt(quantityToAssign, 10);
    if (isNaN(qty) || qty <= 0) {
      setError("Please enter a valid positive quantity.");
      return;
    }
    if (qty > maxQty) {
      setError(`Cannot assign more than ${maxQty} available ${requirement.unit || 'item(s)'}.`);
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const logData: Omit<StudentRequirementAssignmentLog, 'id' | 'assignmentDate' | 'studentId'> = {
        requirementId: requirement.id,
        requirementName: requirement.name,
        quantityAssigned: qty,
        adminId: adminProfile.uid,
        adminName: adminProfile.displayName || adminProfile.email || "Admin",
        notes: assignmentNotes.trim() || null, // Add notes, or null if empty
      };
      await addStudentRequirementAssignmentLog(schoolId, student.id, logData);
      toast({ title: "Items Assigned", description: `${qty} ${requirement.unit || 'item(s)'} of ${requirement.name} recorded.` });
      onAssignmentRecorded(requirement.id); // Trigger refresh on parent
      onOpenChange(false); // Close dialog
    } catch (err: any) {
      console.error("Error recording assignment:", err);
      toast({ variant: "destructive", title: "Assignment Error", description: err.message || "Could not record assignment." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if(!isSubmitting) onOpenChange(open); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <PackagePlus className="mr-2 h-6 w-6 text-primary"/> Assign Items
          </DialogTitle>
          <DialogDescription>
            Record physical items given to <span className="font-semibold">{student.firstName} {student.lastName}</span> for the requirement: <span className="font-semibold">{requirement.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-3">
          <p className="text-sm">
            Student has settled for a total of <span className="font-semibold">{requirement.qtyAlreadyGivenToStudent + requirement.maxQtyAvailableForNewAssignment}</span> {requirement.unit || 'item(s)'}.
          </p>
          <p className="text-sm">
            Already given: <span className="font-semibold">{requirement.qtyAlreadyGivenToStudent}</span> {requirement.unit || 'item(s)'}.
          </p>
          <p className="text-sm text-primary font-semibold">
            Available to assign now: {maxQty} {requirement.unit || 'item(s)'}.
          </p>
          
          <div>
            <Label htmlFor="quantityToAssign">Quantity to Assign Now*</Label>
            <Input
              id="quantityToAssign"
              type="number"
              value={quantityToAssign}
              onChange={(e) => {
                setQuantityToAssign(e.target.value);
                if (error) setError(null); // Clear error on input change
              }}
              placeholder={`Max ${maxQty}`}
              min="0"
              max={maxQty}
              className="mt-1"
              disabled={isSubmitting || maxQty === 0}
            />
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          </div>
          
          <div>
            <Label htmlFor="assignmentNotes">Notes (Optional)</Label>
            <Textarea
              id="assignmentNotes"
              value={assignmentNotes}
              onChange={(e) => setAssignmentNotes(e.target.value)}
              placeholder="e.g., Given from new stock, specific size/color if applicable"
              className="mt-1"
              rows={2}
              disabled={isSubmitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirmAssignment}
            disabled={isSubmitting || !quantityToAssign || parseInt(quantityToAssign, 10) <= 0 || maxQty === 0}
            className="bg-primary hover:bg-primary/90"
          >
            {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <CheckCircle className="mr-2"/>}
            Confirm Assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
