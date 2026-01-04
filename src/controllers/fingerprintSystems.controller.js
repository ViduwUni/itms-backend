import mongoose from "mongoose";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { FingerprintSystem } from "../models/FingerprintSystem.js";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  location: z.string().max(120).optional().default(""),
  vendor: z.string().max(120).optional().default(""),
  model: z.string().max(120).optional().default(""),
  deviceId: z.string().max(120).optional().default(""),
  department: z.string().max(120).optional().default(""),
  enabled: z.boolean().optional().default(true),
  remarks: z.string().max(1000).optional().default(""),
});

const updateSchema = createSchema.partial();

export const listFingerprintSystems = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    100,
    Math.max(5, parseInt(req.query.limit || "10", 10))
  );
  const skip = (page - 1) * limit;

  const q = (req.query.q || "").trim();
  const enabled = (req.query.enabled || "").trim(); // "true" | "false" | ""

  const match = {};
  if (enabled === "true") match.enabled = true;
  if (enabled === "false") match.enabled = false;

  if (q) {
    match.$or = [
      { name: { $regex: q, $options: "i" } },
      { location: { $regex: q, $options: "i" } },
      { deviceId: { $regex: q, $options: "i" } },
      { department: { $regex: q, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    FingerprintSystem.find(match)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FingerprintSystem.countDocuments(match),
  ]);

  res.json({
    items: items.map((x) => ({ ...x, id: x._id.toString() })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

export const createFingerprintSystem = asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const doc = await FingerprintSystem.create({
    ...body,
    remarks: (body.remarks || "").trim(),
  });

  res.status(201).json({ item: { ...doc.toObject(), id: doc._id.toString() } });
});

export const updateFingerprintSystem = asyncHandler(async (req, res) => {
  const id = new mongoose.Types.ObjectId(req.params.id);
  const body = updateSchema.parse(req.body);

  const doc = await FingerprintSystem.findByIdAndUpdate(
    id,
    { $set: { ...body, remarks: body.remarks?.trim?.() ?? undefined } },
    { new: true }
  ).lean();

  if (!doc) return res.status(404).json({ message: "System not found" });

  res.json({ item: { ...doc, id: doc._id.toString() } });
});

export const deleteFingerprintSystem = asyncHandler(async (req, res) => {
  const id = new mongoose.Types.ObjectId(req.params.id);
  const ok = await FingerprintSystem.findByIdAndDelete(id).lean();
  if (!ok) return res.status(404).json({ message: "System not found" });
  res.json({ ok: true });
});
