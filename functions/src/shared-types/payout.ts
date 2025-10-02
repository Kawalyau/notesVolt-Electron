// src/types/payout.ts
import type { Timestamp } from 'firebase/firestore';

export interface PayoutSettings {
  id?: string; // userId
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  mobileMoneyProvider?: string;
  mobileMoneyNumber?: string;
  preferredMethod: 'bank' | 'mobile_money' | null;
  updatedAt: Timestamp | string;
}

export interface PayoutTransaction {
  id?: string; // Firestore auto-generated ID
  userId: string; // UID of the user who was paid
  userDisplayName?: string; // Denormalized for easier display
  amountPaid: number;
  currency: 'USD' | string; // Assuming USD
  paymentMethodReference?: string; // e.g., Bank Transfer ID, M-Pesa Transaction ID
  adminPaidById: string; // UID of the admin who recorded the payout
  adminPaidByName?: string; // Denormalized name of admin
  timestamp: Timestamp | string;
}

