import request from "supertest";

import { createTestApp } from "../../test/helpers/create-test-app";

describe("voice routes", () => {
  it("returns valid TwiML for incoming calls", async () => {
    const { app } = createTestApp({
      publicBaseUrl: "https://bharat-voice.example.com",
      twilioMediaStreamEnabled: true,
      twilioMediaStreamSecret: "super-secure-stream-secret"
    });

    const response = await request(app)
      .post("/api/v1/voice/twilio/incoming")
      .type("form")
      .send({
        CallSid: "CA123",
        AccountSid: "AC123",
        From: "+919999999999",
        To: "+911234567890",
        CallStatus: "ringing",
        Direction: "inbound"
      });

    expect(response.status).toBe(200);
    expect(response.type).toContain("text/xml");
    expect(response.text).toContain("<Stream");
  });

  it("returns a validation error for malformed Twilio payloads", async () => {
    const { app } = createTestApp();

    const response = await request(app).post("/api/v1/voice/twilio/incoming").type("form").send({
      AccountSid: "AC123"
    });
    const body = response.body as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
