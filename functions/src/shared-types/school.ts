
// src/types/school.ts
import type { Timestamp as FirebaseClientTimestamp } from 'firebase/firestore';
// Admin SDK Timestamp is only used internally within functions and converted before interacting with shared types.
// So, AppTimestamp primarily refers to client-side expected types or ISO strings.
export type AppTimestamp = FirebaseClientTimestamp | string;


interface PrimaryContact {
  fullName: string;
  position: string;
  phoneNumber: string;
  emailAddress: string;
  nin?: string | null;
}

export interface SchoolClass {
  id: string;
  class: string; // e.g., P1, S1
  code?: string | null; // e.g., P1A, S1BLUE (Optional alternative identifier)
  createdAt?: AppTimestamp;
}

export interface SchoolSubject {
  id: string;
  subject: string; // e.g., Mathematics, English
  code?: string | null; // Optional subject code
  createdAt?: AppTimestamp;
}

export interface SchoolStream {
  id: string;
  name: string; // e.g., Red, Blue, North Wing
  createdAt?: AppTimestamp;
}

export interface SchoolAcademicYear {
  id: string;
  year: string; // e.g., "2024", "2024-2025"
  createdAt?: AppTimestamp;
}

export interface SchoolTerm {
  id: string;
  name: string; // e.g., "Term 1", "Semester A"
  academicYearId: string; // ID of the SchoolAcademicYear it belongs to
  academicYearName?: string; // Denormalized for display
  createdAt?: AppTimestamp;
}


export interface NewPhysicalRequirementState {
  name: string;
  description: string;
  category: string;
  price: number;
  quantityPerStudent: number;
  unit: string;
  assignmentType: 'class' | 'optional_general' | 'individual_specific';
  isCompulsory: boolean;
  allowPhysicalProvision: boolean;
  applicableClassIds: string[];
  notes: string;
}

export interface PhysicalRequirement extends Omit<NewPhysicalRequirementState, 'applicableClassIds'> {
  id: string;
  applicableClassIds?: string[];
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}


export interface StudentRequirementStatus {
  id?: string; // requirementId
  requirementId: string;
  requirementName: string; // Denormalized
  originalPricePerUnit: number;
  originalQuantityNeeded: number;
  totalExpectedAmount: number; // price * quantityNeeded
  amountPaid: number; // Monetary payment towards this requirement
  quantityProvided: number; // Physical items provided by student/parent
  status: 'Fully Settled' | 'Partially Settled' | 'Pending' | 'Exempted' | 'Fully Settled (Monetary)' | 'Fully Settled (Physical)' | 'Fully Settled (Mixed)';
  lastTransactionDate?: AppTimestamp;
  notes?: string | null;
  academicYearId?: string | null; // Context of this status/payment
  term?: string | null; // Context of this status/payment
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}

export interface StudentRequirementAssignmentLog {
  id?: string;
  studentId: string; 
  requirementId: string;
  requirementName: string; // Denormalized
  quantityAssigned: number; // Quantity GIVEN to student by school
  assignmentDate: AppTimestamp;
  notes?: string | null;
  adminId: string; // UID of admin who recorded the assignment
  adminName?: string; // Display name of admin
}


export interface ClassSpecificAmount {
  classId: string;
  className?: string; 
  amount: number;
}

export interface FeeItem {
  id: string;
  name: string;
  description?: string | null;
  isRecurring: boolean;
  isCompulsory: boolean;
  academicYearId?: string | null; 
  term?: string | null;          
  classAmounts: ClassSpecificAmount[];
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}

export interface NewFeeItemFormValues { // This type is for the form, can stay if used by components
    name: string;
    description: string;
    isRecurring: boolean;
    isCompulsory: boolean;
    classAmounts: Array<{ classId: string; amount: string | number }>;
}

export interface SchoolPayConfig {
  schoolCode?: string | null;
  password?: string | null;
}

export interface RegistrationNumberConfig {
  prefix?: string | null;
  nextSuffix?: number | null;
  suffixPadding?: number | null;
}

export interface Student {
  id: string;
  schoolId: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: 'Male' | 'Female' | 'Other';
  dateOfBirth: AppTimestamp; // Storing as ISO string after parsing in functions
  classId: string;
  streamId?: string | null;
  studentRegistrationNumber: string;
  
  email?: string | null;
  phoneNumber?: string | null;
  nationality?: string | null;
  disability?: boolean | string | null; 
  disabilityNature?: string | null;

  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  guardianRelation?: string | null; 

  dayBoardingStatus?: 'Day' | 'Boarder' | string | null; 

  photoUrl?: string | null;
  admissionDate?: AppTimestamp;
  status: 'Active' | 'Inactive' | 'Graduated' | 'Withdrawn';

  schoolPaySyncedAt?: AppTimestamp | null;
  schoolPaySyncStatus?: 'Success' | 'Failed' | 'Pending' | null;
  schoolPaySyncMessage?: string | null;
  schoolPayStudentId?: string | null;

  feeBalance?: number; // Sum of all debit/credit fee transactions

  createdAt: AppTimestamp; // Storing as ISO string after creation in functions
  updatedAt: AppTimestamp; // Storing as ISO string after update in functions
  createdBy: string;
}

export interface FeeTransaction {
  id?: string;
  studentId: string;
  schoolId: string;
  type: 'debit' | 'credit';
  description: string;
  amount: number; 
  feeItemId?: string | null; 
  academicYearId?: string | null; 
  term?: string | null;          
  transactionDate: AppTimestamp; // Storing as ISO string after creation in functions
  recordedByAdminId: string;
  recordedByAdminName?: string | null;
  paymentMethod?: string | null; 
  reference?: string | null;     
  createdAt?: AppTimestamp; // Storing as ISO string after creation in functions
}


export interface FeeReceiptItemDetails {
  name: string; // Name of the fee item billed
  billedAmount: number; // Amount billed for this item in the context
}

export interface FeeReceiptData {
  schoolName: string;
  schoolAddress?: string | null;
  schoolPhone?: string | null;
  schoolLogoUrl?: string | null;
  studentName: string;
  studentRegNo: string;
  studentClass: string;
  receiptNumber: string; // Transaction ID of the payment
  transactionDate: string; // Formatted string for display
  paymentReceived: number;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  paidForDescription: string; // From the payment transaction
  academicYear: string; // Context of the payment transaction
  term: string;         // Context of the payment transaction
  items: FeeReceiptItemDetails[]; // Billed items within the transaction's academic context
  totalBilledThisContext: number; // Total billed for all items in transaction's context
  totalPaidThisContext: number; // Total paid by student within transaction's context UP TO this transaction
  previousOverallBalance: number; 
  newOverallBalance: number; 
}

export interface RequirementPaymentReceiptData {
  schoolName: string;
  schoolAddress?: string | null;
  schoolPhone?: string | null;
  schoolLogoUrl?: string | null;
  studentName: string;
  studentRegNo: string;
  studentClass: string;
  transactionDate: string; // Date of the last recorded payment/provision
  currentAcademicYear?: string;
  currentTerm?: string;
  items: ReceiptItemData[]; 
  totalNetMonetaryDueOverall: number; 
}

export interface ReceiptItemData {
  id: string; // Requirement ID
  name: string;
  isCompulsory: boolean;
  unitPrice: number;
  qtyNeeded: number;
  qtyPhysicallyProvidedByStudent: number; 
  qtyCoveredByPaymentMonetaryEquiv: number; 
  qtyAlreadyGivenToStudent: number; 
  effectiveTotalQtySettled: number; 
  physicalQtyStillDueFromStudent: number; 
  netMonetaryBalanceDueForUnprovidedItems: number; 
  isCurrentTransactionItem: boolean; 
}


export interface SchoolExpense {
  id: string;
  date: AppTimestamp;
  category: string;
  description: string;
  amount: number;
  paymentMethod?: string | null;
  reference?: string | null;
  recordedByAdminId: string;
  recordedByAdminName?: string | null;
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}

export interface SchoolIncome {
  id: string;
  date: AppTimestamp;
  source: string;
  description: string;
  amount: number;
  paymentMethodReceived?: string | null;
  reference?: string | null;
  recordedByAdminId: string;
  recordedByAdminName?: string | null;
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}


export interface School {
  id: string;
  name: string;
  schoolType: string; 
  ownership: string; 
  motto?: string | null;
  yearEstablished?: number | null; 
  level: string; 
  curriculum?: string | null; 
  gradingSystem?: string | null; 
  
  currentAcademicYearId?: string | null;
  currentTerm?: string | null; 
  termStructure?: string | null; 
  timezone?: string | null; 

  registrationNumber?: string | null; 
  unebCentreNumber?: string | null;
  upiNumber?: string | null; 
  badgeImageUrl?: string | null;
  description?: string | null;

  // Location
  district: string;
  subcounty: string;
  parish?: string | null;
  village?: string | null;
  address: string; 
  gpsCoordinates?: { lat: number; lng: number } | null;

  // Contact
  phoneNumber?: string | null;
  email?: string | null;
  website?: string | null;

  primaryContact: PrimaryContact;

  // Finance & Payment
  currency?: 'UGX'; 
  acceptsMobileMoney?: boolean;
  preferredPaymentProvider?: string | null; 
  feeStructureUrl?: string | null; 
  bankAccountInfo?: string | null; 
  schoolPayConfig?: SchoolPayConfig | null;
  registrationNumberConfig?: RegistrationNumberConfig | null;

  // Document Uploads
  registrationCertificateUrl?: string | null;
  unebCertificateUrl?: string | null;
  headteacherAppointmentLetterUrl?: string | null;
  academicCalendarUrl?: string | null;


  // System Features
  enableStudentPortal?: boolean;
  enableParentPortal?: boolean;
  enableTeacherPortal?: boolean;
  enableSmsNotifications?: boolean;
  smsGatewayConfig?: string | null; 
  enableAttendanceTracking?: boolean;
  enableExamsModule?: boolean;
  enableTimetableModule?: boolean;
  enableHostelModule?: boolean;
  enableTransportModule?: boolean;
  enableLibraryModule?: boolean;
  enableReportsModule?: boolean;
  enableInventoryAssetsModule?: boolean;

  // Platform & Tenant (Advanced)
  multiTenantCode?: string | null;
  customDomain?: string | null;
  dataRetentionPolicyYears?: number | null;
  autoBackupEnabled?: boolean;
  complianceTags?: string[]; 

  adminUids: string[];
  createdBy: string;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}


export interface SchoolFormData { // This type is primarily for the main school settings form
  // Basic Info
  name: string;
  schoolType: string;
  schoolTypeOther?: string;
  ownership: string;
  ownershipOther?: string;
  motto?: string;
  yearEstablished?: number | null;
  level: string;
  levelOther?: string;
  curriculum?: string;
  gradingSystem?: string;
  registrationNumber?: string;
  unebCentreNumber?: string;
  upiNumber?: string;
  badgeImage?: File | null;
  description?: string;

  // Location
  district: string;
  districtOther?: string;
  subcounty: string;
  parish?: string;
  village?: string;
  address: string;
  gpsCoordinatesLat?: number | null;
  gpsCoordinatesLng?: number | null;

  // Contact
  phoneNumber?: string;
  email?: string;
  website?: string;

  // Primary Contact (Admin Info)
  primaryContact_fullName: string;
  primaryContact_position: string;
  primaryContact_positionOther?: string;
  primaryContact_phoneNumber: string;
  primaryContact_emailAddress: string;
  primaryContact_nin?: string;

  // Academic Settings (General)
  currentAcademicYearId?: string | null;
  currentTerm?: string | null;
  termStructure?: string | null;
  timezone?: string | null;
  academicCalendarFile?: File | null;
  
  // Finance & Payment
  currency?: 'UGX';
  acceptsMobileMoney?: boolean;
  preferredPaymentProvider?: string;
  preferredPaymentProviderOther?: string;
  feeStructureFile?: File | null;
  bankAccountInfo?: string;

  // SchoolPay Config
  schoolPay_schoolCode?: string;
  schoolPay_password?: string;

  // Registration Number Config
  regNum_prefix?: string;
  regNum_nextSuffix?: number | null;
  regNum_suffixPadding?: number | null;

  // Document Uploads
  registrationCertificateFile?: File | null;
  unebCertificateFile?: File | null;
  headteacherAppointmentLetterFile?: File | null;

  // System Features
  enableStudentPortal?: boolean;
  enableParentPortal?: boolean;
  enableTeacherPortal?: boolean;
  enableSmsNotifications?: boolean;
  smsGatewayConfig?: string;
  enableAttendanceTracking?: boolean;
  enableExamsModule?: boolean;
  enableTimetableModule?: boolean;
  enableHostelModule?: boolean;
  enableTransportModule?: boolean;
  enableLibraryModule?: boolean;
  enableReportsModule?: boolean;
  enableInventoryAssetsModule?: boolean;

  // Platform & Tenant
  multiTenantCode?: string;
  customDomain?: string;
  dataRetentionPolicyYears?: number | null;
  autoBackupEnabled?: boolean;
  complianceTags?: string; 
}
