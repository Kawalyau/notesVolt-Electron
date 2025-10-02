// src/types/monetization.ts
import type { Timestamp } from 'firebase/firestore';

export interface MonetizationSettings {
  id?: 'global'; // Singleton document ID for global settings
  downloadUnitPrice: number; // e.g., 0.10 for $0.10 USD
  currency: 'USD' | string; // Default to USD, allow for other currency codes
  updatedAt: Timestamp | string;
  adminSetBy: string; // UID of admin who last set the price
}

export interface DownloadTransaction {
  id?: string; // Firestore auto-generated ID
  resourceId: string;
  resourceTitle: string; // Denormalized for easier display in transaction lists
  downloaderUserId: string;
  downloaderName?: string; // Denormalized name of the downloader
  publisherId: string; // UID of the resource uploader
  priceAtTimeOfDownload: number;
  currency: string;
  timestamp: Timestamp | string; // When the download occurred
}
