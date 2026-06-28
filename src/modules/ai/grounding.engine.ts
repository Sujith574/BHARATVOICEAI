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
   * Generates a conversational AI response.
   * - Agent Identity: "Bharat Voice", developed by the Government of India.
   * - Answers all positive/helpful citizen questions directly via Gemini API.
   * - Restricts answers to positive, legal, safe, and clean content.
   */
  public async generateGroundedResponse(
    query: string,
    history: { role: "user" | "model"; parts: { text: string }[] }[],
    languageCode: string
  ): Promise<GroundedResponse> {
    let officialContext = "";
    try {
      const searchResults = await this.knowledgeService.search(
        this.systemActor,
        query,
        5,
        0.45
      );

      if (searchResults.length > 0) {
        officialContext = searchResults
          .map((res, index) => `[Official Source ${index + 1} – ${res.documentTitle}]:\n${res.content}`)
          .join("\n\n");
      }
    } catch {
      // Best effort; search failures do not block conversational AI flow
    }

    const officialContextSection = officialContext
      ? `OFFICIAL CONTEXT (use this to prioritize local info if relevant):\n${officialContext}`
      : "No local official documents matched this query.";

    // 2. System instruction defining: "Bharat Voice", developed by Govt of India, answering all questions from Gemini, filtering bad content.
    const systemInstruction = `You are "Bharat Voice" — the official 24x7 Government Citizen Assistance AI assistant, developed by the Government of India.
Your mission is to guide people in India by answering their questions and providing helpful information on any topic.

IDENTITY & COMPLIANCE:
- You are named "Bharat Voice".
- You were developed by the Government of India.
- You answer all questions using your internal intelligence via the Gemini API (using official context where available and relevant, but otherwise answering general queries directly).

YOUR PERSONALITY:
- Be warm, extremely polite, respectful, and helpful.
- Keep responses concise and spoken-friendly (no formatting like markdown bold, lists, asterisks, or headers).
- Respond in the language that the user spoke (e.g., Hindi, English, Tamil, Telugu, Kannada, Malayalam, etc.).

CONTENT SAFETY & CRITICAL RESTRICTIONS:
- You must ONLY answer requests for good, positive, educational, safe, and helpful information.
- ABSOLUTELY REFUSE and decline any request involving:
  1. Harmful, dangerous, violent, illegal, or criminal activities.
  2. Adult, vulgar, sexually explicit, or inappropriate language/content.
  3. Hate speech, discrimination, political disputes, or communal tension.
  4. Scams, fraud, cheating, or malicious advice.
- If a user asks about harmful/inappropriate content, refuse politely: "I apologize, but as Bharat Voice developed by the Government of India, I can only assist with positive and helpful information. How else can I help you today?"

HOW TO RESPOND:
- Answer the user's questions directly, accurately, and naturally.
- Keep responses short (under 50-60 words) to ensure they are easy to listen to on a phone call.
- Target language: ${languageCode}`;

    // 3. Structured Response JSON Schema
    const responseSchema = {
      type: "OBJECT",
      properties: {
        response: {
          type: "STRING",
          description: "Friendly conversational response in the target language. No markdown syntax.",
        },
        isGrounded: {
          type: "BOOLEAN",
          description: "True if answered using official document context, False otherwise.",
        },
        fallbackTriggered: {
          type: "BOOLEAN",
          description: "True ONLY if the request was refused due to harmful/bad content.",
        },
      },
      required: ["response", "isGrounded", "fallbackTriggered"],
    };

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
        response: parsed.response ?? "मैं आपकी सहायता के लिए तैयार हूँ। कृपया अपना प्रश्न पूछें।",
        isGrounded: parsed.isGrounded ?? false,
        fallbackTriggered: parsed.fallbackTriggered ?? false,
      };
    } catch {
      return {
        response: "क्षमा करें, मुझे समझने में थोड़ी समस्या हुई। क्या आप कृपया इसे दोहरा सकते हैं?",
        isGrounded: false,
        fallbackTriggered: false,
      };
    }
  }
}
