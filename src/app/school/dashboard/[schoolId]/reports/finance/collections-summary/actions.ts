
// src/app/school/dashboard/[schoolId]/reports/finance/collections-summary/actions.ts
'use server';

import { firestore } from '@/config/firebase';
import {
  collectionGroup,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { format, eachDayOfInterval, isWithinInterval } from 'date-fns';
import type { FeeTransaction, AppTimestamp } from '@/types/school';

export interface DailyCollectionData {
  date: string; // "yyyy-MM-dd"
  totalAmount: number;
}

const parseTimestamp = (ts: AppTimestamp): Date | null => {
    if (!ts) return null;
    if (ts instanceof Timestamp) return ts.toDate();
    const date = new Date(ts as string);
    return isNaN(date.getTime()) ? null : date;
};

export async function getDailyCollections(schoolId: string, fromDate: Date, toDate: Date): Promise<DailyCollectionData[]> {
  if (!schoolId || !fromDate || !toDate) {
    return [];
  }

  const fromTimestamp = Timestamp.fromDate(fromDate);
  const toTimestamp = Timestamp.fromDate(new Date(toDate.setHours(23, 59, 59, 999))); // Ensure end of day

  const transactionsQuery = query(
    collectionGroup(firestore, 'feeTransactions'),
    where('schoolId', '==', schoolId),
    where('type', '==', 'credit'),
    where('transactionDate', '>=', fromTimestamp),
    where('transactionDate', '<=', toTimestamp)
  );
  
  const snapshot = await getDocs(transactionsQuery);

  const collectionsByDate: { [key: string]: number } = {};

  snapshot.docs.forEach(doc => {
    const tx = doc.data() as FeeTransaction;
    // Exclude bursaries from collection reports
    if (tx.paymentMethod === "Bursary/Scholarship") {
      return;
    }
    const txDate = parseTimestamp(tx.transactionDate);
    if (txDate) {
      const dateString = format(txDate, 'yyyy-MM-dd');
      collectionsByDate[dateString] = (collectionsByDate[dateString] || 0) + tx.amount;
    }
  });

  // Ensure all days in the range are present, even if they have 0 collections
  const allDays = eachDayOfInterval({ start: fromDate, end: toDate });
  const result = allDays.map(day => {
    const dateString = format(day, 'yyyy-MM-dd');
    return {
      date: dateString,
      totalAmount: collectionsByDate[dateString] || 0,
    };
  });
  
  // We only return days that had collections, for a cleaner report.
  // To show all days, simply return `result`.
  return result.filter(r => r.totalAmount > 0).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
