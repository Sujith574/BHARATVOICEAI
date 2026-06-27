import type { Request, Response } from "express";

import { statusCallbackSchema, incomingCallSchema } from "./voice.schemas";
import type { VoiceService } from "./voice.service";

export class VoiceController {
  public constructor(private readonly voiceService: VoiceService) {}

  public handleIncomingCall = (request: Request, response: Response): void => {
    const payload = incomingCallSchema.parse(request.body);

    // buildIncomingCallResponse is async (persists the Call record).
    // We fire it as a Promise and handle both the TwiML reply and any errors.
    void this.voiceService.buildIncomingCallResponse(payload).then((twimlResponse) => {
      response.status(200).type("text/xml").send(twimlResponse);
    }).catch((error: unknown) => {
      // Propagate to the Express error handler so it can return an HTTP 500.
      // The next function is not captured in this arrow pattern, so we rely on
      // Express catching unhandled errors thrown inside route handlers.
      throw error;
    });
  };

  public handleStatusCallback = (request: Request, response: Response): void => {
    const payload = statusCallbackSchema.parse(request.body);

    // logStatusCallback is async (updates the Call record); send 204 immediately
    // as Twilio does not wait for a response body on status callbacks.
    void this.voiceService.logStatusCallback(payload).catch((error: unknown) => {
      throw error;
    });

    response.status(204).send();
  };
}
