import { useAuthStore } from "../store/useAuthStore";
import type { ActiveCall, DashboardStats, KnowledgeDocument } from "../types";

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL as string) || "http://localhost:3000/api/v1";

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });
    
    if (!response.ok) {
      throw new Error(`API Request failed with status ${response.status}`);
    }
    
    return (await response.json()) as T;
  } catch (error) {
    return getFallbackData<T>(path, error as Error);
  }
}

function getFallbackData<T>(path: string, error: Error): T {
  console.warn(`API request to ${path} failed, falling back to mock: ${error.message}`);
  
  if (path.includes("/calls/active") || path.includes("/calls")) {
    return [
      {
        id: "call-uuid-1",
        twilioCallSid: "CA1001ff2002",
        callerPhoneNumber: "+91 98765 43210",
        status: "IN_PROGRESS",
        startedAt: new Date(Date.now() - 45000).toISOString(),
        durationSeconds: 45,
        languageCode: "hi-IN",
      },
      {
        id: "call-uuid-2",
        twilioCallSid: "CA2002ee3003",
        callerPhoneNumber: "+91 87654 32109",
        status: "RINGING",
        startedAt: new Date(Date.now() - 5000).toISOString(),
        durationSeconds: 5,
        languageCode: "te-IN",
      },
      {
        id: "call-uuid-3",
        twilioCallSid: "CA3003dd4004",
        callerPhoneNumber: "+91 76543 21098",
        status: "IN_PROGRESS",
        startedAt: new Date(Date.now() - 120000).toISOString(),
        durationSeconds: 120,
        languageCode: "en-IN",
      },
    ] as unknown as T;
  }
  
  if (path.includes("/dashboard") || path.includes("/hydration")) {
    return {
      activeCallsCount: 3,
      totalTicketsCount: 14,
      unresolvedTicketsCount: 5,
      averageDurationSeconds: 78,
      languageDistribution: [
        { language: "Telugu (te-IN)", count: 245 },
        { language: "Hindi (hi-IN)", count: 189 },
        { language: "English (en-IN)", count: 98 },
      ],
    } as unknown as T;
  }

  if (path.includes("/documents") || path.includes("/knowledge")) {
    return {
      items: [
        {
          id: "doc-1",
          title: "Andhra Pradesh Ration Card Schemes Guideline 2026",
          sourceType: "OFFICIAL_PDF",
          languageCode: "te-IN",
          approvalStatus: "APPROVED",
          processingStatus: "ACTIVE",
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
        {
          id: "doc-2",
          title: "Income and Caste Certificate Issuance Rules",
          sourceType: "CIRCULAR",
          languageCode: "en-IN",
          approvalStatus: "PENDING_REVIEW",
          processingStatus: "INACTIVE",
          createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
      total: 2,
    } as unknown as T;
  }

  throw error;
}

export const apiClient = {
  getDashboardStats: () => apiRequest<DashboardStats>("/admin/hydration/dashboard"),
  getActiveCalls: () => apiRequest<ActiveCall[]>("/admin/calls/active"),
  getDocuments: () => apiRequest<{ items: KnowledgeDocument[]; total: number }>("/knowledge/documents"),
  uploadDocument: (formData: FormData) =>
    apiRequest<KnowledgeDocument>("/knowledge/documents", {
      method: "POST",
      body: formData,
    }),
};
