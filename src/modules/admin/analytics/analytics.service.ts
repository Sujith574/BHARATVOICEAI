import type { PrismaService } from "../../../shared/prisma/prisma.service";
import type { AuthService } from "../../auth/auth.service";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { MemoryCache } from "../../../shared/cache/memory-cache";

export interface AnalyticsSummary {
  totalCalls: number;
  averageDuration: number;
  averageConfidence: number;
  escalationRate: number;
  failureRate: number;
  languageDistribution: { language: string; count: number }[];
  topQuestions: string[];
}

export class AnalyticsService {
  private readonly summaryCache = new MemoryCache(60000); // 1 minute TTL

  public constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  /**
   * Generates a statistical summary for the administrator dashboard.
   * Requires: analytics.read
   */
  public async getSummary(actor: AuthenticatedUser): Promise<AnalyticsSummary> {
    this.authService.assertPermission(actor, "analytics.read");

    const cacheKey = "global:summary";
    const cached = this.summaryCache.get<AnalyticsSummary>(cacheKey);
    if (cached) {
      return cached;
    }

    const [
      totalCalls,
      avgDurationResult,
      languageGroups,
      escalatedCount,
      failedCount,
      avgConfidence,
      recentQuestions
    ] = await Promise.all([
      this.prisma.call.count(),
      this.prisma.call.aggregate({
        _avg: {
          durationSeconds: true,
        },
      }),
      this.prisma.call.groupBy({
        by: ["languageCode"],
        _count: {
          id: true,
        },
      }),
      this.prisma.call.count({
        where: {
          escalated: true,
        },
      }),
      this.prisma.call.count({
        where: {
          status: "FAILED",
        },
      }),
      this.prisma.call.aggregate({
        _avg: {
          confidenceScore: true,
        },
      }),
      this.prisma.conversationHistory.findMany({
        where: {
          speakerRole: "CITIZEN",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
        select: {
          content: true,
        },
      }),
    ]);

    const averageDuration = Math.round(avgDurationResult._avg.durationSeconds || 0);
    const averageConfidence = parseFloat((avgConfidence._avg.confidenceScore || 0).toFixed(2));
    const escalationRate = totalCalls > 0 ? parseFloat(((escalatedCount / totalCalls) * 100).toFixed(1)) : 0;
    const failureRate = totalCalls > 0 ? parseFloat(((failedCount / totalCalls) * 100).toFixed(1)) : 0;

    const languageDistribution = languageGroups.map((g) => ({
      language: g.languageCode || "en-IN",
      count: g._count.id,
    }));

    const summary = {
      totalCalls,
      averageDuration,
      averageConfidence,
      escalationRate,
      failureRate,
      languageDistribution,
      topQuestions: recentQuestions.map((q) => q.content),
    };

    this.summaryCache.set(cacheKey, summary);
    return summary;
  }
}
