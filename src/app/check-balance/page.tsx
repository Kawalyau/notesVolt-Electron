// src/app/check-balance/page.tsx
"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { lookupStudentBalance, searchStudentsByName } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Search, WalletCards, UserCircle, CheckCircle, AlertTriangle, School } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Link from 'next/link';

interface StudentSuggestion {
  name: string;
  registrationNumber: string;
}

interface StudentBalanceResult {
  name: string;
  balance: number;
}

function CheckBalanceContent() {
  const searchParams = useSearchParams();
  const initialSchoolId = searchParams.get('schoolId') || '';
  
  const [schoolId, setSchoolId] = useState(initialSchoolId);
  const [isSchoolIdConfirmed, setIsSchoolIdConfirmed] = useState(!!initialSchoolId);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StudentSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  
  const [balanceResult, setBalanceResult] = useState<StudentBalanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverContentRef = useRef<HTMLDivElement>(null);

  const handleSearchChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setSearchQuery(query);
    setBalanceResult(null); 
    setError(null);

    if (query.trim().length < 2) {
      setSuggestions([]);
      setIsPopoverOpen(false);
      return;
    }

    setIsSearching(true);
    const results = await searchStudentsByName(schoolId, query);
    setSuggestions(results);
    setIsPopoverOpen(results.length > 0);
    setIsSearching(false);
  };
  
  const handleSelectSuggestion = async (suggestion: StudentSuggestion) => {
    setIsPopoverOpen(false);
    setSuggestions([]);
    setSearchQuery(suggestion.name); 
    setIsLoadingBalance(true);
    setError(null);
    setBalanceResult(null);

    const response = await lookupStudentBalance(schoolId, suggestion.registrationNumber);
    if (response.success && response.data) {
      setBalanceResult(response.data);
    } else {
      setError(response.error || 'An unknown error occurred.');
    }
    setIsLoadingBalance(false);
  };
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current && !inputRef.current.contains(event.target as Node) &&
        popoverContentRef.current && !popoverContentRef.current.contains(event.target as Node)
      ) {
        setIsPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSchoolIdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (schoolId.trim()) {
        setIsSchoolIdConfirmed(true);
    } else {
        setError("Please enter a valid School ID.");
    }
  }

  return (
    <div className="bg-gradient-to-br from-background to-muted/50 min-h-screen-minus-navbar flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-primary flex items-center justify-center">
            <WalletCards className="mr-3 h-8 w-8" />
            Check Fee Balance
          </CardTitle>
          <CardDescription>
            {isSchoolIdConfirmed 
              ? `Now, search for a student at School ID: ${schoolId}`
              : "Enter your school's ID to begin."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isSchoolIdConfirmed ? (
            <form onSubmit={handleSchoolIdSubmit} className="space-y-4">
                <div className="relative">
                     <Input
                        id="school-id-input"
                        placeholder="Enter School ID..."
                        value={schoolId}
                        onChange={(e) => setSchoolId(e.target.value)}
                        className="pl-9"
                     />
                    <School className="absolute left-2.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                </div>
                <Button type="submit" className="w-full">Confirm School ID</Button>
            </form>
          ) : (
            <>
               <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                  <PopoverTrigger asChild>
                    <div className="relative" ref={inputRef}>
                      <Input
                        id="student-name-search"
                        placeholder="e.g., John Doe or S1001"
                        value={searchQuery}
                        onChange={handleSearchChange}
                        disabled={isLoadingBalance}
                        className="pl-9"
                        autoComplete="off"
                        onFocus={() => { if (suggestions.length > 0) setIsPopoverOpen(true); }}
                      />
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    </div>
                  </PopoverTrigger>
                  <PopoverContent ref={popoverContentRef} className="w-full p-1" style={{width: 'var(--radix-popover-trigger-width)'}} onOpenAutoFocus={(e) => e.preventDefault()}>
                     {isSearching && (
                        <div className="p-2 text-sm text-muted-foreground flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin mr-2"/> Searching...
                        </div>
                     )}
                     {!isSearching && suggestions.length === 0 && searchQuery.trim().length >= 2 && (
                        <div className="p-2 text-sm text-center text-muted-foreground">No students found.</div>
                     )}
                     {!isSearching && suggestions.length > 0 && (
                        <div className="space-y-1">
                            {suggestions.map(student => (
                                <Button
                                    key={student.registrationNumber}
                                    variant="ghost"
                                    className="w-full justify-start h-auto py-2 text-left"
                                    onClick={() => handleSelectSuggestion(student)}
                                >
                                    <div>
                                        <p className="font-medium text-sm">{student.name}</p>
                                        <p className="text-xs text-muted-foreground">Reg No: {student.registrationNumber}</p>
                                    </div>
                                </Button>
                            ))}
                        </div>
                     )}
                  </PopoverContent>
               </Popover>
              
              {isLoadingBalance && (
                <div className="flex justify-center items-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary"/>
                </div>
              )}

              {balanceResult && (
                <Card className="mt-6 bg-green-50 border-green-200">
                  <CardHeader>
                    <CardTitle className="text-lg text-green-800 flex items-center">
                      <CheckCircle className="mr-2 h-5 w-5"/> Balance Found
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Student Name:</span>
                      <span className="font-semibold text-foreground">{balanceResult.name}</span>
                    </div>
                    <div className="flex justify-between items-center text-xl">
                      <span className="text-muted-foreground">Current Balance:</span>
                      <span className={`font-bold ${balanceResult.balance > 0 ? 'text-destructive' : 'text-green-700'}`}>
                        UGX {balanceResult.balance.toLocaleString('en-US')}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {error && (
            <Card className="mt-6 bg-destructive/10 border-destructive/20">
              <CardHeader>
                 <CardTitle className="text-lg text-destructive flex items-center">
                  <AlertTriangle className="mr-2 h-5 w-5"/> Lookup Failed
                </CardTitle>
              </CardHeader>
              <CardContent>
                 <p className="text-center text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}
        </CardContent>
        <CardFooter className="flex justify-center text-center text-xs text-muted-foreground pt-4">
           {isSchoolIdConfirmed ? (
             <Button variant="link" size="sm" onClick={() => { setIsSchoolIdConfirmed(false); setSearchQuery(''); setSchoolId(''); setBalanceResult(null); setError(null); }} className="text-primary">
                 &larr; Change School ID
             </Button>
           ) : (
             <Link href="/" className="text-primary hover:underline">
               &larr; Back to Ulibtech Home
             </Link>
           )}
        </CardFooter>
      </Card>
    </div>
  );
}

export default function CheckBalancePage() {
  return (
    <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen-minus-navbar bg-background p-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    }>
      <CheckBalanceContent />
    </Suspense>
  );
}
