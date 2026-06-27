/**
 * voice.repository.test.ts
 *
 * Unit tests for PrismaVoiceRepository.
 *
 * Strategy: Mock the PrismaService entirely so tests never touch a real database.
 * Each method is exercised to assert:
 *  - The correct Prisma model method is called.
 *  - The correct data shape is passed to Prisma.
 *  - The return value from Prisma is forwarded unchanged.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConversationSpeakerRole } from "@prisma/client";

import { PrismaVoiceRepository } from "./voice.repository";

// ─── Prisma mock factory ──────────────────────────────────────────────────────

const buildPrismaMock = () => ({
  call: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  callLog: {
    create: vi.fn(),
  },
  conversationHistory: {
    create: vi.fn(),
  },
  ticket: {
    create: vi.fn(),
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeCallRecord = (overrides = {}) => ({
  id: "call-uuid-123",
  twilioCallSid: "CA123",
  callerPhoneNumber: "+91-9876543210",
  status: "INITIATED",
  startedAt: new Date("2024-01-01T10:00:00Z"),
  connectedAt: null,
  endedAt: null,
  durationSeconds: null,
  confidenceScore: null,
  escalated: false,
  assignedDepartmentId: null,
  languageCode: null,
  createdAt: new Date("2024-01-01T10:00:00Z"),
  updatedAt: new Date("2024-01-01T10:00:00Z"),
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PrismaVoiceRepository", () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let repo: PrismaVoiceRepository;

  beforeEach(() => {
    prisma = buildPrismaMock();
    // Cast as any to satisfy the PrismaService type without a real connection.
    repo = new PrismaVoiceRepository(prisma as never);
  });

  // ─── createCall ────────────────────────────────────────────────────────────

  describe("createCall", () => {
    it("creates a call record with the given SID and phone number", async () => {
      const expected = makeCallRecord();
      prisma.call.create.mockResolvedValueOnce(expected);

      const result = await repo.createCall("CA123", "+91-9876543210");

      expect(prisma.call.create).toHaveBeenCalledOnce();
      expect(prisma.call.create).toHaveBeenCalledWith({
        data: {
          twilioCallSid: "CA123",
          callerPhoneNumber: "+91-9876543210",
          status: "INITIATED",
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          startedAt: expect.any(Date),
        },
      });
      expect(result).toBe(expected);
    });

    it("uses null for callerPhoneNumber when not provided", async () => {
      prisma.call.create.mockResolvedValueOnce(makeCallRecord({ callerPhoneNumber: null }));

      await repo.createCall("CA999");

      expect(prisma.call.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ callerPhoneNumber: null }),
        })
      );
    });
  });

  // ─── updateCall ────────────────────────────────────────────────────────────

  describe("updateCall", () => {
    it("updates a call record by Twilio Call SID", async () => {
      const updated = makeCallRecord({ status: "COMPLETED", endedAt: new Date() });
      prisma.call.update.mockResolvedValueOnce(updated);

      const result = await repo.updateCall("CA123", { status: "COMPLETED", endedAt: new Date() });

      expect(prisma.call.update).toHaveBeenCalledOnce();
      expect(prisma.call.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { twilioCallSid: "CA123" },
        })
      );
      expect(result).toBe(updated);
    });
  });

  // ─── findCallBySid ─────────────────────────────────────────────────────────

  describe("findCallBySid", () => {
    it("returns the call record when found", async () => {
      const expected = makeCallRecord();
      prisma.call.findUnique.mockResolvedValueOnce(expected);

      const result = await repo.findCallBySid("CA123");

      expect(prisma.call.findUnique).toHaveBeenCalledWith({ where: { twilioCallSid: "CA123" } });
      expect(result).toBe(expected);
    });

    it("returns null when no record exists", async () => {
      prisma.call.findUnique.mockResolvedValueOnce(null);

      const result = await repo.findCallBySid("CA_NOT_FOUND");

      expect(result).toBeNull();
    });
  });

  // ─── createCallLog ─────────────────────────────────────────────────────────

  describe("createCallLog", () => {
    it("creates a call log with message and metadata", async () => {
      const logRecord = {
        id: "log-uuid",
        callId: "call-uuid-123",
        eventType: "STREAM_STARTED",
        message: "Stream began",
        metadata: { streamSid: "SM123" },
        createdAt: new Date(),
      };
      prisma.callLog.create.mockResolvedValueOnce(logRecord);

      const result = await repo.createCallLog(
        "call-uuid-123",
        "STREAM_STARTED",
        "Stream began",
        { streamSid: "SM123" }
      );

      expect(prisma.callLog.create).toHaveBeenCalledOnce();
      expect(prisma.callLog.create).toHaveBeenCalledWith({
        data: {
          callId: "call-uuid-123",
          eventType: "STREAM_STARTED",
          message: "Stream began",
          metadata: { streamSid: "SM123" },
        },
      });
      expect(result).toBe(logRecord);
    });

    it("uses Prisma.JsonNull when metadata is undefined", async () => {
      const { Prisma } = await import("@prisma/client");
      prisma.callLog.create.mockResolvedValueOnce({});

      await repo.createCallLog("call-uuid-123", "STREAM_CLOSED");

      expect(prisma.callLog.create).toHaveBeenCalledWith({
        data: {
          callId: "call-uuid-123",
          eventType: "STREAM_CLOSED",
          message: null,
          metadata: Prisma.JsonNull,
        },
      });
    });
  });

  // ─── createConversationTurn ────────────────────────────────────────────────

  describe("createConversationTurn", () => {
    it("persists citizen and assistant turns with the correct speaker role", async () => {
      const turnRecord = {
        id: "turn-uuid",
        callId: "call-uuid-123",
        turnIndex: 0,
        speakerRole: ConversationSpeakerRole.CITIZEN,
        languageCode: null,
        content: "What is PM-KISAN?",
        confidenceScore: null,
        metadata: null,
        createdAt: new Date(),
      };
      prisma.conversationHistory.create.mockResolvedValueOnce(turnRecord);

      const result = await repo.createConversationTurn(
        "call-uuid-123",
        0,
        ConversationSpeakerRole.CITIZEN,
        "What is PM-KISAN?"
      );

      expect(prisma.conversationHistory.create).toHaveBeenCalledWith({
        data: {
          callId: "call-uuid-123",
          turnIndex: 0,
          speakerRole: ConversationSpeakerRole.CITIZEN,
          content: "What is PM-KISAN?",
        },
      });
      expect(result).toBe(turnRecord);
    });

    it("persists an assistant turn", async () => {
      prisma.conversationHistory.create.mockResolvedValueOnce({});

      await repo.createConversationTurn(
        "call-uuid-123",
        1,
        ConversationSpeakerRole.ASSISTANT,
        "PM-KISAN provides ₹6000 annually..."
      );

      expect(prisma.conversationHistory.create).toHaveBeenCalledWith({
        data: {
          callId: "call-uuid-123",
          turnIndex: 1,
          speakerRole: ConversationSpeakerRole.ASSISTANT,
          content: "PM-KISAN provides ₹6000 annually...",
        },
      });
    });
  });

  // ─── createTicket ──────────────────────────────────────────────────────────

  describe("createTicket", () => {
    it("creates an OPEN MEDIUM-priority ticket linked to the call", async () => {
      const ticketRecord = {
        id: "ticket-uuid",
        callId: "call-uuid-123",
        title: "Unresolved citizen query escalation",
        description: "Citizen query: What is Aadhaar?",
        status: "OPEN",
        priority: "MEDIUM",
        departmentId: null,
        assignedToUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        resolvedAt: null,
      };
      prisma.ticket.create.mockResolvedValueOnce(ticketRecord);

      const result = await repo.createTicket(
        "call-uuid-123",
        "Unresolved citizen query escalation",
        "Citizen query: What is Aadhaar?"
      );

      expect(prisma.ticket.create).toHaveBeenCalledWith({
        data: {
          callId: "call-uuid-123",
          title: "Unresolved citizen query escalation",
          description: "Citizen query: What is Aadhaar?",
          status: "OPEN",
          priority: "MEDIUM",
        },
      });
      expect(result).toBe(ticketRecord);
    });
  });
});
