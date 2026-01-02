import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { NotificationSettings } from "../models/NotificationSettings.js";

export const getNotificationSettings = asyncHandler(async (req, res) => {
  let doc = await NotificationSettings.findOne().lean();
  if (!doc) {
    const created = await NotificationSettings.create({
      softwareExpiryEmails: [],
    });
    doc = created.toObject();
  }
  res.json({ softwareExpiryEmails: doc.softwareExpiryEmails || [] });
});

export const updateNotificationSettings = asyncHandler(async (req, res) => {
  const schema = z.object({
    softwareExpiryEmails: z.array(z.string().email()).default([]),
  });
  const body = schema.parse(req.body);

  let doc = await NotificationSettings.findOne();
  if (!doc)
    doc = await NotificationSettings.create({ softwareExpiryEmails: [] });

  doc.softwareExpiryEmails = body.softwareExpiryEmails.map((x) =>
    x.trim().toLowerCase()
  );
  await doc.save();

  res.json({ ok: true });
});
