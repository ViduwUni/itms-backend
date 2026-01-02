import mongoose from "mongoose";
import { z } from "zod";
import ExcelJS from "exceljs";
import { asyncHandler } from "../utils/asyncHandler.js";
import { RepairTicket } from "../models/RepairTicket.js";
import { RepairLog } from "../models/RepairLog.js";
import { Asset } from "../models/Asset.js";
import { Employee } from "../models/Employee.js";
import { nextRepairTicketNo } from "../services/ticketNo.js";
import { notifyRepair, repairEmailHtml } from "../services/repairMail.js";
import { sendXlsx } from "../utils/sendXlsx.js";

const createSchema = z.object({
  assetId: z.string().min(1),
  employeeId: z.string().min(1),
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional().default(""),
  type: z.enum(["hardware", "software", "network", "other"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  warranty: z.boolean().optional().default(false),
  vendorName: z.string().max(200).optional().default(""),
  vendorContact: z.string().max(200).optional().default(""),
  costLKR: z.number().nullable().optional().default(null),
  remarks: z.string().max(1000).optional().default(""),
  notify: z.boolean().optional().default(true),
});

const updateSchema = createSchema.partial().omit({ notify: true }).extend({
  notify: z.boolean().optional(),
});

const statusSchema = z.object({
  status: z.enum([
    "open",
    "in_progress",
    "waiting_parts",
    "waiting_vendor",
    "resolved",
    "closed",
    "cancelled",
  ]),
  note: z.string().max(1000).optional().default(""),
  notify: z.boolean().optional().default(true),
});

const assignSchema = z.object({
  assignedToUserId: z.string().nullable().optional().default(null),
  note: z.string().max(1000).optional().default(""),
  notify: z.boolean().optional().default(true),
});

const noteSchema = z.object({
  note: z.string().min(1).max(2000),
  notify: z.boolean().optional().default(false),
});

function actorId(req) {
  return req.user?.sub || req.user?.id || req.user?._id;
}

function toId(s) {
  return new mongoose.Types.ObjectId(s);
}

function computeDepartment(asset, employee) {
  // prefer asset department (you said asset issues)
  return (asset?.department || employee?.department || "General").trim();
}

function setStatusDates(ticket, from, to) {
  const now = new Date();
  if (to === "in_progress" && !ticket.startedAt) ticket.startedAt = now;
  if (to === "resolved") ticket.resolvedAt = now;
  if (to === "closed" || to === "cancelled") ticket.closedAt = now;
}

export const createRepair = asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const uid = actorId(req);
  if (!uid)
    return res.status(401).json({ message: "Unauthorized (missing user id)" });

  const assetId = toId(body.assetId);
  const employeeId = toId(body.employeeId);

  const [asset, employee] = await Promise.all([
    Asset.findById(assetId).lean(),
    Employee.findById(employeeId).lean(),
  ]);
  if (!asset) return res.status(404).json({ message: "Asset not found" });
  if (!employee) return res.status(404).json({ message: "Employee not found" });

  const ticketNo = await nextRepairTicketNo();
  const department = computeDepartment(asset, employee);

  const ticket = await RepairTicket.create({
    ticketNo,
    title: body.title.trim(),
    description: (body.description || "").trim(),
    type: body.type,
    priority: body.priority,
    status: "open",
    assetId,
    employeeId,
    department,
    warranty: !!body.warranty,
    vendorName: (body.vendorName || "").trim(),
    vendorContact: (body.vendorContact || "").trim(),
    costLKR: body.costLKR ?? null,
    remarks: (body.remarks || "").trim(),
    reportedByUserId: toId(uid),
  });

  await RepairLog.create({
    ticketId: ticket._id,
    action: "created",
    note: "Ticket created",
    actorUserId: toId(uid),
  });

  // Email notifications (default ON)
  if (body.notify !== false) {
    const subject = `Repair Ticket Created: ${ticketNo} (${asset.assetTag})`;
    const html = repairEmailHtml({
      title: ticket.title,
      ticketNo,
      asset,
      employee,
      ticket,
      actionLabel: "Repair Ticket Created",
    });
    notifyRepair({ toEmployee: employee.email, subject, html });
  }

  res.status(201).json({ id: ticket._id.toString(), ticketNo });
});

export const listRepairs = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    100,
    Math.max(5, parseInt(req.query.limit || "10", 10))
  );
  const skip = (page - 1) * limit;

  const q = (req.query.q || "").trim();
  const status = (req.query.status || "").trim();
  const priority = (req.query.priority || "").trim();
  const type = (req.query.type || "").trim();
  const department = (req.query.department || "").trim();
  const dateFrom = (req.query.dateFrom || "").trim();
  const dateTo = (req.query.dateTo || "").trim();

  const match = {};
  if (status) match.status = status;
  if (priority) match.priority = priority;
  if (type) match.type = type;
  if (department) match.department = { $regex: department, $options: "i" };

  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
    if (dateTo) match.createdAt.$lte = new Date(dateTo);
  }

  const pipeline = [
    { $match: match },
    // Join asset (lean projection)
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

    // Join assigned user (optional)
    {
      $lookup: {
        from: "users",
        localField: "assignedToUserId",
        foreignField: "_id",
        as: "assignee",
        pipeline: [{ $project: { username: 1, email: 1, role: 1 } }],
      },
    },
    { $unwind: { path: "$assignee", preserveNullAndEmptyArrays: true } },
  ];

  if (q) {
    pipeline.push({
      $match: {
        $or: [
          { ticketNo: { $regex: q, $options: "i" } },
          { title: { $regex: q, $options: "i" } },
          { "asset.assetTag": { $regex: q, $options: "i" } },
          { "asset.name": { $regex: q, $options: "i" } },
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
              ticketNo: 1,
              title: 1,
              type: 1,
              priority: 1,
              status: 1,
              department: 1,
              createdAt: 1,
              asset: 1,
              employee: 1,
              assignee: 1,
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    }
  );

  const out = await RepairTicket.aggregate(pipeline);
  const items = out[0]?.items || [];
  const total = out[0]?.total?.[0]?.count || 0;

  res.json({
    items: items.map((x) => ({ ...x, id: x._id.toString() })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

export const getRepair = asyncHandler(async (req, res) => {
  const id = req.params.id;

  const ticket = await RepairTicket.findById(id).lean();
  if (!ticket) return res.status(404).json({ message: "Not found" });

  const [asset, employee, logs] = await Promise.all([
    Asset.findById(ticket.assetId).lean(),
    Employee.findById(ticket.employeeId).lean(),
    RepairLog.find({ ticketId: ticket._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
  ]);

  res.json({
    item: {
      ...ticket,
      id: ticket._id.toString(),
      asset: asset
        ? {
            id: asset._id.toString(),
            assetTag: asset.assetTag,
            name: asset.name,
            category: asset.category,
            department: asset.department,
            serialNumber: asset.serialNumber || "",
          }
        : null,
      employee: employee
        ? {
            id: employee._id.toString(),
            name: employee.name,
            email: employee.email,
            department: employee.department,
          }
        : null,
      logs: logs.map((l) => ({ ...l, id: l._id.toString() })),
    },
  });
});

export const updateRepair = asyncHandler(async (req, res) => {
  const body = updateSchema.parse(req.body);
  const uid = actorId(req);
  if (!uid) return res.status(401).json({ message: "Unauthorized" });

  const ticket = await RepairTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: "Not found" });

  // if changing asset/employee, validate they exist
  let asset = null;
  let employee = null;

  if (body.assetId) {
    asset = await Asset.findById(body.assetId).lean();
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    ticket.assetId = toId(body.assetId);
  } else {
    asset = await Asset.findById(ticket.assetId).lean();
  }

  if (body.employeeId) {
    employee = await Employee.findById(body.employeeId).lean();
    if (!employee)
      return res.status(404).json({ message: "Employee not found" });
    ticket.employeeId = toId(body.employeeId);
  } else {
    employee = await Employee.findById(ticket.employeeId).lean();
  }

  if (body.title != null) ticket.title = body.title.trim();
  if (body.description != null)
    ticket.description = (body.description || "").trim();
  if (body.type != null) ticket.type = body.type;
  if (body.priority != null) ticket.priority = body.priority;

  if (body.warranty != null) ticket.warranty = !!body.warranty;
  if (body.vendorName != null)
    ticket.vendorName = (body.vendorName || "").trim();
  if (body.vendorContact != null)
    ticket.vendorContact = (body.vendorContact || "").trim();
  if (body.costLKR !== undefined) ticket.costLKR = body.costLKR ?? null;
  if (body.remarks != null) ticket.remarks = (body.remarks || "").trim();

  // refresh department snapshot (asset preferred)
  ticket.department = computeDepartment(asset, employee);

  await ticket.save();

  await RepairLog.create({
    ticketId: ticket._id,
    action: "updated",
    note: "Ticket updated",
    actorUserId: toId(uid),
  });

  // optional notify
  if (body.notify) {
    const subject = `Repair Ticket Updated: ${ticket.ticketNo} (${
      asset?.assetTag || ""
    })`;
    const html = repairEmailHtml({
      title: ticket.title,
      ticketNo: ticket.ticketNo,
      asset: asset || (await Asset.findById(ticket.assetId).lean()),
      employee: employee || (await Employee.findById(ticket.employeeId).lean()),
      ticket: ticket.toObject(),
      actionLabel: "Repair Ticket Updated",
    });
    notifyRepair({ toEmployee: employee?.email, subject, html });
  }

  res.json({ ok: true });
});

export const changeRepairStatus = asyncHandler(async (req, res) => {
  const body = statusSchema.parse(req.body);
  const uid = actorId(req);
  if (!uid) return res.status(401).json({ message: "Unauthorized" });

  const ticket = await RepairTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: "Not found" });

  const from = ticket.status;
  const to = body.status;

  ticket.status = to;
  setStatusDates(ticket, from, to);

  await ticket.save();

  await RepairLog.create({
    ticketId: ticket._id,
    action: "status_change",
    fromStatus: from,
    toStatus: to,
    note: (body.note || "").trim(),
    actorUserId: toId(uid),
  });

  if (body.notify !== false) {
    const [asset, employee] = await Promise.all([
      Asset.findById(ticket.assetId).lean(),
      Employee.findById(ticket.employeeId).lean(),
    ]);

    const subject = `Repair Status Updated: ${ticket.ticketNo} → ${to}`;
    const html = repairEmailHtml({
      title: ticket.title,
      ticketNo: ticket.ticketNo,
      asset,
      employee,
      ticket: ticket.toObject(),
      actionLabel: "Repair Status Updated",
    });

    // also notify assignee if exists and has email
    let extraTo = [];
    if (ticket.assignedToUserId) {
      const u = await mongoose
        .model("User")
        .findById(ticket.assignedToUserId)
        .select({ email: 1 })
        .lean()
        .catch(() => null);
      if (u?.email) extraTo = [u.email];
    }

    notifyRepair({ toEmployee: employee?.email, subject, html, extraTo });
  }

  res.json({ ok: true });
});

export const assignRepair = asyncHandler(async (req, res) => {
  const body = assignSchema.parse(req.body);
  const uid = actorId(req);
  if (!uid) return res.status(401).json({ message: "Unauthorized" });

  const ticket = await RepairTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: "Not found" });

  const prev = ticket.assignedToUserId?.toString() || null;
  const next = body.assignedToUserId ? toId(body.assignedToUserId) : null;

  ticket.assignedToUserId = next;
  await ticket.save();

  await RepairLog.create({
    ticketId: ticket._id,
    action: "assignment_change",
    note: (body.note || "").trim() || "Assignment changed",
    actorUserId: toId(uid),
  });

  if (body.notify !== false) {
    const [asset, employee] = await Promise.all([
      Asset.findById(ticket.assetId).lean(),
      Employee.findById(ticket.employeeId).lean(),
    ]);

    const subject = `Repair Assignment: ${ticket.ticketNo}`;
    const html = repairEmailHtml({
      title: ticket.title,
      ticketNo: ticket.ticketNo,
      asset,
      employee,
      ticket: ticket.toObject(),
      actionLabel: "Repair Assignment Updated",
    });

    let extraTo = [];
    if (next) {
      const u = await mongoose
        .model("User")
        .findById(next)
        .select({ email: 1 })
        .lean()
        .catch(() => null);
      if (u?.email) extraTo.push(u.email);
    }

    notifyRepair({ toEmployee: employee?.email, subject, html, extraTo });
  }

  res.json({ ok: true, prev, next: next?.toString() || null });
});

export const addRepairNote = asyncHandler(async (req, res) => {
  const body = noteSchema.parse(req.body);
  const uid = actorId(req);
  if (!uid) return res.status(401).json({ message: "Unauthorized" });

  const ticket = await RepairTicket.findById(req.params.id).lean();
  if (!ticket) return res.status(404).json({ message: "Not found" });

  const log = await RepairLog.create({
    ticketId: ticket._id,
    action: "note",
    note: body.note.trim(),
    actorUserId: toId(uid),
  });

  if (body.notify) {
    const [asset, employee] = await Promise.all([
      Asset.findById(ticket.assetId).lean(),
      Employee.findById(ticket.employeeId).lean(),
    ]);

    const subject = `Repair Ticket Note: ${ticket.ticketNo}`;
    const html = repairEmailHtml({
      title: ticket.title,
      ticketNo: ticket.ticketNo,
      asset,
      employee,
      ticket,
      actionLabel: "New Repair Note Added",
    });
    notifyRepair({ toEmployee: employee?.email, subject, html });
  }

  res.status(201).json({ id: log._id.toString() });
});

export const deleteRepair = asyncHandler(async (req, res) => {
  // admin-only route
  await RepairTicket.findByIdAndDelete(req.params.id);
  await RepairLog.deleteMany({ ticketId: req.params.id });
  res.json({ ok: true });
});

export const exportRepairsXlsx = asyncHandler(async (req, res) => {
  // export filtered list (no pagination)
  const q = (req.query.q || "").trim();
  const status = (req.query.status || "").trim();
  const priority = (req.query.priority || "").trim();
  const type = (req.query.type || "").trim();
  const department = (req.query.department || "").trim();

  const match = {};
  if (status) match.status = status;
  if (priority) match.priority = priority;
  if (type) match.type = type;
  if (department) match.department = { $regex: department, $options: "i" };

  const pipeline = [
    { $match: match },
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
          { ticketNo: { $regex: q, $options: "i" } },
          { title: { $regex: q, $options: "i" } },
          { "asset.assetTag": { $regex: q, $options: "i" } },
          { "asset.name": { $regex: q, $options: "i" } },
          { "employee.name": { $regex: q, $options: "i" } },
          { "employee.email": { $regex: q, $options: "i" } },
        ],
      },
    });
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  const rows = await RepairTicket.aggregate(pipeline);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Repairs");

  ws.columns = [
    { header: "Ticket No", key: "ticketNo", width: 14 },
    { header: "Title", key: "title", width: 30 },
    { header: "Type", key: "type", width: 12 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Status", key: "status", width: 14 },
    { header: "Asset Tag", key: "assetTag", width: 14 },
    { header: "Asset Name", key: "assetName", width: 22 },
    { header: "Employee", key: "employee", width: 20 },
    { header: "Employee Email", key: "employeeEmail", width: 22 },
    { header: "Department", key: "department", width: 14 },
    { header: "Warranty", key: "warranty", width: 10 },
    { header: "Vendor", key: "vendor", width: 16 },
    { header: "Cost (LKR)", key: "cost", width: 12 },
    { header: "Created", key: "createdAt", width: 18 },
  ];

  ws.getRow(1).font = { bold: true };

  for (const r of rows) {
    ws.addRow({
      ticketNo: r.ticketNo,
      title: r.title,
      type: r.type,
      priority: r.priority,
      status: r.status,
      assetTag: r.asset?.assetTag || "—",
      assetName: r.asset?.name || "—",
      employee: r.employee?.name || "—",
      employeeEmail: r.employee?.email || "—",
      department: r.department || "—",
      warranty: r.warranty ? "Yes" : "No",
      vendor: r.vendorName || "—",
      cost: r.costLKR ?? "",
      createdAt: new Date(r.createdAt)
        .toISOString()
        .slice(0, 19)
        .replace("T", " "),
    });
  }

  await sendXlsx(res, wb, `repairs_export.xlsx`);
});
