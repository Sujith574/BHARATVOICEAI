import { z } from "zod";

export const registerDeviceBodySchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["IOS", "ANDROID", "WEB"])
});

export type RegisterDeviceBody = z.infer<typeof registerDeviceBodySchema>;
