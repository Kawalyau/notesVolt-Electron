
// src/components/navbar.tsx
"use client";

import Link from 'next/link';
import { Notebook, LogIn, UserPlus, LogOut, UserCircle, Shield, GraduationCap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { auth } from '@/config/firebase';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAdminAuth } from '@/hooks/use-admin-auth';

export function Navbar() {
  const { user, userProfile, loading } = useAuth();
  const { isAdmin: isAdminContext } = useAdminAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/login'); 
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  const getInitials = (name?: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <header className="bg-card border-b sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2">
          <Notebook className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-primary">SchoolMS</h1>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/school" passHref>
             <Button variant="ghost" size="sm">
                <GraduationCap className="mr-1 h-4 w-4" /> School Portal
             </Button>
          </Link>
          {isAdminContext && ( 
             <Link href="/admin/dashboard" passHref>
               <Button variant="outline" size="sm" className="hidden sm:inline-flex border-primary text-primary hover:bg-primary/10">
                 <Shield className="mr-1 h-4 w-4" /> Admin Panel
               </Button>
             </Link>
           )}

          {loading ? (
             <div className="flex items-center gap-2">
                <div className="h-9 w-9 bg-muted rounded-full animate-pulse"></div>
            </div>
          ) : user && userProfile ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={userProfile?.photoURL || user.photoURL || undefined} alt={userProfile?.displayName || user.displayName || "User"} />
                      <AvatarFallback>{getInitials(userProfile?.displayName || user.displayName)}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {userProfile?.displayName || user.displayName || "Administrator"}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push(`/profile/${user.uid}`)}>
                    <UserCircle className="mr-2 h-4 w-4" />
                    My Account
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : user && !userProfile ? (
            // This case handles when auth is loaded but profile is not (e.g., during sign up)
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <>
              <Link href="/login" passHref>
                <Button variant="ghost" size="sm">
                  <LogIn className="mr-2 h-5 w-5" /> Login
                </Button>
              </Link>
              <Link href="/signup" passHref>
                <Button variant="default" size="sm">
                  <UserPlus className="mr-2 h-5 w-5" /> Sign Up
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
