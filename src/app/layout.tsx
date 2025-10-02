import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/hooks/use-auth';
import { Navbar } from '@/components/navbar';
import { CurrentYear } from '@/components/current-year'; 
import { AdminAuthProvider } from '@/hooks/use-admin-auth';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

// Improved metadata for SEO
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
  title: {
    default: 'SchoolMS - Your Complete School Management System',
    template: '%s | SchoolMS',
  },
  description: 'A comprehensive, modern solution for managing school operations, from student records and fee payments to academic reporting and parent communication.',
  keywords: ['school management system', 'education', 'student portal', 'school administration', 'fee management', 'academic records', 'notesvault'],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'SchoolMS - Complete School Management',
    description: 'Streamline your school\'s operations with our all-in-one management system.',
    type: 'website',
    locale: 'en_US',
    siteName: 'SchoolMS',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased flex flex-col min-h-screen`}>
        <AdminAuthProvider>
          <AuthProvider>
            <Navbar />
            
            <main className="flex-grow">
              {children}
            </main>
            
            <Toaster />
            <footer className="text-center py-4 border-t text-sm text-muted-foreground bg-card">
              © <CurrentYear /> School Management System. All rights reserved.
            </footer>
          </AuthProvider>
        </AdminAuthProvider>
      </body>
    </html>
  );
}
