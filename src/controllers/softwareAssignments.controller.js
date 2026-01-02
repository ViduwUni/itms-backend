import mongoose from "mongoose";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { SoftwareItem } from "../models/SoftwareItem.js";
import { SoftwareAssignment } from "../models/SoftwareAssignment.js";
import { Employee } from "../models/Employee.js";
import { Asset } from "../models/Asset.js";

const assignSchema = z.object({
  targetType: z.enum(["employee", "asset", "department"]),
  targetId: z.string().optional().nullable(),
  targetName: z.string().optional().default(""),
  seatCount: z.number().int().min(1).default(1),
  remarks: z.string().max(1000).optional().default(""),
});

export const listSoftwareAssignments = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    100,
    Math.max(5, parseInt(req.query.limit || "10", 10))
  );
  const skip = (page - 1) * limit;

  const status = (req.query.status || "").trim(); // active|revoked
  const filter = { softwareId: new mongoose.Types.ObjectId(id) };
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    SoftwareAssignment.find(filter)
      .sort({ assignedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SoftwareAssignment.countDocuments(filter),
  ]);

  res.json({
    items: items.map((x) => ({ ...x, id: x._id.toString() })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

export const assignSoftware = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = assignSchema.parse(req.body);

  const actorId = req.user.id;

  const softwareId = new mongoose.Types.ObjectId(id);

  const software = await SoftwareItem.findById(softwareId).lean();
  if (!software) return res.status(404).json({ message: "Software not found" });

  // Resolve target (optional)
  let resolvedTargetId = null;
  let resolvedName = (body.targetName || "").trim();

  if (body.targetType === "employee") {
    if (!body.targetId)
      return res.status(400).json({ message: "Employee targetId required" });
    resolvedTargetId = new mongoose.Types.ObjectId(body.targetId);
    const emp = await Employee.findById(resolvedTargetId)
      .select("name email")
      .lean();
    if (!emp) return res.status(404).json({ message: "Employee not found" });
    resolvedName = `${emp.name} (${emp.email})`;
  }

  if (body.targetType === "asset") {
    if (!body.targetId)
      return res.status(400).json({ message: "Asset targetId required" });
    resolvedTargetId = new mongoose.Types.ObjectId(body.targetId);
    const asset = await Asset.findById(resolvedTargetId)
      .select("assetTag name")
      .lean();
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    resolvedName = `${asset.assetTag} — ${asset.name}`;
  }

  if (body.targetType === "department") {
    if (!resolvedName)
      return res.status(400).json({ message: "Department name required" });
  }

  // ✅ STRICT BLOCK seat limits (B)
  if (software.quantityTotal != null) {
    const agg = await SoftwareAssignment.aggregate([
      { $match: { softwareId, status: "active" } },
      { $group: { _id: "$softwareId", used: { $sum: "$seatCount" } } },
    ]);
    const used = agg[0]?.used || 0;
    const next = used + body.seatCount;

    if (next > software.quantityTotal) {
      return res.status(409).json({
        message: `Not enough seats. Used ${used}/${software.quantityTotal}, trying to assign ${body.seatCount}.`,
      });
    }
  }

  const doc = await SoftwareAssignment.create({
    softwareId,
    targetType: body.targetType,
    targetId: resolvedTargetId,
    targetName: resolvedName,
    seatCount: body.seatCount,
    status: "active",
    assignedByUserId: actorId,
    remarks: (body.remarks || "").trim(),
  });

  res.status(201).json({ item: { id: doc._id.toString() } });
});

export const revokeSoftwareAssignment = asyncHandler(async (req, res) => {
  const { assignmentId } = req.params;
  const actorId = req.user.id;

  const doc = await SoftwareAssignment.findById(assignmentId);
  if (!doc) return res.status(404).json({ message: "Assignment not found" });
  if (doc.status !== "active")
    return res.status(400).json({ message: "Already revoked" });

  doc.status = "revoked";
  doc.revokedAt = new Date();
  doc.revokedByUserId = actorId;

  await doc.save();
  res.json({ ok: true });
});
