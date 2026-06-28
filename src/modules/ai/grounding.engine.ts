import type { AuthenticatedUser } from "../auth/auth.types";
import type { GeminiService } from "./gemini.service";
import type { KnowledgeService } from "../knowledge/knowledge.service";

export interface GroundedResponse {
  response: string;
  isGrounded: boolean;
  fallbackTriggered: boolean;
}

/**
 * GroundingEngine — the core AI brain of Bharat Voice.
 *
 * Strategy:
 *  - Gemini API answers ALL questions (primary source).
 *  - Official knowledge documents are fetched as supplementary context
 *    when available, but NEVER block the response if unavailable.
 *  - Strict content safety: harmful requests are refused politely.
 *  - Responds in the caller's detected Indian language.
 */
export class GroundingEngine {
  private readonly systemActor: AuthenticatedUser = {
    id: "system-grounding-actor",
    authUserId: "system-grounding-actor",
    email: "system@bharatvoice.gov.in",
    fullName: "Bharat Voice System",
    status: "ACTIVE",
    roles: [],
    permissions: ["knowledge.read"],
  };

  public constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly geminiService: GeminiService
  ) {}

  /**
   * Generates a response using Gemini as the primary AI brain.
   * Official documents are fetched for enrichment but never block answers.
   */
  public async generateGroundedResponse(
    query: string,
    history: { role: "user" | "model"; parts: { text: string }[] }[],
    languageCode: string
  ): Promise<GroundedResponse> {
    // ── Step 1: Try to fetch official document context (best-effort, never blocking) ──
    let officialContext = "";
    try {
      const results = await this.knowledgeService.search(
        this.systemActor,
        query,
        5,
        0.45
      );
      if (results.length > 0) {
        officialContext = results
          .map(
            (r, i) =>
              `[Government Document ${i + 1} – ${r.documentTitle}]:\n${r.content}`
          )
          .join("\n\n");
      }
    } catch {
      // Knowledge search failure must never block the Gemini response
    }

    const contextBlock = officialContext
      ? `OFFICIAL GOVERNMENT DOCUMENTS (use for precise answers when relevant):\n${officialContext}`
      : "";

    // ── Step 2: System prompt — Bharat Voice identity + Gemini-first approach ──
    const systemInstruction = `You are Bharat Voice — an official AI voice assistant developed by the Government of India to guide and assist every citizen of India.

IDENTITY:
- Your name is "Bharat Voice".
- You are developed by the Government of India.
- You are available 24x7 to help all Indian citizens — regardless of language, state, or background.
- You are friendly, warm, trustworthy, and speak like a knowledgeable but approachable government helper.

YOUR PURPOSE:
- Help citizens with ANY question — government schemes, health, education, agriculture, law, science, history, geography, culture, technology, everyday life, and more.
- Provide accurate, helpful, and positive information using your knowledge.
- When official government documents are provided below, use them for precise and authoritative answers.
- When no official documents match, use your own knowledge (Gemini) to give a comprehensive, helpful answer.

${contextBlock}

LANGUAGE:
- ALWAYS reply in the EXACT same language the user spoke.
- If the user speaks Hindi, reply in Hindi. Tamil → Tamil. Telugu → Telugu. Kannada → Kannada. Malayalam → Malayalam. Bengali → Bengali. English → English. Mixed → match their mix.
- Current detected language code: ${languageCode}
- Never use markdown formatting — no asterisks, no bullet points, no headers. This is a voice call and text is read aloud.
- Keep responses natural, conversational, and under 60 words. Speak clearly and warmly.

CONTENT SAFETY — STRICT RULES (never break these under any circumstance):
1. REFUSE requests involving violence, weapons, terrorism, drugs, or harming any person.
2. REFUSE any sexually explicit, vulgar, or adult content.
3. REFUSE content promoting hate speech, religious/caste discrimination, or communal tension.
4. REFUSE help with fraud, scams, hacking, illegal activities, or misinformation.
5. REFUSE anything that defames the Government of India or spreads political propaganda.
6. When refusing, say kindly: "मुझे खेद है, मैं इस विषय पर मदद नहीं कर सकता। कोई और जानकारी चाहिए तो बताइए।" (or in the user's language).

RESPONSE RULES:
- isGrounded: true → if you used official government document context to answer.
- isGrounded: false → if you used your own Gemini knowledge (general answer).
- fallbackTriggered: true → ONLY if the request was refused for safety reasons.
- fallbackTriggered: false → for ALL other answers (whether from documents or general knowledge).
- NEVER set fallbackTriggered to true just because no documents matched. Gemini always knows enough to answer!`;

    // ── Step 3: Structured JSON schema ──
    const responseSchema = {
      type: "OBJECT",
      properties: {
        response: {
          type: "STRING",
          description:
            "Natural spoken voice response in the caller's language. No markdown. Under 60 words where possible.",
        },
        isGrounded: {
          type: "BOOLEAN",
          description:
            "true if the response used official government document context. false if answered from general Gemini knowledge.",
        },
        fallbackTriggered: {
          type: "BOOLEAN",
          description:
            "true ONLY when refusing harmful/bad content. false for all normal helpful answers.",
        },
      },
      required: ["response", "isGrounded", "fallbackTriggered"],
    };

    // ── Step 4: Build conversation contents ──
    const contents = [
      ...history,
      {
        role: "user" as const,
        parts: [{ text: query }],
      },
    ];

    // ── Step 5: Call Gemini API ──
    try {
      const rawJson = await this.geminiService.generateGroundedChatResponse(
        systemInstruction,
        contents,
        responseSchema
      );

      const parsed = JSON.parse(rawJson) as Partial<GroundedResponse>;

      return {
        response:
          parsed.response ??
          "मैं आपकी बात सुन रहा हूँ। क्या आप दोबारा बता सकते हैं?",
        isGrounded: parsed.isGrounded ?? false,
        fallbackTriggered: parsed.fallbackTriggered ?? false,
      };
    } catch {
      // Any Gemini API failure — return a friendly retry message
      return {
        response:
          "मुझे एक छोटी सी तकनीकी समस्या आई। क्या आप अपना सवाल दोबारा पूछ सकते हैं?",
        isGrounded: false,
        fallbackTriggered: false,
      };
    }
  }
}
