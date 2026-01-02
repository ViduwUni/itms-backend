import mongoose from "mongoose";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Asset } from "../models/Asset.js";
import { Employee } from "../models/Employee.js";
import { AssetAssignment } from "../models/AssetAssignment.js";
import { sendMailSafe } from "../services/graphMail.js";
import assignmentEmailHtml from "../templates/assignmentEmailTemplate.js";

const assignSchema = z.object({
  assetId: z.string().min(1),
  employeeId: z.string().min(1),
  type: z.enum(["temporary", "permanent"]),
  expectedReturnAt: z.string().optional().nullable(),
  remarks: z.string().max(1000).optional().default(""),
  notify: z.boolean().optional().default(true),
});

const returnSchema = z.object({
  remarks: z.string().max(1000).optional().default(""),
});

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const assignAsset = asyncHandler(async (req, res) => {
  const body = assignSchema.parse(req.body);
  const requestNotify = body.notify !== false;

  const assetId = new mongoose.Types.ObjectId(body.assetId);
  const employeeId = new mongoose.Types.ObjectId(body.employeeId);
  const actorId = req.user?.id;

  const emailsEnabled =
    String(process.env.EMAIL_NOTIFICATIONS_ENABLED || "true") === "true";

  const [asset, employee] = await Promise.all([
    Asset.findById(assetId).lean(),
    Employee.findById(employeeId).lean(),
  ]);

  if (!asset) return res.status(404).json({ message: "Asset not found" });
  if (!employee) return res.status(404).json({ message: "Employee not found" });
  if (!actorId)
    return res.status(401).json({ message: "Unauthorized (missing user id)" });

  // A/1 rule: block if already assigned (race-safe via unique partial index too)
  const exists = await AssetAssignment.findOne({
    assetId,
    status: "active",
  }).lean();
  if (exists)
    return res
      .status(409)
      .json({ message: "Asset is already assigned. Return it first." });

  const assignment = await AssetAssignment.create({
    assetId,
    employeeId,
    type: body.type,
    status: "active",
    expectedReturnAt: toDateOrNull(body.expectedReturnAt),
    remarks: (body.remarks || "").trim(),
    assignedByUserId: actorId,
  });

  // ✅ send emails (HR + Employee + Admin)
  if (emailsEnabled && requestNotify) {
    const subject = `Asset Assigned: ${asset.assetTag} → ${employee.name}`;
    const html = assignmentEmailHtml({
      employee,
      asset,
      assignment: assignment.toObject(),
    });

    const hr = process.env.HR_EMAIL;
    const admin = process.env.ADMIN_EMAIL;

    sendMailSafe({ to: [employee.email], subject, html });
    sendMailSafe({ to: [hr], subject, html });
    sendMailSafe({ to: [admin], subject, html });
  }

  res.status(201).json({ item: { id: assignment._id.toString() } });
});

export const returnAssignment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = returnSchema.parse(req.body);
  const actorId = req.user?.id;
  const assignment = await AssetAssignment.findById(id);
  if (!assignment)
    return res.status(404).json({ message: "Assignment not found" });
  if (assignment.status !== "active")
    return res.status(400).json({ message: "Assignment already returned" });
  if (!actorId)
    return res.status(401).json({ message: "Unauthorized (missing user id)" });

  assignment.status = "returned";
  assignment.returnedAt = new Date();
  assignment.returnedByUserId = actorId;
  assignment.remarks = body.remarks?.trim() || assignment.remarks;

  await assignment.save();

  res.json({ ok: true });
});

export const listAssignments = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    100,
    Math.max(5, parseInt(req.query.limit || "10", 10))
  );
  const skip = (page - 1) * limit;

  const status = (req.query.status || "").trim(); // "active" | "returned" | ""
  const q = (req.query.q || "").trim(); // optional search across assetTag/employee name/email

  const match = {};
  if (status) match.status = status;

  const pipeline = [
    { $match: match },

    // Join asset
    {
      $lookup: {
        from: "assets",
        localField: "assetId",
        foreignField: "_id",
        as: "asset",
        pipeline: [
          { $project: { assetTag: 1, name: 1, category: 1, department: 1 } },
        ],
      },
    },
    { $unwind: { path: "$asset", preserveNullAndEmptyArrays: true } },

    // Join employee
    {
      $lookup: {
        from: "employees",
        localField: "employeeId",
        foreignField: "_id",
        as: "employee",
        pipeline: [{ $project: { name: 1, email: 1, department: 1 } }],
      },
    },
    { $unwind: { path: "$employee", preserveNullAndEmptyArrays: true } },
  ];

  if (q) {
    pipeline.push({
      $match: {
        $or: [
          { "asset.assetTag": { $regex: q, $options: "i" } },
          { "asset.name": { $regex: q, $options: "i" } },
          { "employee.name": { $regex: q, $options: "i" } },
          { "employee.email": { $regex: q, $options: "i" } },
        ],
      },
    });
  }

  pipeline.push(
    { $sort: { assignedAt: -1 } },
    {
      $facet: {
        items: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    }
  );

  const out = await AssetAssignment.aggregate(pipeline);
  const items = out[0]?.items || [];
  const total = out[0]?.total?.[0]?.count || 0;

  res.json({
    items: items.map((x) => ({ ...x, id: x._id.toString() })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});
