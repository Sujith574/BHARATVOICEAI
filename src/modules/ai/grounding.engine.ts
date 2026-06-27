import type { AuthenticatedUser } from "../auth/auth.types";
import type { GeminiService } from "./gemini.service";
import type { KnowledgeService } from "../knowledge/knowledge.service";

export interface GroundedResponse {
  response: string;
  isGrounded: boolean;
  fallbackTriggered: boolean;
}

export class GroundingEngine {
  private readonly systemActor: AuthenticatedUser = {
    id: "system-grounding-actor",
    authUserId: "system-grounding-actor",
    email: "system-grounding@bharatvoice.gov.in",
    fullName: "System Grounding Actor",
    status: "ACTIVE",
    roles: [],
    permissions: ["knowledge.read"],
  };

  public constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly geminiService: GeminiService
  ) {}

  /**
   * Orchestrates the RAG loop.
   * 1. Performs vector search for context chunks.
   * 2. Builds system instruction with context.
   * 3. Formulates Gemini request with dialogue history.
   * 4. Enforces structured response schema.
   */
  public async generateGroundedResponse(
    query: string,
    history: { role: "user" | "model"; parts: { text: string }[] }[],
    languageCode: string
  ): Promise<GroundedResponse> {
    // 1. Search for relevant context (K=5, Threshold=0.45 for safety)
    const searchResults = await this.knowledgeService.search(
      this.systemActor,
      query,
      5,
      0.45
    );

    // 2. Format grounding context text
    const contextText = searchResults.length > 0
      ? searchResults
          .map((res, index) => `[Source ${index + 1} - ${res.documentTitle}]: ${res.content}`)
          .join("\n\n")
      : "No official documents match this query.";

    // 3. Compile System Instruction
    const systemInstruction = `You are the conversational assistant for Bharat Voice, the 24x7 Government Citizen Assistance Platform of India.
You act like a highly professional, polite, and helpful government information officer.

CRITICAL INSTRUCTIONS FOR GROUNDING:
- You must answer the user's query using ONLY the verified official document context provided below.
- Do NOT use outside knowledge or assume/extrapolate facts not explicitly stated in the context.
- If the context does not contain the answer, or if there is no context:
  1. Set "fallbackTriggered" to true.
  2. Set "isGrounded" to false.
  3. Set "response" to a polite apology stating that you do not have that specific official information at this moment, and offer to raise/escalate a support ticket.
- If the context contains the answer:
  1. Set "fallbackTriggered" to false.
  2. Set "isGrounded" to true.
  3. Set "response" to the grounded answer. Make it brief, clear, conversational, and direct for a voice call (avoid formatting like markdown bold/italics, bullet lists, or headers since this is read aloud).

VERIFIED CONTEXT FROM OFFICIAL DOCUMENTS:
${contextText}

Target Language: ${languageCode}
Ensure the voice response is naturally translated/spoken in the target language (e.g. Hindi, English, Tamil).`;

    // 4. Structured Response JSON Schema
    const responseSchema = {
      type: "OBJECT",
      properties: {
        response: {
          type: "STRING",
          description: "Clear, spoken-friendly voice response in the target language.",
        },
        isGrounded: {
          type: "BOOLEAN",
          description: "True if answered fully using only the provided context. False if fallback is triggered.",
        },
        fallbackTriggered: {
          type: "BOOLEAN",
          description: "True if context is insufficient to answer the query.",
        },
      },
      required: ["response", "isGrounded", "fallbackTriggered"],
    };

    // 5. Append user query to history contents
    const contents = [
      ...history,
      {
        role: "user" as const,
        parts: [{ text: query }],
      },
    ];

    try {
      const rawJson = await this.geminiService.generateGroundedChatResponse(
        systemInstruction,
        contents,
        responseSchema
      );

      const parsed = JSON.parse(rawJson) as Partial<GroundedResponse>;

      return {
        response: parsed.response ?? "I apologize, but I am unable to answer that at the moment. Would you like me to escalate this query?",
        isGrounded: parsed.isGrounded ?? false,
        fallbackTriggered: parsed.fallbackTriggered ?? true,
      };
    } catch {
      // Fallback in case of Gemini generation or parsing failure
      return {
        response: "I apologize, but I encountered an error retrieving that information. Let me connect you with an officer or raise a ticket.",
        isGrounded: false,
        fallbackTriggered: true,
      };
    }
  }
}
