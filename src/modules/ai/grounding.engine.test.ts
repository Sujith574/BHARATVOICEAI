import { describe, it, expect, vi } from "vitest";

import { CallSessionService } from "../voice/call-session.service";
import { GroundingEngine } from "./grounding.engine";
import type { GeminiService } from "./gemini.service";
import type { KnowledgeService } from "../knowledge/knowledge.service";

describe("CallSessionService", () => {
  it("should create, get, modify, and clear a call session", () => {
    const service = new CallSessionService();
    const twilioCallSid = "CA123456";
    const callId = "c123-uuid-456";

    // Create session
    const session = service.createSession(twilioCallSid, callId, "en-IN");
    expect(session).toBeDefined();
    expect(session.twilioCallSid).toBe(twilioCallSid);
    expect(session.callId).toBe(callId);
    expect(session.languageCode).toBe("en-IN");
    expect(session.history).toHaveLength(0);

    // Get session
    const retrieved = service.getSession(twilioCallSid);
    expect(retrieved).toBe(session);

    // Add turns
    service.addTurn(twilioCallSid, "citizen", "How do I apply for a ration card?");
    service.addTurn(twilioCallSid, "assistant", "You can apply online at the state portal.");

    expect(session.history).toHaveLength(2);
    expect(session.history[0]?.role).toBe("citizen");
    expect(session.history[1]?.role).toBe("assistant");

    // Translate to Gemini history format
    const geminiHistory = service.getHistoryForGemini(twilioCallSid);
    expect(geminiHistory).toEqual([
      { role: "user", parts: [{ text: "How do I apply for a ration card?" }] },
      { role: "model", parts: [{ text: "You can apply online at the state portal." }] },
    ]);

    // Clear session
    service.clearSession(twilioCallSid);
    expect(service.getSession(twilioCallSid)).toBeUndefined();
  });

  it("should throw error when adding a turn to non-existent session", () => {
    const service = new CallSessionService();
    expect(() => service.addTurn("UNKNOWN", "citizen", "hello")).toThrow(
      "No active call session found for Twilio Call SID: UNKNOWN"
    );
  });
});

describe("GroundingEngine", () => {
  const mockKnowledgeService = {
    search: vi.fn(),
  } as unknown as KnowledgeService;

  const mockGeminiService = {
    generateGroundedChatResponse: vi.fn(),
  } as unknown as GeminiService;

  it("should generate grounded response when context is found and Gemini answers", async () => {
    const engine = new GroundingEngine(mockKnowledgeService, mockGeminiService);

    // Mock semantic search return
    const searchSpy = vi.spyOn(mockKnowledgeService, "search").mockResolvedValueOnce([
      {
        chunkId: "chunk-1",
        documentId: "doc-1",
        content: "Citizens can apply for a ration card online using the portal.",
        similarity: 0.8,
        documentTitle: "Ration Card Rules",
      },
    ]);

    // Mock Gemini structured output response
    const geminiSpy = vi.spyOn(mockGeminiService, "generateGroundedChatResponse").mockResolvedValueOnce(
      JSON.stringify({
        response: "You can apply online using the portal.",
        isGrounded: true,
        fallbackTriggered: false,
      })
    );

    const result = await engine.generateGroundedResponse(
      "How to get a ration card?",
      [],
      "en-IN"
    );

    expect(searchSpy).toHaveBeenCalledWith(
      expect.any(Object),
      "How to get a ration card?",
      5,
      0.45
    );

    expect(geminiSpy).toHaveBeenCalledWith(
      expect.stringContaining("Citizens can apply for a ration card online using the portal."),
      expect.any(Array),
      expect.any(Object)
    );

    expect(result).toEqual({
      response: "You can apply online using the portal.",
      isGrounded: true,
      fallbackTriggered: false,
    });
  });

  it("should return fallback response when no context matches", async () => {
    const engine = new GroundingEngine(mockKnowledgeService, mockGeminiService);

    vi.spyOn(mockKnowledgeService, "search").mockResolvedValueOnce([]);

    vi.spyOn(mockGeminiService, "generateGroundedChatResponse").mockResolvedValueOnce(
      JSON.stringify({
        response: "I apologize, but I do not have that specific official information.",
        isGrounded: false,
        fallbackTriggered: true,
      })
    );

    const result = await engine.generateGroundedResponse(
      "What is the status of scheme X?",
      [],
      "en-IN"
    );

    expect(result).toEqual({
      response: "I apologize, but I do not have that specific official information.",
      isGrounded: false,
      fallbackTriggered: true,
    });
  });

  it("should handle Gemini errors gracefully and return fallback details", async () => {
    const engine = new GroundingEngine(mockKnowledgeService, mockGeminiService);

    vi.spyOn(mockKnowledgeService, "search").mockResolvedValueOnce([]);
    vi.spyOn(mockGeminiService, "generateGroundedChatResponse").mockRejectedValueOnce(
      new Error("Gemini quota exceeded")
    );

    const result = await engine.generateGroundedResponse(
      "test query",
      [],
      "en-IN"
    );

    expect(result).toEqual({
      response: "I apologize, but I encountered an error retrieving that information. Let me connect you with an officer or raise a ticket.",
      isGrounded: false,
      fallbackTriggered: true,
    });
  });
});
