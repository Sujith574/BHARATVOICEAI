export interface User {
  id: string;
  email: string;
  fullName?: string;
  role: string;
  preferredLanguage?: string;
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
}

export interface ActiveCall {
  id: string;
  twilioCallSid: string;
  callerPhoneNumber: string;
  status: "INITIATED" | "RINGING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  startedAt: string;
  durationSeconds: number;
  languageCode: string;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  sourceType: string;
  languageCode: string;
  approvalStatus: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  processingStatus: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export interface DashboardStats {
  activeCallsCount: number;
  totalTicketsCount: number;
  unresolvedTicketsCount: number;
  averageDurationSeconds: number;
  languageDistribution: {
    language: string;
    count: number;
  }[];
}
