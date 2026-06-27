import { describe, it, expect, beforeEach } from "vitest";
import pino from "pino";
import { DeviceService } from "./device.service";
import { InMemoryDeviceRepository } from "./device.repository";
import type { AuthenticatedUser } from "../../auth/auth.types";

const makeActor = (): AuthenticatedUser => ({
  id: "user-admin-001",
  authUserId: "auth-001",
  email: "admin@example.gov.in",
  phoneNumber: undefined,
  fullName: "Admin User",
  preferredLanguage: "en-IN",
  stateCode: "AP",
  status: "ACTIVE",
  roles: [{ code: "ADMIN_VIEWER", name: "Admin Viewer", scope: "GLOBAL" }],
  permissions: ["mobile.dashboard.read"],
  lastLoginAt: undefined
});

describe("DeviceService", () => {
  let repository: InMemoryDeviceRepository;
  let service: DeviceService;
  const logger = pino({ enabled: false });

  beforeEach(() => {
    repository = new InMemoryDeviceRepository();
    service = new DeviceService(repository, logger);
  });

  describe("registerDevice", () => {
    it("successfully registers a device token for the user", async () => {
      const actor = makeActor();
      const body = { token: "fcm-token-123", platform: "ANDROID" as const };

      const result = await service.registerDevice(actor, body);

      expect(result.success).toBe(true);

      const tokens = await repository.findTokensByUserIds([actor.id]);
      expect(tokens).toContain("fcm-token-123");
    });
  });

  describe("unregisterDevice", () => {
    it("successfully deletes the device token", async () => {
      const actor = makeActor();
      await repository.upsert(actor.id, "fcm-token-123", "IOS");

      const result = await service.unregisterDevice(actor, "fcm-token-123");

      expect(result.success).toBe(true);

      const tokens = await repository.findTokensByUserIds([actor.id]);
      expect(tokens).not.toContain("fcm-token-123");
    });
  });
});
