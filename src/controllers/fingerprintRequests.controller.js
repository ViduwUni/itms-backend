import mongoose from "mongoose";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { FingerprintAccessRequest } from "../models/FingerprintAccessRequest.js";
import { FingerprintSystem } from "../models/FingerprintSystem.js";
import { Employee } from "../models/Employee.js";
import { sendMailSafe } from "../services/graphMail.js";
import { fingerprintApprovedEmailHtml } from "../services/fingerprintEmail.js";
import { buildFingerprintRequestPdf } from "../services/fingerprintPdf.js";

function actorIdFromReq(req) {
  return req.user?.sub || req.user?.id || req.user?._id || req.userId || null;
}

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const createSchema = z.object({
  personType: z.enum(["employee", "temporary"]),
  employeeId: z.string().optional(),
  tempPerson: z
    .object({
      name: z.string().min(1).max(120),
      email: z.string().email().optional().or(z.literal("")).optional(),
      department: z.string().max(120).optional().default(""),
    })
    .optional(),
  systemId: z.string().min(1),
  accessType: z.enum(["permanent", "temporary"]),
  validFrom: z.string().optional(),
  validTo: z.string().optional().nullable(),
  remarks: z.string().max(1000).optional().default(""),
});

const approveSchema = z.object({
  notify: z.boolean().optional().default(true),
});

const cancelSchema = z.object({
  reason: z.string().max(1000).optional().default(""),
});

export const listFingerprintRequests = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    100,
    Math.max(5, parseInt(req.query.limit || "10", 10))
  );
  const skip = (page - 1) * limit;

  const status = (req.query.status || "").trim(); // open|approved|cancelled|""
  const q = (req.query.q || "").trim();
  const systemId = (req.query.systemId || "").trim();

  const match = {};
  if (status) match.status = status;
  if (systemId) match.systemId = new mongoose.Types.ObjectId(systemId);

  // We’ll support basic search over tempPerson or employee name/email via lookups.
  const pipeline = [
    { $match: match },

    // join system
    {
      $lookup: {
        from: "fingerprintsystems",
        localField: "systemId",
        foreignField: "_id",
        as: "system",
        pipeline: [{ $project: { name: 1, location: 1, deviceId: 1 } }],
      },
    },
    { $unwind: { path: "$system", preserveNullAndEmptyArrays: true } },

    // join employee
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
          { "system.name": { $regex: q, $options: "i" } },
          { "system.deviceId": { $regex: q, $options: "i" } },
          { "employee.name": { $regex: q, $options: "i" } },
          { "employee.email": { $regex: q, $options: "i" } },
          { "tempPerson.name": { $regex: q, $options: "i" } },
          { "tempPerson.email": { $regex: q, $options: "i" } },
        ],
      },
    });
  }

  pipeline.push(
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        items: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    }
  );

  const out = await FingerprintAccessRequest.aggregate(pipeline);
  const items = out?.[0]?.items || [];
  const total = out?.[0]?.total?.[0]?.count || 0;

  res.json({
    items: items.map((x) => ({
      ...x,
      id: x._id.toString(),
      // normalize person display
      person:
        x.personType === "employee"
          ? {
              name: x.employee?.name || "—",
              email: x.employee?.email || "",
              department: x.employee?.department || "",
            }
          : {
              name: x.tempPerson?.name || "—",
              email: x.tempPerson?.email || "",
              department: x.tempPerson?.department || "",
            },
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

export const createFingerprintRequest = asyncHandler(async (req, res) => {
  const actorId = actorIdFromReq(req);
  if (!actorId)
    return res.status(401).json({ message: "Unauthorized (missing user id)" });

  const body = createSchema.parse(req.body);

  const systemId = new mongoose.Types.ObjectId(body.systemId);
  const system = await FingerprintSystem.findById(systemId).lean();
  if (!system)
    return res.status(404).json({ message: "Fingerprint system not found" });

  let employeeId = null;
  let tempPerson = null;

  if (body.personType === "employee") {
    if (!body.employeeId)
      return res.status(400).json({ message: "employeeId is required" });
    employeeId = new mongoose.Types.ObjectId(body.employeeId);
    const emp = await Employee.findById(employeeId).lean();
    if (!emp) return res.status(404).json({ message: "Employee not found" });
  } else {
    if (!body.tempPerson?.name)
      return res.status(400).json({ message: "tempPerson.name is required" });
    tempPerson = {
      name: body.tempPerson.name.trim(),
      email: (body.tempPerson.email || "").trim(),
      department: (body.tempPerson.department || "").trim(),
    };
  }

  const validFrom = toDateOrNull(body.validFrom) || new Date();
  const validTo = toDateOrNull(body.validTo);

  if (body.accessType === "temporary" && !validTo) {
    return res
      .status(400)
      .json({ message: "validTo is required for temporary access" });
  }

  const doc = await FingerprintAccessRequest.create({
    personType: body.personType,
    employeeId,
    tempPerson,
    systemId,
    accessType: body.accessType,
    validFrom,
    validTo: body.accessType === "temporary" ? validTo : null,
    remarks: (body.remarks || "").trim(),
    status: "open",
    createdByUserId: String(actorId),
  });

  res.status(201).json({ item: { id: doc._id.toString() } });
});

export const approveFingerprintRequest = asyncHandler(async (req, res) => {
  const actorId = actorIdFromReq(req);
  if (!actorId)
    return res.status(401).json({ message: "Unauthorized (missing user id)" });

  const { id } = req.params;
  const body = approveSchema.parse(req.body);

  const doc = await FingerprintAccessRequest.findById(id);
  if (!doc) return res.status(404).json({ message: "Request not found" });
  if (doc.status !== "open")
    return res
      .status(400)
      .json({ message: "Only open requests can be approved" });

  // Rule A duplicate protection:
  // - employee: unique index will protect
  // - temporary without email: soft-check by name+system+approved
  if (doc.personType === "temporary") {
    const email = (doc.tempPerson?.email || "").trim().toLowerCase();
    if (!email) {
      const exists = await FingerprintAccessRequest.findOne({
        status: "approved",
        systemId: doc.systemId,
        personType: "temporary",
        "tempPerson.name": doc.tempPerson?.name,
      }).lean();

      if (exists) {
        return res.status(409).json({
          message:
            "This temporary person already has approved access for this system.",
        });
      }
    }
  }

  doc.status = "approved";
  doc.approvedAt = new Date();
  doc.approvedByUserId = String(actorId);
  await doc.save(); // unique indexes may throw duplicate key => handled below

  // Send emails only on approval
  const notify = body.notify !== false;
  const emailsEnabled =
    String(process.env.EMAIL_NOTIFICATIONS_ENABLED || "true") === "true";

  const system = await FingerprintSystem.findById(doc.systemId).lean();
  if (!system) return res.status(500).json({ message: "System missing" });

  let person;
  if (doc.personType === "employee") {
    const emp = await Employee.findById(doc.employeeId).lean();
    person = {
      name: emp?.name || "—",
      email: emp?.email || "",
      department: emp?.department || "",
    };
  } else {
    person = {
      name: doc.tempPerson?.name || "—",
      email: doc.tempPerson?.email || "",
      department: doc.tempPerson?.department || "",
    };
  }

  if (emailsEnabled && notify) {
    const hr = String(process.env.HR_EMAIL || "").trim();
    const admin = String(process.env.ADMIN_EMAIL || "").trim();
    const to = [hr, admin, person.email]
      .map((x) => String(x || "").trim())
      .filter(Boolean);

    // dedupe
    const unique = Array.from(new Set(to.map((x) => x.toLowerCase())));

    const subject = `Fingerprint Access Approved: ${person.name} → ${system.name}`;
    const html = fingerprintApprovedEmailHtml({
      person,
      system,
      reqDoc: doc.toObject(),
      approver: req.user?.username || req.user?.email || String(actorId),
    });

    // fire-and-forget safe sender
    sendMailSafe({ to: unique, subject, html });
  }

  res.json({ ok: true });
});

export const cancelFingerprintRequest = asyncHandler(async (req, res) => {
  const actorId = actorIdFromReq(req);
  if (!actorId)
    return res.status(401).json({ message: "Unauthorized (missing user id)" });

  const { id } = req.params;
  const body = cancelSchema.parse(req.body);

  const doc = await FingerprintAccessRequest.findById(id);
  if (!doc) return res.status(404).json({ message: "Request not found" });
  if (doc.status !== "open")
    return res
      .status(400)
      .json({ message: "Only open requests can be cancelled" });

  doc.status = "cancelled";
  doc.cancelledAt = new Date();
  doc.cancelledByUserId = String(actorId);
  doc.cancelReason = (body.reason || "").trim();
  await doc.save();

  res.json({ ok: true });
});

export const downloadFingerprintRequestPdf = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const doc = await FingerprintAccessRequest.findById(id).lean();
  if (!doc) return res.status(404).json({ message: "Request not found" });

  const system = await FingerprintSystem.findById(doc.systemId).lean();

  let person;
  if (doc.personType === "employee") {
    const emp = await Employee.findById(doc.employeeId).lean();
    person = {
      name: emp?.name || "—",
      email: emp?.email || "",
      department: emp?.department || "",
    };
  } else {
    person = {
      name: doc.tempPerson?.name || "—",
      email: doc.tempPerson?.email || "",
      department: doc.tempPerson?.department || "",
    };
  }

  const pdf = buildFingerprintRequestPdf({ reqDoc: doc, person, system });

  const filename = `fingerprint-request-${doc._id.toString()}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  pdf.pipe(res);
});
