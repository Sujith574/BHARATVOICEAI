export interface CallSessionTurn {
  role: "citizen" | "assistant" | "system";
  content: string;
  createdAt: Date;
}

export interface CallSession {
  callId: string; // Database UUID
  twilioCallSid: string;
  languageCode: string;
  history: CallSessionTurn[];
}

export class CallSessionService {
  private readonly sessions = new Map<string, CallSession>();

  /**
   * Creates a new voice call session.
   */
  public createSession(twilioCallSid: string, callId: string, languageCode: string): CallSession {
    const session: CallSession = {
      callId,
      twilioCallSid,
      languageCode,
      history: [],
    };
    this.sessions.set(twilioCallSid, session);
    return session;
  }

  /**
   * Retrieves an active call session by its Twilio Call SID.
   */
  public getSession(twilioCallSid: string): CallSession | undefined {
    return this.sessions.get(twilioCallSid);
  }

  /**
   * Adds a conversational turn (citizen or assistant) to the session history.
   */
  public addTurn(twilioCallSid: string, role: "citizen" | "assistant" | "system", content: string): void {
    const session = this.sessions.get(twilioCallSid);
    if (!session) {
      throw new Error(`No active call session found for Twilio Call SID: ${twilioCallSid}`);
    }

    session.history.push({
      role,
      content,
      createdAt: new Date(),
    });
  }

  /**
   * Clears/removes the call session from memory.
   */
  public clearSession(twilioCallSid: string): void {
    this.sessions.delete(twilioCallSid);
  }

  /**
   * Updates the language code of an active call session.
   */
  public updateLanguage(twilioCallSid: string, languageCode: string): void {
    const session = this.sessions.get(twilioCallSid);
    if (session) {
      session.languageCode = languageCode;
    }
  }

  /**
   * Translates the call session history into the structure expected by the Gemini chat API.
   * Filters out system turns and maps:
   * - "citizen" -> "user"
   * - "assistant" -> "model"
   */
  public getHistoryForGemini(twilioCallSid: string): { role: "user" | "model"; parts: { text: string }[] }[] {
    const session = this.sessions.get(twilioCallSid);
    if (!session) {
      return [];
    }

    return session.history
      .filter((turn) => turn.role === "citizen" || turn.role === "assistant")
      .map((turn) => ({
        role: turn.role === "citizen" ? ("user" as const) : ("model" as const),
        parts: [{ text: turn.content }],
      }));
  }
}
