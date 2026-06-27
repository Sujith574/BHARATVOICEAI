import type { AuthenticatedUser } from "../../auth/auth.types";
import type { AuthService } from "../../auth/auth.service";
import type { CallRepository } from "../calls/call.repository";
import type { TicketRepository } from "../tickets/ticket.repository";
import type { MobileHydrationResponse } from "./hydration.schemas";

export class HydrationService {
  public constructor(
    private readonly callRepository: CallRepository,
    private readonly ticketRepository: TicketRepository,
    private readonly authService: AuthService
  ) {}

  public async hydrateDashboard(actor: AuthenticatedUser): Promise<MobileHydrationResponse> {
    this.authService.assertPermission(actor, "mobile.dashboard.read");

    const [
      activeCallsCount,
      pendingTicketsCount,
      totalEscalatedCallsCount,
      recentCallsResult,
      recentTicketsResult
    ] = await Promise.all([
      this.callRepository.countActive(),
      this.ticketRepository.countPending(),
      this.callRepository.countEscalated(),
      this.callRepository.findMany({}, { page: 1, pageSize: 5 }),
      this.ticketRepository.findMany({}, { page: 1, pageSize: 5 })
    ]);

    return {
      user: {
        id: actor.id,
        email: actor.email,
        fullName: actor.fullName ?? null,
        preferredLanguage: actor.preferredLanguage ?? null,
        stateCode: actor.stateCode ?? null,
        roles: actor.roles.map((r) => r.code),
        permissions: actor.permissions
      },
      stats: {
        activeCallsCount,
        pendingTicketsCount,
        totalEscalatedCallsCount
      },
      recentCalls: recentCallsResult.data,
      recentTickets: recentTicketsResult.data
    };
  }
}
