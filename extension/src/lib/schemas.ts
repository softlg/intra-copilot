import { z } from "zod";

export const capabilitiesSchema = z.object({
  browserProtocolVersion: z.number(),
  streamTimeoutMs: z.number().positive().optional(),
});

export const tokenPayloadSchema = z.object({
  text: z.string(),
});

export const actionProposalSchema = z.object({
  actionId: z.string().min(1),
  type: z.string().min(1),
  target: z
    .union([
      z.string(),
      z.object({
        snapshotId: z.string(),
        frameId: z.number().int().nonnegative(),
        elementId: z.string(),
      }),
    ])
    .nullable()
    .optional(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().optional(),
  risk: z.enum(["low", "medium", "high"]).optional(),
  readOnly: z.boolean().optional(),
});

export const pageContextSchema = z.object({
  url: z.string(),
  title: z.string(),
  selection: z.string(),
  visibleText: z.string(),
  domSummary: z.string(),
  frameId: z.number().int().nonnegative(),
  snapshotId: z.string(),
  timestamp: z.string(),
});

export type ActionProposalPayload = z.infer<typeof actionProposalSchema>;
export type PageContextPayload = z.infer<typeof pageContextSchema>;
