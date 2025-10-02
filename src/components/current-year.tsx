// src/components/current-year.tsx
"use client";

import { useState, useEffect } from 'react';

export function CurrentYear() {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  if (year === null) {
    // You can return a placeholder or null during server render / initial client render before hydration
    return <span>{new Date().getFullYear()}</span>; // Fallback to server-rendered year or a static year
  }

  return <>{year}</>;
}
