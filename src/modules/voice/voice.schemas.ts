import { z } from "zod";

export const incomingCallSchema = z
  .object({
    CallSid: z.string().min(1),
    AccountSid: z.string().min(1),
    From: z.string().min(1).optional(),
    To: z.string().min(1).optional(),
    CallStatus: z.string().min(1).optional(),
    Direction: z.string().min(1).optional()
  })
  .transform((payload) => ({
    callSid: payload.CallSid,
    accountSid: payload.AccountSid,
    from: payload.From,
    to: payload.To,
    callStatus: payload.CallStatus,
    direction: payload.Direction
  }));

export const statusCallbackSchema = z
  .object({
    CallSid: z.string().min(1),
    CallStatus: z.string().optional(),
    StreamSid: z.string().optional().or(z.literal("").transform(() => undefined)),
    Timestamp: z.string().optional().or(z.literal("").transform(() => undefined))
  })
  .transform((payload) => ({
    callSid: payload.CallSid,
    callStatus: payload.CallStatus,
    streamSid: payload.StreamSid,
    timestamp: payload.Timestamp
  }));

const streamStartSchema = z.object({
  event: z.literal("start"),
  sequenceNumber: z.string().min(1),
  start: z.object({
    accountSid: z.string().min(1),
    callSid: z.string().min(1),
    streamSid: z.string().min(1),
    tracks: z.array(z.string().min(1)).default([]),
    customParameters: z.record(z.string()).optional(),
    mediaFormat: z.object({
      encoding: z.string().min(1),
      sampleRate: z.number().int().positive(),
      channels: z.number().int().positive()
    })
  })
});

const streamMediaSchema = z.object({
  event: z.literal("media"),
  sequenceNumber: z.string().min(1),
  streamSid: z.string().min(1),
  media: z.object({
    track: z.string().min(1),
    chunk: z.string().min(1),
    timestamp: z.string().min(1),
    payload: z.string().min(1)
  })
});

const streamStopSchema = z.object({
  event: z.literal("stop"),
  sequenceNumber: z.string().min(1),
  streamSid: z.string().min(1),
  stop: z.object({
    accountSid: z.string().min(1),
    callSid: z.string().min(1)
  })
});

const streamConnectedSchema = z.object({
  event: z.literal("connected"),
  protocol: z.string().min(1),
  version: z.string().min(1)
});

const streamMarkSchema = z.object({
  event: z.literal("mark"),
  sequenceNumber: z.string().min(1),
  streamSid: z.string().min(1),
  mark: z.object({
    name: z.string().min(1)
  })
});

const streamDtmfSchema = z.object({
  event: z.literal("dtmf"),
  sequenceNumber: z.string().min(1),
  streamSid: z.string().min(1),
  dtmf: z.object({
    track: z.string().min(1),
    digit: z.string().min(1)
  })
});

export const mediaStreamEventSchema = z.discriminatedUnion("event", [
  streamConnectedSchema,
  streamStartSchema,
  streamMediaSchema,
  streamStopSchema,
  streamMarkSchema,
  streamDtmfSchema
]);

export type IncomingCallPayload = z.infer<typeof incomingCallSchema>;
export type StatusCallbackPayload = z.infer<typeof statusCallbackSchema>;
export type MediaStreamEvent = z.infer<typeof mediaStreamEventSchema>;
