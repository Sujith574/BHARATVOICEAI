import { GoogleGenAI } from "@google/genai";

import type { AppConfig } from "../../config/env";

export class GeminiService {
  private readonly ai: GoogleGenAI;

  public constructor(config: AppConfig) {
    this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }

  /**
   * Generates a 768-dimension vector embedding for the given text
   * using Google's text-embedding-004 model.
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim() === "") {
      throw new Error("Text content cannot be empty for embedding generation.");
    }

    const response = await this.ai.models.embedContent({
      model: "text-embedding-004",
      contents: text
    });

    const values = response.embeddings?.[0]?.values;
    if (!values || !Array.isArray(values)) {
      throw new Error("Failed to retrieve embedding values from Gemini API response.");
    }

    return values;
  }

  /**
   * Generates a grounded response using Gemini Pro/Flash model.
   * Enforces structured JSON output matching the provided schema.
   */
  public async generateGroundedChatResponse(
    systemInstruction: string,
    contents: unknown[],
    schema: Record<string, unknown>
  ): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents as unknown as Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Failed to retrieve text content from Gemini model response.");
    }

    return text;
  }
}

