import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { BillingReminder } from "../models/BillingReminder.js";
import {
  getBillingReminderStatus,
  sendTestBillingReminderEmail,
} from "../services/billingReminderScheduler.js";

const updateSchema = z.object({
  title: z.string().max(120).optional(),
  enabled: z.boolean().optional(),
  schedule: z
    .object({
      dayMode: z.enum(["lastDay", "customDay"]).optional(),
      dayOfMonth: z.number().int().min(1).max(31).optional(),
      timeHHmm: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      timezone: z.string().optional(),
    })
    .optional(),
  categories: z
    .array(
      z.object({
        key: z.string().min(1).max(50),
        label: z.string().min(1).max(80),
      })
    )
    .optional(),
  extraEmails: z.array(z.string().email()).optional(),
});

async function ensureOneConfig() {
  const one = await BillingReminder.findOne();
  if (one) return one;
  return BillingReminder.create({});
}

export const getBillingReminderConfig = asyncHandler(async (req, res) => {
  const cfg = await ensureOneConfig();
  const status = await getBillingReminderStatus();
  res.json({ config: { ...cfg.toObject(), id: cfg._id.toString() }, status });
});

export const updateBillingReminderConfig = asyncHandler(async (req, res) => {
  const body = updateSchema.parse(req.body);
  const cfg = await ensureOneConfig();

  if (body.title !== undefined) cfg.title = body.title;
  if (body.enabled !== undefined) cfg.enabled = body.enabled;

  if (body.schedule) {
    cfg.schedule = { ...cfg.schedule, ...body.schedule };
  }

  if (body.categories) {
    // normalize: remove blanks + unique keys
    const map = new Map();
    for (const c of body.categories) {
      const key = c.key.trim();
      const label = c.label.trim();
      if (!key || !label) continue;
      map.set(key, { key, label });
    }
    cfg.categories = Array.from(map.values());
  }

  if (body.extraEmails) {
    const cleaned = Array.from(
      new Set(body.extraEmails.map((e) => e.trim().toLowerCase()))
    );
    cfg.extraEmails = cleaned;
  }

  await cfg.save();
  const status = await getBillingReminderStatus();

  res.json({
    ok: true,
    config: { ...cfg.toObject(), id: cfg._id.toString() },
    status,
  });
});

export const billingReminderStatus = asyncHandler(async (req, res) => {
  const status = await getBillingReminderStatus();
  res.json({ status });
});

export const testBillingReminder = asyncHandler(async (req, res) => {
  await sendTestBillingReminderEmail();
  res.json({ ok: true });
});
