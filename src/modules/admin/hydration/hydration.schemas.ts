import type { CallResponse } from "../calls/call.schemas";
import type { TicketResponse } from "../tickets/ticket.schemas";

export interface MobileHydrationStats {
  activeCallsCount: number;
  pendingTicketsCount: number;
  totalEscalatedCallsCount: number;
}

export interface MobileHydrationResponse {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    preferredLanguage: string | null;
    stateCode: string | null;
    roles: string[];
    permissions: string[];
  };
  stats: MobileHydrationStats;
  recentCalls: CallResponse[];
  recentTickets: TicketResponse[];
}
