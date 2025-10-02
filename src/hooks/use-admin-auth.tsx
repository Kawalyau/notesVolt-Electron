// src/hooks/use-admin-auth.tsx
"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ADMIN_PASSCODE = "1212"; // The admin passcode
const ADMIN_AUTH_KEY = "isAdminAuthenticatedNotesVault";

interface AdminAuthContextType {
  isAdmin: boolean;
  loginAdmin: (passcode: string) => Promise<boolean>;
  logoutAdmin: () => void;
  loading: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check localStorage for persisted admin state
    const storedAuthState = localStorage.getItem(ADMIN_AUTH_KEY);
    if (storedAuthState === 'true') {
      setIsAdmin(true);
    }
    setLoading(false);
  }, []);

  const loginAdmin = useCallback(async (passcode: string): Promise<boolean> => {
    setLoading(true);
    if (passcode === ADMIN_PASSCODE) {
      localStorage.setItem(ADMIN_AUTH_KEY, 'true');
      setIsAdmin(true);
      setLoading(false);
      return true;
    }
    localStorage.removeItem(ADMIN_AUTH_KEY); // Ensure no stale auth key
    setIsAdmin(false);
    setLoading(false);
    return false;
  }, []);

  const logoutAdmin = useCallback(() => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    setIsAdmin(false);
    // Note: This does not sign the user out of Firebase main authentication.
  }, []);

  return (
    <AdminAuthContext.Provider value={{ isAdmin, loginAdmin, logoutAdmin, loading }}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};
