/**
 * voice.repository.ts
 *
 * Data-access layer for the Voice module.
 *
 * Responsibilities:
 *  - Creating and updating Call records on incoming / completed calls.
 *  - Appending CallLog events for observability and audit trails.
 *  - Persisting each conversational turn to ConversationHistory for transcripts.
 *  - Auto-creating escalation Tickets when the AI grounding fallback fires.
 *
 * All database operations are delegated to PrismaService to keep this class
 * free of connection management concerns.
 */

import { Prisma, type Call, type CallLog, type ConversationHistory, type Ticket } from "@prisma/client";
import { ConversationSpeakerRole } from "@prisma/client";

import type { PrismaService } from "../../shared/prisma/prisma.service";

export { ConversationSpeakerRole };

// ─── Repository Interface ─────────────────────────────────────────────────────

export interface VoiceRepository {
  /**
   * Inserts a new Call record when an inbound call is first received.
   */
  createCall(twilioCallSid: string, callerPhoneNumber?: string): Promise<Call>;

  /**
   * Updates an existing Call record (e.g. to mark it COMPLETED and set duration).
   */
  updateCall(twilioCallSid: string, data: Prisma.CallUpdateInput): Promise<Call>;

  /**
   * Looks up a Call record by its Twilio Call SID. Returns null if not found.
   */
  findCallBySid(twilioCallSid: string): Promise<Call | null>;

  /**
   * Appends a structured event log entry to the given call for observability.
   */
  createCallLog(
    callId: string,
    eventType: string,
    message?: string,
    metadata?: Record<string, unknown>
  ): Promise<CallLog>;

  /**
   * Persists a single conversational turn (citizen or assistant) to the
   * conversation_history table, providing a full call transcript.
   */
  createConversationTurn(
    callId: string,
    turnIndex: number,
    speakerRole: ConversationSpeakerRole,
    content: string
  ): Promise<ConversationHistory>;

  /**
   * Auto-creates an OPEN escalation ticket linked to the given Call when the
   * AI core cannot answer from verified government context.
   */
  createTicket(callId: string, title: string, description: string): Promise<Ticket>;
}

// ─── Prisma Implementation ────────────────────────────────────────────────────

export class PrismaVoiceRepository implements VoiceRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async createCall(twilioCallSid: string, callerPhoneNumber?: string): Promise<Call> {
    return this.prisma.call.create({
      data: {
        twilioCallSid,
        callerPhoneNumber: callerPhoneNumber ?? null,
        status: "INITIATED",
        startedAt: new Date(),
      },
    });
  }

  public async updateCall(twilioCallSid: string, data: Prisma.CallUpdateInput): Promise<Call> {
    return this.prisma.call.update({
      where: { twilioCallSid },
      data,
    });
  }

  public async findCallBySid(twilioCallSid: string): Promise<Call | null> {
    return this.prisma.call.findUnique({
      where: { twilioCallSid },
    });
  }

  public async createCallLog(
    callId: string,
    eventType: string,
    message?: string,
    metadata?: Record<string, unknown>
  ): Promise<CallLog> {
    return this.prisma.callLog.create({
      data: {
        callId,
        eventType,
        message: message ?? null,
        metadata:
          metadata !== undefined
            ? (metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });
  }

  public async createConversationTurn(
    callId: string,
    turnIndex: number,
    speakerRole: ConversationSpeakerRole,
    content: string
  ): Promise<ConversationHistory> {
    return this.prisma.conversationHistory.create({
      data: {
        callId,
        turnIndex,
        speakerRole,
        content,
      },
    });
  }

  public async createTicket(callId: string, title: string, description: string): Promise<Ticket> {
    return this.prisma.ticket.create({
      data: {
        callId,
        title,
        description,
        status: "OPEN",
        priority: "MEDIUM",
      },
    });
  }
}
