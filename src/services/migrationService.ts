
// src/services/migrationService.ts
import { firestore } from '@/config/firebase';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
  addDoc,
  QueryConstraint,
  updateDoc,
  orderBy,
  getDoc,
} from 'firebase/firestore';
import type { School, Student, FeeTransaction, FeeItem, JournalEntryLine, AppTimestamp, ChartOfAccountItem, UserProfile, SchoolIncome, SchoolExpense, SchoolClass } from '@/types/school';

// Helper to parse dates from various formats including Firestore Timestamps or ISO strings
const parseClientDate = (dateInput: AppTimestamp | undefined): Date | null => {
  if (!dateInput) return null;
  if (dateInput instanceof Timestamp) return dateInput.toDate();
  if (typeof dateInput === 'string') {
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  }
  if (dateInput instanceof Date) return dateInput;
  return null;
};

// Client-side equivalent for creating a journal entry
async function createClientJournalEntry(
  schoolId: string,
  entryDate: Date,
  description: string,
  lines: Array<Omit<JournalEntryLine, 'accountName'>>,
  adminProfile: UserProfile,
  allChartOfAccounts: ChartOfAccountItem[],
  sourceDocumentId?: string,
  sourceDocumentType?: string
): Promise<string | null> {
  try {
    const journalLinesWithNames: JournalEntryLine[] = [];

    for (const line of lines) {
      const accountData = allChartOfAccounts.find(acc => acc.id === line.accountId);
      journalLinesWithNames.push({
        accountId: line.accountId,
        accountName: accountData?.accountName || 'Unknown Account',
        debit: line.debit || null,
        credit: line.credit || null,
        description: line.description || null,
      });
    }
    
    const totalDebits = journalLinesWithNames.reduce((sum, line) => sum + (line.debit || 0), 0);
    const totalCredits = journalLinesWithNames.reduce((sum, line) => sum + (line.credit || 0), 0);

    if (Math.abs(totalDebits - totalCredits) > 0.001) {
      console.error("Client Journal entry not balanced.", { schoolId, description, totalDebits, totalCredits, sourceDocumentId, sourceDocumentType });
      return null;
    }

    const journalEntryData = {
      date: Timestamp.fromDate(entryDate),
      description,
      lines: journalLinesWithNames,
      schoolId,
      postedByAdminId: adminProfile.uid,
      postedByAdminName: adminProfile.displayName || adminProfile.email,
      sourceDocumentId: sourceDocumentId || null,
      sourceDocumentType: sourceDocumentType || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const entryRef = await addDoc(collection(firestore, `schools/${schoolId}/journalEntries`), journalEntryData);
    return entryRef.id;
  } catch (error: any) {
    console.error("Error creating client journal entry:", { schoolId, description, error: error.message, sourceDocumentId, sourceDocumentType });
    return null;
  }
}

export async function runClientSideMigration(
  schoolId: string,
  adminProfile: UserProfile,
  schoolData: School // For default accounts
): Promise<{ message: string; errors: string[] }> {
  console.log("Starting client-side migration for school:", schoolId);
  const errors: string[] = [];
  let studentsUpdatedToInactive = 0;
  let journalEntriesCreated = 0;
  let transactionsProcessed = 0; // Total financial records (fees, income, expenses)
  let journalUpdatesAttempted = 0; // Records that needed JE and we tried to create one

  const BATCH_LIMIT = 450; // Firestore batch limit is 500, leave some room
  let mainProcessingBatch = writeBatch(firestore);
  let operationsInBatch = 0;

  const commitBatchIfNeeded = async () => {
    if (operationsInBatch > 0) {
      await mainProcessingBatch.commit();
      mainProcessingBatch = writeBatch(firestore); // Re-initialize for next batch
      console.log(`Committed a batch of ${operationsInBatch} JE updates.`);
      operationsInBatch = 0;
    }
  };

  try {
    // Fetch all necessary data
    console.log("Migration: Fetching auxiliary data...");
    const [allFeeItems, allChartOfAccounts, allSchoolClasses] = await Promise.all([
      getDocs(query(collection(firestore, `schools/${schoolId}/feeItems`))).then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as FeeItem))),
      getDocs(query(collection(firestore, `schools/${schoolId}/chartOfAccounts`))).then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as ChartOfAccountItem))),
      getDocs(query(collection(firestore, `schools/${schoolId}/schoolClasses`))).then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolClass))),
    ]);
    console.log(`Migration: Fetched ${allFeeItems.length} fee items, ${allChartOfAccounts.length} CoA items, ${allSchoolClasses.length} classes.`);


    // 1. Handle "Demo Class" students
    const demoClass = allSchoolClasses.find(c => c.class === "Demo Class");
    if (demoClass) {
      console.log(`Migration: Found Demo Class with ID: ${demoClass.id}. Processing students...`);
      const studentsInDemoClassQuery = query(collection(firestore, `schools/${schoolId}/students`), where("classId", "==", demoClass.id), where("status", "==", "Active"));
      const studentsInDemoSnapshot = await getDocs(studentsInDemoClassQuery);
      if (!studentsInDemoSnapshot.empty) {
        studentsInDemoSnapshot.forEach(studentDoc => {
          mainProcessingBatch.update(studentDoc.ref, { status: 'Inactive', updatedAt: serverTimestamp() });
          operationsInBatch++;
          studentsUpdatedToInactive++;
        });
        await commitBatchIfNeeded();
        console.log(`Migration: Set ${studentsUpdatedToInactive} students in Demo Class to Inactive.`);
      } else {
        console.log("Migration: No active students found in Demo Class.");
      }
    } else {
      console.log("Migration: No class named 'Demo Class' found.");
    }

    // 2. Process School Income records
    console.log("Migration: Processing School Income records...");
    const schoolIncomeSnapshot = await getDocs(query(collection(firestore, `schools/${schoolId}/income`), orderBy("date")));
    for (const incomeDoc of schoolIncomeSnapshot.docs) {
      const income = { id: incomeDoc.id, ...incomeDoc.data() } as SchoolIncome;
      transactionsProcessed++;
      if (income.journalEntryId) continue;
      journalUpdatesAttempted++;

      const cashAccId = schoolData.defaultCashAccountId;
      const revenueAccId = income.accountId; // Account ID for the specific income source
      if (!cashAccId || !revenueAccId) {
        errors.push(`School ${schoolId} missing default Cash or Income's Revenue account for income ${income.id}.`);
        continue;
      }
      const jeDate = parseClientDate(income.date) || new Date();
      const lines: Array<Omit<JournalEntryLine, 'accountName'>> = [
        { accountId: cashAccId, debit: income.amount, description: `Received: ${income.description}` },
        { accountId: revenueAccId, credit: income.amount, description: `Income Source: ${income.accountName || income.source}` },
      ];
      const jeId = await createClientJournalEntry(schoolId, jeDate, `Other Income: ${income.description}`, lines, adminProfile, allChartOfAccounts, income.id, 'SchoolIncome');
      if (jeId) {
        mainProcessingBatch.update(incomeDoc.ref, { journalEntryId: jeId });
        operationsInBatch++; journalEntriesCreated++;
        await commitBatchIfNeeded();
      } else { errors.push(`Failed to create JE for income ${income.id}`); }
    }
    console.log(`Migration: Processed ${schoolIncomeSnapshot.size} income records.`);

    // 3. Process School Expense records
    console.log("Migration: Processing School Expense records...");
    const schoolExpenseSnapshot = await getDocs(query(collection(firestore, `schools/${schoolId}/expenses`), orderBy("date")));
    for (const expenseDoc of schoolExpenseSnapshot.docs) {
      const expense = { id: expenseDoc.id, ...expenseDoc.data() } as SchoolExpense;
      transactionsProcessed++;
      if (expense.journalEntryId) continue;
      journalUpdatesAttempted++;

      const cashAccId = schoolData.defaultCashAccountId;
      const expenseAccId = expense.accountId; // Account ID for the specific expense
      if (!cashAccId || !expenseAccId) {
        errors.push(`School ${schoolId} missing default Cash or Expense's account for expense ${expense.id}.`);
        continue;
      }
      const jeDate = parseClientDate(expense.date) || new Date();
      const lines: Array<Omit<JournalEntryLine, 'accountName'>> = [
        { accountId: expenseAccId, debit: expense.amount, description: `Expense: ${expense.description}` },
        { accountId: cashAccId, credit: expense.amount, description: `Paid for: ${expense.description}` },
      ];
      const jeId = await createClientJournalEntry(schoolId, jeDate, `Expense: ${expense.description}`, lines, adminProfile, allChartOfAccounts, expense.id, 'SchoolExpense');
      if (jeId) {
        mainProcessingBatch.update(expenseDoc.ref, { journalEntryId: jeId });
        operationsInBatch++; journalEntriesCreated++;
        await commitBatchIfNeeded();
      } else { errors.push(`Failed to create JE for expense ${expense.id}`); }
    }
    console.log(`Migration: Processed ${schoolExpenseSnapshot.size} expense records.`);

    // 4. Process Fee Transactions for all non-Demo Class students
    console.log("Migration: Processing Fee Transactions for students...");
    const allStudentsSnapshot = await getDocs(query(collection(firestore, `schools/${schoolId}/students`)));
    for (const studentDoc of allStudentsSnapshot.docs) {
      const student = { id: studentDoc.id, ...studentDoc.data() } as Student;
      if (demoClass && student.classId === demoClass.id) {
        console.log(`Migration: Skipping fee transactions for student ${student.id} in Demo Class.`);
        continue;
      }

      const feeTransactionsSnapshot = await getDocs(query(collection(firestore, `schools/${schoolId}/students/${student.id}/feeTransactions`), orderBy("transactionDate")));
      for (const txDoc of feeTransactionsSnapshot.docs) {
        const transaction = { id: txDoc.id, ...txDoc.data() } as FeeTransaction;
        transactionsProcessed++;
        if (transaction.journalEntryId) continue;
        journalUpdatesAttempted++;

        const cashAccId = schoolData.defaultCashAccountId;
        const arAccId = schoolData.defaultAccountsReceivableAccountId;
        const bursaryExpenseAccId = schoolData.defaultBursaryExpenseAccountId;
        let feeItemData = transaction.feeItemId ? allFeeItems.find(fi => fi.id === transaction.feeItemId) : null;

        if (!cashAccId || !arAccId) {
          errors.push(`School ${schoolId} missing default Cash or A/R account for fee tx ${transaction.id}.`);
          continue;
        }

        let lines: Array<Omit<JournalEntryLine, 'accountName'>> = [];
        let journalDescription = "";
        let jeDate = parseClientDate(transaction.transactionDate) || new Date();

        if (transaction.type === 'credit') {
          if (transaction.paymentMethod === "Bursary/Scholarship") {
            if (!bursaryExpenseAccId) { errors.push(`Default Bursary Expense account not set for tx ${transaction.id}.`); continue; }
            lines = [
              { accountId: bursaryExpenseAccId, debit: transaction.amount, description: `Bursary for ${student.studentRegistrationNumber}` },
              { accountId: arAccId, credit: transaction.amount, description: `A/R reduction for bursary: ${student.studentRegistrationNumber}` },
            ];
            journalDescription = `Bursary: ${transaction.description || student.studentRegistrationNumber}`;
          } else {
            lines = [
              { accountId: cashAccId, debit: transaction.amount, description: `Payment from ${student.studentRegistrationNumber}` },
              { accountId: arAccId, credit: transaction.amount, description: `A/R reduction for ${student.studentRegistrationNumber}` },
            ];
            journalDescription = `Fee Payment: ${transaction.description || student.studentRegistrationNumber}`;
          }
        } else if (transaction.type === 'debit' && feeItemData) {
          const revenueAccId = feeItemData.revenueAccountId;
          if (!revenueAccId) { errors.push(`Revenue account not linked for FeeItem ${feeItemData.name} (tx ${transaction.id}).`); continue; }
          lines = [
            { accountId: arAccId, debit: transaction.amount, description: `Billed ${feeItemData.name} to ${student.studentRegistrationNumber}` },
            { accountId: revenueAccId, credit: transaction.amount, description: `Revenue from ${feeItemData.name}` },
          ];
          journalDescription = `Fee Billed: ${feeItemData.name} - ${student.studentRegistrationNumber}`;
        } else {
          continue; // Not suitable for auto JE
        }

        if (lines.length > 0) {
          const jeId = await createClientJournalEntry(schoolId, jeDate, journalDescription, lines, adminProfile, allChartOfAccounts, transaction.id, 'FeeTransaction');
          if (jeId) {
            mainProcessingBatch.update(txDoc.ref, { journalEntryId: jeId });
            operationsInBatch++; journalEntriesCreated++;
            await commitBatchIfNeeded();
          } else { errors.push(`Failed to create JE for fee tx ${transaction.id}`); }
        }
      }
      console.log(`Migration: Processed fee transactions for student ${student.id}.`);
    }
    
    await commitBatchIfNeeded(); // Commit any remaining operations

    const summaryMessage = `Client-side migration complete. Demo Class students updated: ${studentsUpdatedToInactive}. Financial records processed: ${transactionsProcessed}. Journal Entries attempted: ${journalUpdatesAttempted}. Journal Entries successfully created: ${journalEntriesCreated}. Errors: ${errors.length}.`;
    console.log(summaryMessage, { errors });
    return { message: summaryMessage, errors };

  } catch (error: any) {
    console.error("Critical error during client-side migration:", error);
    errors.push(`Critical migration error: ${error.message}`);
    return { message: "Client-side migration failed with a critical error.", errors };
  }
}

    
