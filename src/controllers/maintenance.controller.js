import mongoose from "mongoose";
import { z } from "zod";
import ExcelJS from "exceljs";
import { asyncHandler } from "../utils/asyncHandler.js";
import { MaintenanceJob } from "../models/MaintenanceJob.js";
import { MaintenanceLog } from "../models/MaintenanceLog.js";
import { Asset } from "../models/Asset.js";
import { Employee } from "../models/Employee.js";
import { AssetAssignment } from "../models/AssetAssignment.js";
import { nextMaintenanceJobNo } from "../services/maintenanceNo.js";
import {
  maintenanceEmailHtml,
  notifyMaintenance,
} from "../services/maintenanceMail.js";
import { sendXlsx } from "../utils/sendXlsx.js";

function actorId(req) {
  return req.user?.sub || req.user?.id || req.user?._id;
}
const toId = (s) => new mongoose.Types.ObjectId(s);

const createSchema = z.object({
  employeeId: z.string().min(1),
  assetIds: z.array(z.string().min(1)).min(1),
  purpose: z.string().max(400).optional().default(""),
  remarks: z.string().max(1000).optional().default(""),
  scheduledAt: z.string().optional().nullable(),
  notify: z.boolean().optional().default(true),
});

const updateSchema = z.object({
  employeeId: z.string().min(1).optional(),
  assetIds: z.array(z.string().min(1)).min(1).optional(),
  purpose: z.string().max(400).optional(),
  remarks: z.string().max(1000).optional(),
  scheduledAt: z.string().optional().nullable(),
  notify: z.boolean().optional(),
});

const statusSchema = z.object({
  status: z.enum(["open", "in_progress", "completed"]),
  note: z.string().max(1000).optional().default(""),
  notify: z.boolean().optional().default(true),
});

const noteSchema = z.object({
  note: z.string().min(1).max(2000),
  notify: z.boolean().optional().default(false),
});

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function loadEmployeeAndAssets(employeeId, assetIds) {
  const [employee, assets] = await Promise.all([
    Employee.findById(employeeId).lean(),
    Asset.find({ _id: { $in: assetIds } })
      .select({
        assetTag: 1,
        name: 1,
        category: 1,
        department: 1,
        serialNumber: 1,
      })
      .lean(),
  ]);
  return { employee, assets };
}

function computeDepartment(employee, assets) {
  // Use employee dept first (maintenance for that person), fallback to first asset dept
  return (employee?.department || assets?.[0]?.department || "General").trim();
}

/**
 * GET /api/maintenance/employee-assets?page&limit&q&department
 * Returns employees with ACTIVE assigned assets (for fast selection view)
 */
export const listEmployeeAssets = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    50,
    Math.max(5, parseInt(req.query.limit || "10", 10))
  );
  const skip = (page - 1) * limit;

  const q = (req.query.q || "").trim();
  const department = (req.query.department || "").trim();

  const pipeline = [
    { $match: { status: "active" } },

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
    { $unwind: "$employee" },

    // join asset
    {
      $lookup: {
        from: "assets",
        localField: "assetId",
        foreignField: "_id",
        as: "asset",
        pipeline: [
          {
            $project: {
              assetTag: 1,
              name: 1,
              category: 1,
              department: 1,
              serialNumber: 1,
            },
          },
        ],
      },
    },
    { $unwind: "$asset" },
  ];

  if (department) {
    pipeline.push({
      $match: { "employee.department": { $regex: department, $options: "i" } },
    });
  }

  if (q) {
    pipeline.push({
      $match: {
        $or: [
          { "employee.name": { $regex: q, $options: "i" } },
          { "employee.email": { $regex: q, $options: "i" } },
          { "asset.assetTag": { $regex: q, $options: "i" } },
          { "asset.name": { $regex: q, $options: "i" } },
        ],
      },
    });
  }

  pipeline.push(
    // group by employee
    {
      $group: {
        _id: "$employee._id",
        employee: { $first: "$employee" },
        assets: { $push: "$asset" },
        assetCount: { $sum: 1 },
      },
    },
    { $sort: { assetCount: -1, _id: 1 } },
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
    items: items.map((x) => ({
      employee: { ...x.employee, id: x.employee._id.toString() },
      assets: x.assets.map((a) => ({ ...a, id: a._id.toString() })),
      assetCount: x.assetCount,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

/**
 * POST /api/maintenance/jobs
 */
export const createJob = asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const uid = actorId(req);
  if (!uid)
    return res.status(401).json({ message: "Unauthorized (missing user id)" });

  const employeeId = toId(body.employeeId);
  const assetIds = body.assetIds.map(toId);

  const { employee, assets } = await loadEmployeeAndAssets(
    employeeId,
    assetIds
  );
  if (!employee) return res.status(404).json({ message: "Employee not found" });
  if (!assets || assets.length !== assetIds.length)
    return res.status(404).json({ message: "One or more assets not found" });

  const jobNo = await nextMaintenanceJobNo();
  const department = computeDepartment(employee, assets);

  const job = await MaintenanceJob.create({
    jobNo,
    employeeId,
    assetIds,
    department,
    purpose: (body.purpose || "").trim(),
    remarks: (body.remarks || "").trim(),
    scheduledAt: toDateOrNull(body.scheduledAt),
    status: "open",
    createdByUserId: toId(uid),
  });

  await MaintenanceLog.create({
    jobId: job._id,
    action: "created",
    note: "Maintenance job created",
    actorUserId: toId(uid),
  });

  if (body.notify !== false) {
    const subject = `Maintenance Opened: ${jobNo} (${assets.length} asset${
      assets.length > 1 ? "s" : ""
    })`;
    const html = maintenanceEmailHtml({
      kind: "created",
      job: job.toObject(),
      employee,
      assets,
    });
    notifyMaintenance({ toEmployee: employee.email, subject, html });
  }

  res.status(201).json({ id: job._id.toString(), jobNo });
});

/**
 * GET /api/maintenance/jobs
 */
export const listJobs = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    100,
    Math.max(5, parseInt(req.query.limit || "10", 10))
  );
  const skip = (page - 1) * limit;

  const q = (req.query.q || "").trim();
  const status = (req.query.status || "").trim();
  const department = (req.query.department || "").trim();

  const match = {};
  if (status) match.status = status;
  if (department) match.department = { $regex: department, $options: "i" };

  const pipeline = [
    { $match: match },
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
    {
      $addFields: {
        assetCount: { $size: "$assetIds" },
      },
    },
  ];

  if (q) {
    pipeline.push({
      $match: {
        $or: [
          { jobNo: { $regex: q, $options: "i" } },
          { purpose: { $regex: q, $options: "i" } },
          { remarks: { $regex: q, $options: "i" } },
          { "employee.name": { $regex: q, $options: "i" } },
          { "employee.email": { $regex: q, $options: "i" } },
        ],
      },
    });
  }

  pipeline.push(
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        items: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              jobNo: 1,
              status: 1,
              department: 1,
              scheduledAt: 1,
              createdAt: 1,
              assetCount: 1,
              employee: 1,
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    }
  );

  const out = await MaintenanceJob.aggregate(pipeline);
  const items = out[0]?.items || [];
  const total = out[0]?.total?.[0]?.count || 0;

  res.json({
    items: items.map((x) => ({ ...x, id: x._id.toString() })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

/**
 * GET /api/maintenance/jobs/:id
 */
export const getJob = asyncHandler(async (req, res) => {
  const job = await MaintenanceJob.findById(req.params.id).lean();
  if (!job) return res.status(404).json({ message: "Not found" });

  const [employee, assets, logs] = await Promise.all([
    Employee.findById(job.employeeId).lean(),
    Asset.find({ _id: { $in: job.assetIds } })
      .select({
        assetTag: 1,
        name: 1,
        category: 1,
        department: 1,
        serialNumber: 1,
      })
      .lean(),
    MaintenanceLog.find({ jobId: job._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
  ]);

  res.json({
    item: {
      ...job,
      id: job._id.toString(),
      employee: employee
        ? {
            id: employee._id.toString(),
            name: employee.name,
            email: employee.email,
            department: employee.department,
          }
        : null,
      assets: (assets || []).map((a) => ({ ...a, id: a._id.toString() })),
      logs: logs.map((l) => ({ ...l, id: l._id.toString() })),
    },
  });
});

/**
 * PATCH /api/maintenance/jobs/:id
 */
export const updateJob = asyncHandler(async (req, res) => {
  const body = updateSchema.parse(req.body);
  const uid = actorId(req);
  if (!uid) return res.status(401).json({ message: "Unauthorized" });

  const job = await MaintenanceJob.findById(req.params.id);
  if (!job) return res.status(404).json({ message: "Not found" });

  if (body.employeeId) job.employeeId = toId(body.employeeId);
  if (body.assetIds) job.assetIds = body.assetIds.map(toId);
  if (body.purpose != null) job.purpose = body.purpose.trim();
  if (body.remarks != null) job.remarks = body.remarks.trim();
  if (body.scheduledAt !== undefined)
    job.scheduledAt = toDateOrNull(body.scheduledAt);

  // recompute department snapshot
  const { employee, assets } = await loadEmployeeAndAssets(
    job.employeeId,
    job.assetIds
  );
  if (!employee) return res.status(404).json({ message: "Employee not found" });
  if (!assets || assets.length !== job.assetIds.length)
    return res.status(404).json({ message: "One or more assets not found" });
  job.department = computeDepartment(employee, assets);

  await job.save();

  await MaintenanceLog.create({
    jobId: job._id,
    action: "updated",
    note: "Job updated",
    actorUserId: toId(uid),
  });

  // optional notify
  if (body.notify) {
    const subject = `Maintenance Updated: ${job.jobNo}`;
    const html = maintenanceEmailHtml({
      kind: "updated",
      job: job.toObject(),
      employee,
      assets,
    });
    notifyMaintenance({ toEmployee: employee.email, subject, html });
  }

  res.json({ ok: true });
});

/**
 * PATCH /api/maintenance/jobs/:id/status
 */
export const changeJobStatus = asyncHandler(async (req, res) => {
  const body = statusSchema.parse(req.body);
  const uid = actorId(req);
  if (!uid) return res.status(401).json({ message: "Unauthorized" });

  const job = await MaintenanceJob.findById(req.params.id);
  if (!job) return res.status(404).json({ message: "Not found" });

  const from = job.status;
  const to = body.status;

  job.status = to;
  if (to === "completed") {
    job.completedAt = new Date();
    job.completedByUserId = toId(uid);
  }

  await job.save();

  await MaintenanceLog.create({
    jobId: job._id,
    action: "status_change",
    fromStatus: from,
    toStatus: to,
    note: body.note.trim(),
    actorUserId: toId(uid),
  });

  // Notify on OPEN (rare via status change) and COMPLETED (required)
  if (body.notify !== false && (to === "open" || to === "completed")) {
    const { employee, assets } = await loadEmployeeAndAssets(
      job.employeeId,
      job.assetIds
    );

    const subject =
      to === "completed"
        ? `Maintenance Completed: ${job.jobNo} (Collect from IT Department)`
        : `Maintenance Open: ${job.jobNo}`;

    const html = maintenanceEmailHtml({
      kind: to === "completed" ? "completed" : "updated",
      job: job.toObject(),
      employee,
      assets,
    });

    notifyMaintenance({ toEmployee: employee.email, subject, html });
  }

  res.json({ ok: true });
});

/**
 * POST /api/maintenance/jobs/:id/note
 */
export const addJobNote = asyncHandler(async (req, res) => {
  const body = noteSchema.parse(req.body);
  const uid = actorId(req);
  if (!uid) return res.status(401).json({ message: "Unauthorized" });

  const job = await MaintenanceJob.findById(req.params.id).lean();
  if (!job) return res.status(404).json({ message: "Not found" });

  const log = await MaintenanceLog.create({
    jobId: job._id,
    action: "note",
    note: body.note.trim(),
    actorUserId: toId(uid),
  });

  // optional: note emails (you can keep false by default)
  if (body.notify) {
    const { employee, assets } = await loadEmployeeAndAssets(
      job.employeeId,
      job.assetIds
    );
    const subject = `Maintenance Note: ${job.jobNo}`;
    const html = maintenanceEmailHtml({
      kind: "updated",
      job,
      employee,
      assets,
    });
    notifyMaintenance({ toEmployee: employee.email, subject, html });
  }

  res.status(201).json({ id: log._id.toString() });
});

/**
 * DELETE /api/maintenance/jobs/:id (admin only)
 */
export const deleteJob = asyncHandler(async (req, res) => {
  await MaintenanceJob.findByIdAndDelete(req.params.id);
  await MaintenanceLog.deleteMany({ jobId: req.params.id });
  res.json({ ok: true });
});

/**
 * GET /api/maintenance/jobs/export.xlsx
 */
export const exportJobsXlsx = asyncHandler(async (req, res) => {
  const q = (req.query.q || "").trim();
  const status = (req.query.status || "").trim();
  const department = (req.query.department || "").trim();

  const match = {};
  if (status) match.status = status;
  if (department) match.department = { $regex: department, $options: "i" };

  const pipeline = [
    { $match: match },
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
    { $addFields: { assetCount: { $size: "$assetIds" } } },
  ];

  if (q) {
    pipeline.push({
      $match: {
        $or: [
          { jobNo: { $regex: q, $options: "i" } },
          { purpose: { $regex: q, $options: "i" } },
          { remarks: { $regex: q, $options: "i" } },
          { "employee.name": { $regex: q, $options: "i" } },
          { "employee.email": { $regex: q, $options: "i" } },
        ],
      },
    });
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  const rows = await MaintenanceJob.aggregate(pipeline);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Maintenance");

  ws.columns = [
    { header: "Job No", key: "jobNo", width: 14 },
    { header: "Status", key: "status", width: 12 },
    { header: "Employee", key: "employee", width: 20 },
    { header: "Employee Email", key: "email", width: 24 },
    { header: "Department", key: "department", width: 16 },
    { header: "Assets Count", key: "assetCount", width: 12 },
    { header: "Scheduled", key: "scheduledAt", width: 14 },
    { header: "Purpose", key: "purpose", width: 30 },
    { header: "Remarks", key: "remarks", width: 30 },
    { header: "Created", key: "createdAt", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const r of rows) {
    ws.addRow({
      jobNo: r.jobNo,
      status: r.status,
      employee: r.employee?.name || "—",
      email: r.employee?.email || "—",
      department: r.department || "—",
      assetCount: r.assetCount || 0,
      scheduledAt: r.scheduledAt
        ? new Date(r.scheduledAt).toISOString().slice(0, 10)
        : "—",
      purpose: r.purpose || "—",
      remarks: r.remarks || "—",
      createdAt: new Date(r.createdAt)
        .toISOString()
        .slice(0, 19)
        .replace("T", " "),
    });
  }

  await sendXlsx(res, wb, "maintenance_jobs.xlsx");
});
