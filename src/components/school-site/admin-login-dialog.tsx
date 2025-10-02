// src/components/school-site/admin-login-dialog.tsx
"use client";

import { useState } from 'react';
import { useAdminAuth } from '@/hooks/use-admin-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, KeyRound } from 'lucide-react';

interface AdminLoginDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function AdminLoginDialog({ isOpen, onOpenChange }: AdminLoginDialogProps) {
  const { loginAdmin } = useAdminAuth();
  const { toast } = useToast();
  const [passcode, setPasscode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    setIsSubmitting(true);
    const success = await loginAdmin(passcode);
    if (success) {
      toast({ title: "Admin Mode Unlocked", description: "You can now edit site content." });
      onOpenChange(false);
    } else {
      toast({ variant: "destructive", title: "Login Failed", description: "Incorrect passcode." });
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center"><KeyRound className="mr-2"/>Admin Login</DialogTitle>
          <DialogDescription>
            Enter the admin passcode to enable site editing mode.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            id="passcode"
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Enter passcode"
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleLogin} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin mr-2"/>}
            Unlock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
