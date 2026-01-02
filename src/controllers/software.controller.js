import mongoose from "mongoose";
import ExcelJS from "exceljs";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { SoftwareItem } from "../models/SoftwareItem.js";
import { SoftwareAssignment } from "../models/SoftwareAssignment.js";
import { SoftwareRenewal } from "../models/SoftwareRenewal.js";

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function expiryStatus(expiryDate) {
  if (!expiryDate) return "—";
  const now = new Date();
  const exp = new Date(expiryDate);
  if (exp < now) return "Expired";
  const days = Math.ceil(
    (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days <= 7) return `Expiring (${days}d)`;
  if (days <= 30) return `Expiring (${days}d)`;
  return "Active";
}

const itemSchema = z.object({
  type: z.enum(["domain", "saas", "license"]),
  name: z.string().min(1),
  vendor: z.string().optional().default(""),
  department: z.string().optional().default(""),
  cost: z.number().optional().nullable(),
  currency: z.string().optional().default("USD"),
  autoRenew: z.boolean().optional().default(false),
  startDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  renewalDate: z.string().optional().nullable(),
  remarks: z.string().optional().default(""),

  domainName: z.string().optional().default(""),
  registrar: z.string().optional().default(""),

  quantityTotal: z.number().optional().nullable(),
  licenseType: z.string().optional().default(""),
  billingCycle: z.string().optional().default(""),
});

export const listSoftware = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    100,
    Math.max(5, parseInt(req.query.limit || "10", 10))
  );
  const skip = (page - 1) * limit;

  const type = (req.query.type || "").trim(); // domain|saas|license
  const q = (req.query.q || "").trim();
  const department = (req.query.department || "").trim();

  const expiry = (req.query.expiry || "").trim(); // active|expiring30|expiring7|expired

  const filter = {};
  if (type) filter.type = type;
  if (department) filter.department = department;
  if (q) filter.$text = { $search: q };

  if (expiry) {
    const now = new Date();
    const d7 = new Date();
    d7.setDate(d7.getDate() + 7);
    const d30 = new Date();
    d30.setDate(d30.getDate() + 30);

    if (expiry === "expired") filter.expiryDate = { $ne: null, $lt: now };
    if (expiry === "expiring7")
      filter.expiryDate = { $ne: null, $gte: now, $lte: d7 };
    if (expiry === "expiring30")
      filter.expiryDate = { $ne: null, $gte: now, $lte: d30 };
    if (expiry === "active") filter.expiryDate = { $ne: null, $gt: d30 };
  }

  const [items, total] = await Promise.all([
    SoftwareItem.find(filter)
      .select(
        "type name vendor department cost currency autoRenew startDate expiryDate renewalDate domainName registrar quantityTotal licenseType billingCycle remarks createdAt"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SoftwareItem.countDocuments(filter),
  ]);

  // Derive used seats per item in this page only (fast)
  const ids = items.map((x) => x._id);
  const usedAgg = await SoftwareAssignment.aggregate([
    { $match: { softwareId: { $in: ids }, status: "active" } },
    { $group: { _id: "$softwareId", used: { $sum: "$seatCount" } } },
  ]);

  const usedMap = new Map(usedAgg.map((x) => [String(x._id), x.used]));

  res.json({
    items: items.map((x) => ({
      ...x,
      id: x._id.toString(),
      usedSeats: usedMap.get(String(x._id)) || 0,
      expiryStatus: expiryStatus(x.expiryDate),
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

export const listRenewals = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    100,
    Math.max(5, parseInt(req.query.limit || "10", 10))
  );
  const skip = (page - 1) * limit;

  const softwareId = new mongoose.Types.ObjectId(id);

  const [items, total] = await Promise.all([
    SoftwareRenewal.find({ softwareId })
      .sort({ renewedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SoftwareRenewal.countDocuments({ softwareId }),
  ]);

  res.json({
    items: items.map((x) => ({ ...x, id: x._id.toString() })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

export const createSoftware = asyncHandler(async (req, res) => {
  const body = itemSchema.parse(req.body);

  const doc = await SoftwareItem.create({
    ...body,
    startDate: toDateOrNull(body.startDate),
    expiryDate: toDateOrNull(body.expiryDate),
    renewalDate: toDateOrNull(body.renewalDate),
    name: body.name.trim(),
    vendor: (body.vendor || "").trim(),
    department: (body.department || "").trim(),
    domainName: (body.domainName || "").trim(),
    registrar: (body.registrar || "").trim(),
    remarks: (body.remarks || "").trim(),
  });

  res.status(201).json({ item: { id: doc._id.toString() } });
});

export const updateSoftware = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = itemSchema.partial().parse(req.body);

  const doc = await SoftwareItem.findById(id);
  if (!doc) return res.status(404).json({ message: "Software not found" });

  Object.assign(doc, {
    ...body,
    startDate:
      body.startDate !== undefined
        ? toDateOrNull(body.startDate)
        : doc.startDate,
    expiryDate:
      body.expiryDate !== undefined
        ? toDateOrNull(body.expiryDate)
        : doc.expiryDate,
    renewalDate:
      body.renewalDate !== undefined
        ? toDateOrNull(body.renewalDate)
        : doc.renewalDate,
  });

  if (body.name !== undefined) doc.name = body.name.trim();
  if (body.vendor !== undefined) doc.vendor = (body.vendor || "").trim();
  if (body.department !== undefined)
    doc.department = (body.department || "").trim();
  if (body.domainName !== undefined)
    doc.domainName = (body.domainName || "").trim();
  if (body.registrar !== undefined)
    doc.registrar = (body.registrar || "").trim();
  if (body.remarks !== undefined) doc.remarks = (body.remarks || "").trim();

  await doc.save();

  res.json({ ok: true });
});

export const deleteSoftware = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await SoftwareItem.findByIdAndDelete(id);
  res.json({ ok: true });
});

export const renewSoftware = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const schema = z.object({
    newExpiryDate: z.string().min(1),
    cost: z.number().optional().nullable(),
    currency: z.string().optional().default("USD"),
    remarks: z.string().optional().default(""),
  });
  const body = schema.parse(req.body);

  const doc = await SoftwareItem.findById(id);
  if (!doc) return res.status(404).json({ message: "Software not found" });

  const old = doc.expiryDate || null;
  const newExp = toDateOrNull(body.newExpiryDate);
  if (!newExp)
    return res.status(400).json({ message: "Invalid new expiry date" });

  const actorId = req.user.id;

  await SoftwareRenewal.create({
    softwareId: doc._id,
    oldExpiryDate: old,
    newExpiryDate: newExp,
    cost: body.cost ?? null,
    currency: body.currency || "USD",
    renewedByUserId: actorId,
    remarks: (body.remarks || "").trim(),
  });

  doc.expiryDate = newExp;
  await doc.save();

  res.json({ ok: true });
});

export const exportSoftwareXlsx = asyncHandler(async (req, res) => {
  const type = (req.query.type || "").trim();
  const q = (req.query.q || "").trim();
  const department = (req.query.department || "").trim();
  const expiry = (req.query.expiry || "").trim();

  const filter = {};
  if (type) filter.type = type;
  if (department) filter.department = department;
  if (q) filter.$text = { $search: q };

  if (expiry) {
    const now = new Date();
    const d7 = new Date();
    d7.setDate(d7.getDate() + 7);
    const d30 = new Date();
    d30.setDate(d30.getDate() + 30);
    if (expiry === "expired") filter.expiryDate = { $ne: null, $lt: now };
    if (expiry === "expiring7")
      filter.expiryDate = { $ne: null, $gte: now, $lte: d7 };
    if (expiry === "expiring30")
      filter.expiryDate = { $ne: null, $gte: now, $lte: d30 };
    if (expiry === "active") filter.expiryDate = { $ne: null, $gt: d30 };
  }

  const items = await SoftwareItem.find(filter)
    .select(
      "type name vendor department cost currency autoRenew startDate expiryDate renewalDate domainName registrar quantityTotal licenseType billingCycle remarks createdAt"
    )
    .sort({ createdAt: -1 })
    .lean();

  const ids = items.map((x) => x._id);
  const usedAgg = await SoftwareAssignment.aggregate([
    { $match: { softwareId: { $in: ids }, status: "active" } },
    { $group: { _id: "$softwareId", used: { $sum: "$seatCount" } } },
  ]);
  const usedMap = new Map(usedAgg.map((x) => [String(x._id), x.used]));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Software", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = [
    { header: "Type", key: "type", width: 12 },
    { header: "Name", key: "name", width: 28 },
    { header: "Vendor", key: "vendor", width: 18 },
    { header: "Department", key: "department", width: 18 },
    { header: "Domain", key: "domainName", width: 22 },
    { header: "Registrar", key: "registrar", width: 18 },
    { header: "Auto Renew", key: "autoRenew", width: 10 },
    { header: "Start Date", key: "startDate", width: 12 },
    { header: "Expiry Date", key: "expiryDate", width: 12 },
    { header: "Expiry Status", key: "expiryStatus", width: 16 },
    { header: "Seats Used", key: "usedSeats", width: 10 },
    { header: "Seats Total", key: "quantityTotal", width: 10 },
    { header: "License Type", key: "licenseType", width: 12 },
    { header: "Billing Cycle", key: "billingCycle", width: 12 },
    { header: "Cost", key: "cost", width: 10 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Remarks", key: "remarks", width: 30 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.height = 20;
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
  });

  for (const x of items) {
    ws.addRow({
      type: x.type,
      name: x.name,
      vendor: x.vendor || "",
      department: x.department || "",
      domainName: x.domainName || "",
      registrar: x.registrar || "",
      autoRenew: x.autoRenew ? "Yes" : "No",
      startDate: x.startDate ? new Date(x.startDate) : "",
      expiryDate: x.expiryDate ? new Date(x.expiryDate) : "",
      expiryStatus: expiryStatus(x.expiryDate),
      usedSeats: usedMap.get(String(x._id)) || 0,
      quantityTotal: x.quantityTotal ?? "",
      licenseType: x.licenseType || "",
      billingCycle: x.billingCycle || "",
      cost: x.cost ?? "",
      currency: x.currency || "USD",
      remarks: x.remarks || "",
    });
  }

  ws.getColumn("startDate").numFmt = "yyyy-mm-dd";
  ws.getColumn("expiryDate").numFmt = "yyyy-mm-dd";

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columns.length },
  };

  const ts = new Date().toISOString().slice(0, 10);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="software_${type || "all"}_${ts}.xlsx"`
  );

  await wb.xlsx.write(res);
  res.end();
});
