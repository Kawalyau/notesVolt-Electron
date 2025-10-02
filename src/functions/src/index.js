// functions/src/index.js
const functions = require("firebase-functions");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue, Timestamp: AdminTimestamp, increment } = require("firebase-admin/firestore");
const { PDFDocument } = require("pdf-lib");
const CryptoJS = require("crypto-js");
const XLSX = require("xlsx");
const { onRequest } = require("firebase-functions/v2/https");
const { onObjectFinalized, StorageEventData } = require("firebase-functions/v2/storage");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");

const { db, storageAdmin, getFirebaseStorageBucketName, admin } = require("./config");
const { parseISO, format: formatDateFns } = require("date-fns"); // Correctly aliasing format


// Helper function to parse dates leniently - used in import functions
const parseDateLenient = (dateString) => {
  if (!dateString) return null;
  if (dateString instanceof Date) return dateString; // Already a Date object

  const stringValue = String(dateString).trim();

  // Try Excel date number (serial date)
  if (typeof dateString === 'number' && dateString > 20000 && dateString < 70000) {
    const excelEpochDiff = 25569; 
    const date = new Date(Math.round((dateString - excelEpochDiff) * 86400 * 1000));
    if (date instanceof Date && !isNaN(date.getTime()) && date.getFullYear() > 1800 && date.getFullYear() < 2100) return date;
  }

  const commonFormatsRegex = [
    /^(\d{4})-(\d{2})-(\d{2})$/,                            // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{4})$/,                          // MM/DD/YYYY or DD/MM/YYYY
    /^(\d{2})-(\d{2})-(\d{4})$/,                          // MM-DD-YYYY or DD-MM-YYYY
    /^(\d{4})\/(\d{2})\/(\d{2})$/,                          // YYYY/MM/DD
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,                      // D.M.YYYY or DD.MM.YYYY
    /^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/i // D Mon YYYY
  ];

  for (const fmtRegex of commonFormatsRegex) {
    const match = stringValue.match(fmtRegex);
    if (match) {
      try {
        let year, month, day;
        if (fmtRegex.source.includes('-') || fmtRegex.source.includes('/')) {
            if (match[1].length === 4) { year = parseInt(match[1], 10); month = parseInt(match[2], 10) - 1; day = parseInt(match[3], 10);
            } else if (parseInt(match[1], 10) > 12 && parseInt(match[3], 10) > 1900) { day = parseInt(match[1], 10); month = parseInt(match[2], 10) - 1; year = parseInt(match[3], 10);
            } else { month = parseInt(match[1], 10) - 1; day = parseInt(match[2], 10); year = parseInt(match[3], 10); }
        } else if (fmtRegex.source.includes('.')) { day = parseInt(match[1], 10); month = parseInt(match[2], 10) - 1; year = parseInt(match[3], 10);
        } else if (fmtRegex.source.includes('Jan')) { 
            day = parseInt(match[1], 10);
            const monthStr = match[2].toLowerCase();
            const monthMap = {jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11};
            month = monthMap[monthStr];
            year = parseInt(match[3], 10);
        }

        if (year !== undefined && month !== undefined && day !== undefined) {
            const parsed = new Date(year, month, day);
            if (parsed instanceof Date && !isNaN(parsed.getTime()) && parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === day) {
                if (year > 1800 && year < 2100) return parsed;
            }
        }
      } catch (e) { /* continue */ }
    }
  }
  const nativeParsed = new Date(stringValue);
  if (nativeParsed instanceof Date && !isNaN(nativeParsed.getTime()) && stringValue.length >= 6) {
    if (nativeParsed.getFullYear() > 1800 && nativeParsed.getFullYear() < 2100) return nativeParsed;
  }
  logger.warn("Could not parse date string with lenient parser:", dateString);
  return null;
};

const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());


// Helper for triggers, this creates the Journal Entry
async function createJournalEntryForTrigger(
    schoolId,
    entryDateISO, // Expecting ISO string
    description,
    lines, // Array of { accountId, debit, credit, description }
    adminId,
    adminName,
    sourceDocumentId,
    sourceDocumentType,
    academicYearId, // Added
    term // Added
) {
    const chartOfAccountsRef = db.collection(`schools/${schoolId}/chartOfAccounts`);
    const journalLinesWithNames = await Promise.all(
        lines.map(async (line) => {
            const accountDoc = await chartOfAccountsRef.doc(line.accountId).get();
            return {
                accountId: line.accountId,
                accountName: accountDoc.exists ? accountDoc.data().accountName : 'Unknown Account',
                debit: line.debit || null,
                credit: line.credit || null,
                description: line.description || null,
            };
        })
    );
    const totalDebits = journalLinesWithNames.reduce((sum, line) => sum + (line.debit || 0), 0);
    const totalCredits = journalLinesWithNames.reduce((sum, line) => sum + (line.credit || 0), 0);
    if (Math.abs(totalDebits - totalCredits) > 0.001) {
        logger.error("JE not balanced in trigger.", { schoolId, description, sourceDocumentId, sourceDocumentType });
        return null;
    }
    const journalEntryData = {
        date: entryDateISO, description, lines: journalLinesWithNames, schoolId,
        postedByAdminId: adminId, postedByAdminName: adminName || "System Trigger",
        sourceDocumentId, sourceDocumentType,
        academicYearId, // Storing academic context
        term, // Storing academic context
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    const entryRef = await db.collection(`schools/${schoolId}/journalEntries`).add(journalEntryData);
    logger.info(`Auto JE created: ${entryRef.id}`, { sourceDocumentId, sourceDocumentType });
    return entryRef.id;
}


// --- Firestore Triggers ---
exports.onFeeTransactionCreate = functions.firestore.document("schools/{schoolId}/students/{studentId}/feeTransactions/{transactionId}")
    .onCreate(async (snap, context) => {
        const { schoolId, studentId, transactionId } = context.params;
        const transaction = snap.data();
        logger.info(`FeeTransaction created (Cash Basis): ${transactionId}`, { schoolId, studentId, type: transaction.type });

        if (transaction.type !== 'credit') {
            logger.info(`Skipping JE for non-credit transaction: ${transactionId}`);
            return null;
        }

        try {
            const schoolDoc = await db.collection("schools").doc(schoolId).get();
            if (!schoolDoc.exists) { logger.error(`School ${schoolId} not found.`); return null; }
            const schoolData = schoolDoc.data();
            
            const cashAccId = schoolData.defaultCashAccountId;
            const bursaryExpenseAccId = schoolData.defaultBursaryExpenseAccountId;
            const arAccId = schoolData.defaultAccountsReceivableAccountId;

            let jeDateISO = typeof transaction.transactionDate === 'string' ? transaction.transactionDate : transaction.transactionDate.toDate().toISOString();
            let lines = [];
            let journalDescription = "";

            if (transaction.paymentMethod === "Bursary/Scholarship") {
                if (!bursaryExpenseAccId) { logger.warn("Default Bursary Expense account not set for bursary transaction.", { schoolId, transactionId }); return null; }
                if (!arAccId) { logger.warn("Default Accounts Receivable account not set for bursary JE.", { schoolId }); return null; }
                lines = [
                    { accountId: bursaryExpenseAccId, debit: transaction.amount, description: `Bursary for student ${studentId}` },
                    { accountId: arAccId, credit: transaction.amount, description: `A/R reduction for bursary` },
                ];
                journalDescription = `Bursary Award: ${transaction.description || `Student ${studentId}`}`;
            } else {
                if (!cashAccId) { logger.warn(`Default Cash/Bank account not set for school ${schoolId}.`, { schoolId }); return null; }
                const feeItems = await db.collection(`schools/${schoolId}/feeItems`).get();
                const feeItemData = transaction.feeItemId ? feeItems.docs.find(doc => doc.id === transaction.feeItemId)?.data() : null;
                const revenueAccId = feeItemData?.revenueAccountId || schoolData.defaultFeeRevenueAccountId;

                if (!revenueAccId) { logger.warn(`Default/Specific Fee Revenue account not set for school ${schoolId}.`, { schoolId, feeItemId: transaction.feeItemId }); return null; }

                lines = [
                    { accountId: cashAccId, debit: transaction.amount, description: `Payment from student ${studentId}` },
                    { accountId: revenueAccId, credit: transaction.amount, description: `Fee revenue from student ${studentId}` },
                ];
                journalDescription = `Student Fee Payment: ${transaction.description || `Student ${studentId}`}`;
            }

            if (lines.length > 0) {
                const jeId = await createJournalEntryForTrigger(schoolId, jeDateISO, journalDescription, lines, transaction.recordedByAdminId, transaction.recordedByAdminName, transactionId, 'FeeTransaction', transaction.academicYearId, transaction.term);
                if(jeId) await snap.ref.update({ journalEntryId: jeId });
            }
        } catch (error) { logger.error("Error in onFeeTransactionCreate trigger:", { error, transactionId }); }
        return null;
    });

exports.onSchoolIncomeCreate = functions.firestore.document("schools/{schoolId}/income/{incomeId}")
    .onCreate(async (snap, context) => {
        const { schoolId, incomeId } = context.params;
        const income = snap.data();
        logger.info(`SchoolIncome created (Cash Basis): ${incomeId}`, { schoolId });
        try {
            const schoolDoc = await db.collection("schools").doc(schoolId).get();
            if (!schoolDoc.exists) { logger.error(`School ${schoolId} not found.`); return null; }
            const schoolData = schoolDoc.data();
            const cashAccId = schoolData.defaultCashAccountId;
            const revenueAccId = income.accountId;
            if (!cashAccId || !revenueAccId) { logger.warn("Default Cash or Income's Revenue account not set.", { schoolId, incomeId }); return null; }
            
            let jeDateISO = typeof income.date === 'string' ? income.date : income.date.toDate().toISOString();
            const lines = [
                { accountId: cashAccId, debit: income.amount, description: `Received: ${income.description}` },
                { accountId: revenueAccId, credit: income.amount, description: `Income Source: ${income.accountName || income.source}` },
            ];
            const jeId = await createJournalEntryForTrigger(schoolId, jeDateISO, `Other Income: ${income.description}`, lines, income.recordedByAdminId, income.recordedByAdminName, incomeId, 'SchoolIncome', income.academicYearId, income.term);
            if(jeId) await snap.ref.update({ journalEntryId: jeId });
        } catch (error) { logger.error("Error in onSchoolIncomeCreate trigger:", { error, incomeId }); }
        return null;
    });

exports.onSchoolExpenseCreate = functions.firestore.document("schools/{schoolId}/expenses/{expenseId}")
    .onCreate(async (snap, context) => {
        const { schoolId, expenseId } = context.params;
        const expense = snap.data();
        logger.info(`SchoolExpense created (Cash Basis): ${expenseId}`, { schoolId });
        try {
            const schoolDoc = await db.collection("schools").doc(schoolId).get();
            if (!schoolDoc.exists) { logger.error(`School ${schoolId} not found.`); return null; }
            const schoolData = schoolDoc.data();
            const cashAccId = schoolData.defaultCashAccountId;
            const expenseAccId = expense.accountId;
            if (!cashAccId || !expenseAccId) { logger.warn("Default Cash or Expense's account not set.", { schoolId, expenseId }); return null; }
            let jeDateISO = typeof expense.date === 'string' ? expense.date : expense.date.toDate().toISOString();
            const lines = [
                { accountId: expenseAccId, debit: expense.amount, description: `Expense: ${expense.description}` },
                { accountId: cashAccId, credit: expense.amount, description: `Paid for: ${expense.description}` },
            ];
            const jeId = await createJournalEntryForTrigger(schoolId, jeDateISO, `Expense: ${expense.description}`, lines, expense.recordedByAdminId, expense.recordedByAdminName, expenseId, 'SchoolExpense', expense.academicYearId, expense.term);
            if(jeId) await snap.ref.update({ journalEntryId: jeId });
        } catch (error) { logger.error("Error in onSchoolExpenseCreate trigger:", { error, expenseId }); }
        return null;
    });


// --- All other functions (omitted for brevity) ---

exports.processUploadedResource = onObjectFinalized({ bucket: "zahara-islam-media.firebasestorage.app", cpu: 1, memory: "1GiB", timeoutSeconds: 300, region: "us-central1" }, async (event) => { /* ... */ });
exports.helloWorld = onRequest({ region: "us-central1" }, (request, response) => { logger.info("Hello logs!", { structuredData: true }); response.send("Hello from Firebase!"); });
exports.syncStudentWithSchoolPay = onCall({ region: "us-central1", enforceAppCheck: false, timeoutSeconds: 60, memory: '256MiB' }, async (request) => { /* ... */ });
exports.importStudentsFromFile = onCall({ region: "us-central1", timeoutSeconds: 540, memory: '1GiB', enforceAppCheck: false }, async (request) => { /* ... */ });
exports.importFeeTransactionsFromFile = onCall({ region: "us-central1", timeoutSeconds: 540, memory: '1GiB', enforceAppCheck: false }, async (request) => { /* ... */ });
exports.autoBillCompulsoryFees = functions.region('us-central1').firestore.document('schools/{schoolId}/feeItems/{feeItemId}').onCreate(async (snapshot, context) => { /* ... */ });
async function processSchoolPayTransactionsForSchool(schoolId, schoolData) { /* ... */ }
exports.syncSchoolPayTransactions = onSchedule({ schedule: 'every 5 minutes', region: 'us-central1', timeoutSeconds: 540, memory: '512MiB'}, async (event) => { /* ... */ });
exports.manuallySyncSchoolPayTransactionsForSchool = onCall({ region: "us-central1", timeoutSeconds: 300, memory: '512MiB', enforceAppCheck: false }, async (request) => { /* ... */ });
exports.getEgoSmsBalance = onCall({ region: "us-central1", enforceAppCheck: false, timeoutSeconds: 30, memory: '128MiB' }, async (request) => { /* ... */ });
exports.migrateHistory = onCall({ region: "us-central1", timeoutSeconds: 540, memory: '1GiB', enforceAppCheck: false }, async (request) => { /* ... */ });
exports.closeFinancialTerm = onCall({ region: "us-central1", timeoutSeconds: 540, memory: '1GiB', enforceAppCheck: false }, async (request) => { /* ... */ });


// --- NEW SMS LOGIC ---

/**
 * Sends an SMS using the EgoSMS Plain Text API.
 * This is a reusable internal helper function.
 */
async function _sendSmsPlainText(username, password, sender, recipient, message, priority = 0) {
  if (!username || !password || !sender || !recipient || !message) {
    const errorMsg = "Missing required parameters for SMS sending.";
    logger.error(errorMsg, { username: !!username, sender: !!sender, recipient: !!recipient, message: !!message });
    return { success: false, message: errorMsg };
  }

  const API_URL = "https://www.egosms.co/api/v1/plain/";
  
  const params = new URLSearchParams({
    number: recipient.replace(/\s+/g, ''),
    message: message,
    username: username,
    password: password,
    sender: sender,
    priority: priority.toString(),
  });

  const fullUrl = `${API_URL}?${params.toString()}`;
  const maskedUrl = fullUrl.replace(password, '****');
  logger.info("Calling EgoSMS Plain Text API:", { url: maskedUrl });

  try {
    const response = await fetch(fullUrl, { method: 'GET' });
    const responseText = await response.text();
    logger.info("EgoSMS Plain API response:", { recipient, responseText });

    if (responseText.includes("OK")) {
      return { success: true, message: `SMS sent. Response: ${responseText}` };
    } else {
      logger.error("EgoSMS API Error:", { responseText });
      return { success: false, message: responseText || "An unknown error occurred with EgoSMS." };
    }
  } catch (error) {
    logger.error("Network error calling EgoSMS Plain Text API:", error);
    return { success: false, message: `Network error: ${error.message}` };
  }
}

/**
 * Callable Cloud Function to send an SMS.
 * It retrieves credentials from school settings and calls the helper.
 */
exports.sendSms = onCall({ region: "us-central1", enforceAppCheck: false, timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
    logger.info("sendSms Cloud Function called with data:", request.data);
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const adminUid = request.auth.uid;
    const { schoolId, recipient, message } = request.data;

    if (!schoolId || !recipient || !message) {
      throw new HttpsError("invalid-argument", "Missing required parameters: schoolId, recipient, or message.");
    }
    
    try {
      const schoolDoc = await db.collection("schools").doc(schoolId).get();
      if (!schoolDoc.exists) {
        throw new HttpsError("not-found", "School document not found.");
      }
      const schoolData = schoolDoc.data();
      if (!schoolData.adminUids.includes(adminUid)) {
        throw new HttpsError("permission-denied", "You are not authorized to perform this action.");
      }

      if (!schoolData.enableSmsNotifications) {
        return { success: false, message: "SMS notifications are disabled for this school." };
      }
      
      const egoSmsConfig = schoolData.smsConfig?.egoSms;
      if (!egoSmsConfig?.username || !egoSmsConfig?.password || !egoSmsConfig?.sender) {
        return { success: false, message: "EgoSMS configuration is incomplete in school settings." };
      }

      const { username, password, sender } = egoSmsConfig;
      
      const result = await _sendSmsPlainText(username, password, sender, recipient, message);
      return result;

    } catch (error) {
      logger.error("Error in sendSms function:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "An unexpected error occurred while sending SMS.", error.message || String(error));
    }
});


/**
 * Firestore Trigger: Sends an SMS upon a new fee payment.
 */
exports.onFeePaymentCreateSendSms = functions.firestore
  .document("schools/{schoolId}/students/{studentId}/feeTransactions/{transactionId}")
  .onCreate(async (snap, context) => {
    const { schoolId, studentId, transactionId } = context.params;
    const transaction = snap.data();

    // 1. Check if it's a payment (credit) and not a bursary
    if (transaction.type !== 'credit' || transaction.paymentMethod === "Bursary/Scholarship") {
      logger.info(`Skipping SMS for transaction ${transactionId} (type: ${transaction.type}, method: ${transaction.paymentMethod}).`);
      return null;
    }

    logger.info(`Payment transaction ${transactionId} detected. Preparing to send SMS.`);

    try {
      // 2. Fetch School and Student data in parallel
      const schoolDocRef = db.collection("schools").doc(schoolId);
      const studentDocRef = db.collection("schools").doc(schoolId).collection("students").doc(studentId);
      
      const [schoolDoc, studentDoc] = await Promise.all([
        schoolDocRef.get(),
        studentDocRef.get(),
      ]);

      if (!schoolDoc.exists()) {
        logger.error(`School not found: ${schoolId}. Cannot send payment SMS.`);
        return null;
      }
      if (!studentDoc.exists()) {
        logger.error(`Student not found: ${studentId}. Cannot send payment SMS.`);
        return null;
      }
      
      const schoolData = schoolDoc.data();
      const studentData = studentDoc.data();

      // 3. Validate necessary data
      if (!schoolData.enableSmsNotifications) {
        logger.info(`SMS notifications disabled for school ${schoolId}.`);
        return null;
      }
      
      const egoSmsConfig = schoolData.smsConfig?.egoSms;
      if (!egoSmsConfig?.username || !egoSmsConfig?.password || !egoSmsConfig?.sender) {
        logger.warn(`EgoSMS configuration is incomplete for school ${schoolId}.`);
        return null;
      }
      
      if (!studentData.guardianPhone) {
        logger.warn(`Student ${studentId} has no guardian phone number. Cannot send SMS.`);
        return null;
      }

      // 4. Construct the message
      const amountPaid = transaction.amount.toLocaleString('en-US');
      const newBalance = studentData.feeBalance.toLocaleString('en-US');
      const studentName = `${studentData.firstName} ${studentData.lastName}`;
      
      const message = `Dear Parent, a payment of UGX ${amountPaid} for ${studentName} via ${transaction.paymentMethod} has been received. The new fee balance is UGX ${newBalance}. Thank you, ${schoolData.name}.`;

      // 5. Send the SMS using the helper
      logger.info(`Sending payment confirmation SMS to ${studentData.guardianPhone} for student ${studentId}.`);
      const result = await _sendSmsPlainText(
        egoSmsConfig.username,
        egoSmsConfig.password,
        egoSmsConfig.sender,
        studentData.guardianPhone,
        message
      );

      if (result.success) {
        logger.info(`Successfully sent payment confirmation SMS for transaction ${transactionId}.`);
        // Optionally, log this success to a separate collection or update the transaction
        await snap.ref.update({ smsNotificationStatus: 'Sent' });
      } else {
        logger.error(`Failed to send payment confirmation SMS for transaction ${transactionId}. Reason: ${result.message}`);
        await snap.ref.update({ smsNotificationStatus: 'Failed', smsNotificationError: result.message });
      }
      return null;

    } catch (error) {
      logger.error(`Error in onFeePaymentCreateSendSms trigger for transaction ${transactionId}:`, error);
      try {
        await snap.ref.update({ smsNotificationStatus: 'Error', smsNotificationError: error.message });
      } catch (updateError) {
         logger.error(`Failed to update transaction doc with SMS error state for ${transactionId}`, updateError);
      }
      return null;
    }
  });


// DEPRECATED function kept for reference, but should be removed.
exports.sendEgoSms1 = onCall({ region: "us-central1" }, (request) => {
    logger.warn("sendEgoSms1 function is deprecated and should not be used. Please use sendSms instead.");
    throw new HttpsError("failed-precondition", "This function is deprecated. Please use the 'sendSms' function.");
});
