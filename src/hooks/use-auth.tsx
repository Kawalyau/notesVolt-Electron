
// src/hooks/use-auth.tsx
"use client";

import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { auth, firestore } from '@/config/firebase';
import type { UserProfile } from '@/types/user';
import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean; // True if either auth state or profile is loading
  error: Error | null;
  setUserProfileState: (profile: UserProfile | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Single loading state
  const [error, setError] = useState<Error | null>(null);

  const setUserProfileState = (profile: UserProfile | null) => {
    setUserProfile(profile);
  };

  useEffect(() => {
    let unsubscribeProfile: Unsubscribe | undefined;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        setLoading(true); // Always start loading when auth state changes
        setError(null);
        setUserProfile(null); // Reset profile on auth change

        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = undefined;
        }

        if (firebaseUser) {
          setUser(firebaseUser);
          const userDocRef = doc(firestore, 'users', firebaseUser.uid);
          unsubscribeProfile = onSnapshot(userDocRef, 
            (docSnap) => {
              if (docSnap.exists()) {
                setUserProfile(docSnap.data() as UserProfile);
              } else {
                // If profile doesn't exist, we might be in the process of creating it.
                // For now, treat as no profile, but don't error out.
                setUserProfile(null);
              }
              setLoading(false); // Stop loading once profile is fetched (or confirmed not to exist)
            },
            (profileError) => {
              console.error("Failed to fetch user profile in real-time:", profileError);
              setError(profileError instanceof Error ? profileError : new Error('Failed to fetch user profile'));
              setUserProfile(null);
              setLoading(false); // Stop loading on error
            }
          );
        } else {
          setUser(null);
          setUserProfile(null);
          setLoading(false); // Stop loading if no user
        }
      },
      (authError) => {
        console.error("Auth state error:", authError);
        setError(authError);
        setUser(null);
        setUserProfile(null);
        setLoading(false);
        if (unsubscribeProfile) {
          unsubscribeProfile();
        }
      }
    );

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, error, setUserProfileState }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
