import { z } from "zod";

export const supabaseAccessTokenClaimsSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.string().min(1).optional(),
  app_metadata: z.record(z.unknown()).default({}),
  user_metadata: z.record(z.unknown()).default({})
});
