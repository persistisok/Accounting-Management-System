export interface User {
  id: string;
  username: string;
  displayName: string;
  role: 'SYSTEM_ADMIN' | 'ADMIN' | 'PM' | 'EXTERNAL';
  projectManagerId: string | null;
  projectManager?: ProjectManager | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  permissions: AccountPermission[];
  projectIds?: string[];
  projectScopes?: { projectId: string; project: Pick<Project, 'id' | 'projectCode' | 'name'> }[];
}

export type PermissionResource = 'PROJECTS' | 'CONTRACTS' | 'BANKING' | 'INVOICES' | 'DONATION_RECEIPTS' | 'SUPPORTERS' | 'EXECUTORS' | 'EXPERTS' | 'MEMBERS';
export type PermissionLevel = 'VIEW' | 'ENTRY' | 'EDIT' | 'REVIEW';
export interface AccountPermission { resource: PermissionResource; level: PermissionLevel }

export interface ProjectManager {
  id: string;
  displayName: string;
  department?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: { projects: number };
}

export interface ListResponse<T> { items: T[]; total: number }

export interface ProjectListResponse extends ListResponse<Project> {
  totals: {
    approvedAmount: string;
    supportAgreementAmount: string;
    receivedAmount: string;
  };
}

export type LedgerAttachmentObjectType = 'PROJECT' | 'PROJECT_ARCHIVE_ITEM' | 'CONTRACT' | 'BANK_TRANSACTION' | 'INVOICE' | 'DONATION_RECEIPT' | 'MEMBERSHIP';

export interface LedgerAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: string;
  createdAt: string;
}

export interface ArchiveChecklistItem {
  key: string;
  label: string;
  requirement: 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL';
  condition?: string;
  id?: string;
  status: 'NOT_UPLOADED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  notApplicable: boolean;
  notApplicableReason?: string;
  rejectionReason?: string;
  submittedAt?: string;
  reviewedAt?: string;
  uploader?: Pick<User, 'id' | 'displayName'>;
  reviewer?: Pick<User, 'id' | 'displayName'>;
  attachments: LedgerAttachment[];
}

export interface ArchiveChecklistResponse {
  project: Pick<Project, 'id' | 'projectCode' | 'name' | 'archiveStatus'>;
  items: ArchiveChecklistItem[];
  summary: { total: number; required: number; notUploaded: number; pending: number; approved: number; approvedRequired: number; rejected: number; readyForArchive: boolean };
}

export interface FinancialSummary {
  receivableAmount: string;
  receivedAmount: string;
  invoicedAmount: string;
  receivedInvoiceAmount: string;
  payableExecutionAmount: string;
  paidExecutionAmount: string;
  paidExpertAmount: string;
  memberDueReceivedAmount: string;
  memberDueInvoicedAmount: string;
  unreceivedAmount: string;
  uninvoicedAmount: string;
  unpaidExecutionAmount: string;
}

export interface Project {
  id: string;
  projectCode: string;
  platform: string;
  platformAbbreviation?: string;
  publishedOn: string;
  name: string;
  nature: string;
  projectType: string;
  periodMonths: number;
  approvedAmount: string;
  executionCost: string;
  pmName: string;
  pmUserId?: string;
  status: string;
  archiveStatus: 'UNARCHIVED' | 'ARCHIVED';
  requestedStatus?: 'CLOSED' | 'ABORTED' | null;
  statusReviewState?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  statusRequestedAt?: string | null;
  statusReviewedAt?: string | null;
  statusRequester?: Pick<User, 'id' | 'displayName'> | null;
  statusReviewer?: Pick<User, 'id' | 'displayName'> | null;
  requestedArchiveStatus?: 'ARCHIVED' | null;
  archiveReviewState?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  archiveRequestedAt?: string | null;
  archiveReviewedAt?: string | null;
  archiveRequester?: Pick<User, 'id' | 'displayName'> | null;
  archiveReviewer?: Pick<User, 'id' | 'displayName'> | null;
  remark?: string;
  pm?: ProjectManager;
  financialSummary: FinancialSummary;
  attachments: LedgerAttachment[];
  contracts?: Contract[];
  allocations?: BankAllocation[];
  invoices?: Invoice[];
}

export interface ProjectFilterOptions {
  platforms: string[];
  natures: string[];
  projectTypes: string[];
  projectManagers: Pick<ProjectManager, 'id' | 'displayName'>[];
}

export interface Organization {
  id: string;
  organizationCode: string;
  name: string;
  platform: string;
  joinedOn?: string;
  contactName?: string;
  contactPhone?: string;
  status: string;
  ownerUserId?: string;
  owner: ProjectManager;
  cumulativeAmount?: string;
  roles?: { roleType: string }[];
  executorOtherCapabilityNote?: string | null;
  serviceCapabilities?: ServiceCapability[];
  documents?: ExecutorDocument[];
}

export interface ServiceCapability {
  id: string;
  name: string;
  isOther: boolean;
  status: string;
  sortOrder: number;
}

export type ExecutorDocumentType = 'EXECUTOR_BUSINESS_LICENSE' | 'EXECUTOR_COMMITMENT' | 'EXECUTOR_LEGAL_REP_ID';

export interface ExecutorDocument {
  id: string;
  documentType: ExecutorDocumentType;
  fileName: string;
  contentType: string;
  sizeBytes: string;
  createdAt: string;
}

export interface Contract {
  id: string;
  contractNo: string;
  contractDirection: string;
  contractType: string;
  contractEntity: string;
  projectId?: string;
  counterpartyId?: string;
  amount: string;
  signedOn: string;
  status: string;
  remark?: string;
  project: Pick<Project, 'id' | 'projectCode' | 'name'>;
  counterparty: Pick<Organization, 'id' | 'organizationCode' | 'name'>;
  attachments: LedgerAttachment[];
}

export interface DonationReceipt {
  id: string;
  donorName: string;
  phoneMasked?: string;
  issuedOn: string;
  invoiceType: string;
  invoicePlatform: string;
  sellerName: string;
  totalAmount: string;
  taxRate: string;
  amountExcludingTax: string;
  taxAmount: string;
  status: 'NORMAL' | 'VOID';
  attachments: LedgerAttachment[];
}

export interface DonationReceiptListResponse extends ListResponse<DonationReceipt> {
  summary: { amount: string; count: number };
}

export interface AuditLog {
  id: string;
  action: string;
  objectType: string;
  objectId: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  requestId?: string;
  ipAddress?: string;
  occurredAt: string;
  objectDisplayName?: string;
  actor?: Pick<User, 'id' | 'displayName' | 'username'> | null;
}

export interface AuditFilterOptions {
  actors: Array<Pick<User, 'id' | 'displayName' | 'username'>>;
  actions: string[];
  objectTypes: string[];
}

export interface BankAllocation {
  id: string;
  category: string;
  allocatedAmount: string;
  status: string;
  project?: Pick<Project, 'id' | 'projectCode' | 'name'>;
  expertProfile?: { id: string; professionalTitle?: string; person: { name: string } };
  bankTransaction?: {
    id: string;
    transactionAt: string;
    counterpartyName: string;
    counterpartyBankName?: string;
    counterpartyAccountMasked?: string;
    amount: string;
    nature: string;
    matchStatus: string;
    settlementApplicable: boolean;
    bankAccount: { bankName: string; accountNumberMasked: string };
  };
  memberDue?: { id: string; dueCode: string; periodLabel?: string; membership: { id: string; memberName: string; committee?: { name: string } } };
}

export interface BankingImportResult {
  total: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ row: number; message: string }>;
  expertReport?: { fileName: string; contentBase64: string; rowCount: number };
}

export interface BankTransaction {
  id: string;
  transactionNo?: string;
  bankAccountId: string;
  transactionAt: string;
  counterpartyName: string;
  counterpartyBankName?: string;
  counterpartyAccountMasked?: string;
  direction: 'IN' | 'OUT';
  amount: string;
  nature: string;
  settlementApplicable: boolean;
  matchStatus: string;
  sourceType: string;
  bankAccount: { bankName: string; accountNumberMasked: string };
  allocations: BankAllocation[];
  attachments: LedgerAttachment[];
}

export interface Invoice {
  id: string;
  projectId?: string;
  membershipId?: string;
  expertProfileId?: string;
  payerName?: string;
  collectionStatus: 'NOT_APPLICABLE' | 'PENDING' | 'COLLECTED';
  category: InvoiceCategory;
  direction: 'ISSUED' | 'RECEIVED';
  issuedOn: string;
  invoiceType: string;
  invoicePlatform: string;
  buyerName: string;
  amountExcludingTax: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  status: string;
  project?: Pick<Project, 'id' | 'projectCode' | 'name'>;
  membership?: { id: string; memberName: string; memberType: string; committee?: Pick<Committee, 'id' | 'committeeCode' | 'name'> };
  expertProfile?: { id: string; person: { name: string; organizationName?: string } };
  attachments: LedgerAttachment[];
}

export type InvoiceCategory = 'SUPPORT_RECEIPT_ISSUED' | 'MEMBER_DUE_ISSUED' | 'EXECUTION_PAYMENT_RECEIVED' | 'EXPERT_FEE_RECEIVED';

export interface Expert {
  id: string;
  formOwnerId?: string;
  professionalTitle?: string;
  bankName?: string;
  bankAccountMasked?: string;
  joinedOn: string;
  reviewStatus: string;
  status: string;
  person: {
    id: string;
    name: string;
    phoneMasked?: string;
    idNumberMasked?: string;
    email?: string;
    organizationName?: string;
    department?: string;
    position?: string;
  };
  formOwner: ProjectManager;
  reviewer?: User;
  credentials: ExpertCredential[];
  paymentCount: number;
  paymentAmount: string;
}

export interface ExpertCredential extends LedgerAttachment {}

export interface ExpertSensitiveDetails {
  name: string;
  phone?: string;
  idNumber?: string;
  bankAccount?: string;
  unavailableFields: string[];
}

export interface Committee {
  id: string;
  committeeCode: string;
  name: string;
  establishedOn: string;
  ownerUserId?: string;
  status?: string;
  owner: ProjectManager;
  _count?: { memberships: number };
}

export interface MemberDue {
  id: string;
  dueCode: string;
  periodLabel?: string;
  amountDue: string;
  amountPaid?: string;
  lastPaidAt?: string;
  dueOn?: string;
  status: string;
}

export interface Membership {
  id: string;
  memberName: string;
  organizationName?: string;
  department?: string;
  idNumberMasked?: string;
  phoneMasked?: string;
  email?: string;
  memberType: string;
  memberPosition?: string;
  certificateIssued: boolean;
  appointmentLetterIssued: boolean;
  committeeMemberStatus?: 'IN_OFFICE' | 'LEFT_OFFICE';
  committeeTerm?: number;
  committeeId?: string;
  pmUserId?: string;
  joinedOn?: string;
  status: string;
  committee?: Committee;
  pm: ProjectManager;
  dues: MemberDue[];
  attachments?: LedgerAttachment[];
  feeSummary: { receivableAmount: string; receivedAmount: string; invoicedAmount: string };
  _count?: { dues: number };
}
