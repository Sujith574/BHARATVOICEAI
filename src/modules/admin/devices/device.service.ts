import type { Logger } from "pino";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { DeviceRepository } from "./device.repository";
import type { RegisterDeviceBody } from "./device.schemas";

export class DeviceService {
  public constructor(
    private readonly deviceRepository: DeviceRepository,
    private readonly logger: Logger
  ) {}

  public async registerDevice(
    actor: AuthenticatedUser,
    body: RegisterDeviceBody
  ): Promise<{ success: boolean }> {
    this.logger.info(
      { userId: actor.id, token: body.token, platform: body.platform },
      "Registering device token for user"
    );
    await this.deviceRepository.upsert(actor.id, body.token, body.platform);
    return { success: true };
  }

  public async unregisterDevice(
    actor: AuthenticatedUser,
    token: string
  ): Promise<{ success: boolean }> {
    this.logger.info(
      { userId: actor.id, token },
      "Unregistering device token"
    );
    await this.deviceRepository.deleteByToken(token);
    return { success: true };
  }
}
