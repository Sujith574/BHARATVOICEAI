import request from "supertest";

import { createTestApp } from "../../test/helpers/create-test-app";

describe("health routes", () => {
  it("returns liveness metadata", async () => {
    const { app } = createTestApp();

    const response = await request(app).get("/api/v1/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "live",
      service: "bharat-voice-backend-test",
      version: "0.1.0-test",
      environment: "test"
    });
  });

  it("returns readiness metadata", async () => {
    const { app } = createTestApp();

    const response = await request(app).get("/api/v1/health/ready");
    const body = response.body as { status: string; dependencies: Array<{ name: string; status: string }> };

    expect(response.status).toBe(200);
    expect(body.status).toBe("ready");
    expect(body.dependencies).toEqual([]);
  });
});
