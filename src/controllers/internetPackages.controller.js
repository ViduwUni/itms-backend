import mongoose from "mongoose";
import { z } from "zod";
import ExcelJS from "exceljs";
import { asyncHandler } from "../utils/asyncHandler.js";
import { InternetPackage } from "../models/InternetPackage.js";
import { InternetConnection } from "../models/InternetConnection.js";
import { monthToDate, ymNowUTC } from "../utils/month.js";
import { sendXlsx } from "../utils/sendXlsx.js";

const createSchema = z.object({
  connectionId: z.string().min(1),
  month: z.string().min(7), // YYYY-MM
  packageName: z.string().min(1),
  dataLimitGB: z.number().nullable().optional().default(null),
  cost: z.number().nullable().optional().default(null),
  currency: z.string().optional().default("LKR"),
  remarks: z.string().max(1000).optional().default(""),
});

const updateSchema = createSchema
  .partial()
  .omit({ connectionId: true, month: true });

export const listPackages = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    100,
    Math.max(5, parseInt(req.query.limit || "10", 10))
  );
  const skip = (page - 1) * limit;

  const monthStr = (req.query.month || ymNowUTC()).trim();
  const month = monthToDate(monthStr);
  const connectionId = (req.query.connectionId || "").trim();

  const filter = { month };
  if (connectionId)
    filter.connectionId = new mongoose.Types.ObjectId(connectionId);

  const [items, total] = await Promise.all([
    InternetPackage.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    InternetPackage.countDocuments(filter),
  ]);

  // join connection names (fast enough for 100/page)
  const ids = [...new Set(items.map((x) => x.connectionId.toString()))];
  const conns = await InternetConnection.find({ _id: { $in: ids } })
    .select({ name: 1, provider: 1, location: 1 })
    .lean();
  const map = new Map(conns.map((c) => [c._id.toString(), c]));

  res.json({
    items: items.map((x) => ({
      ...x,
      id: x._id.toString(),
      connection: map.get(x.connectionId.toString()) || null,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

export const createPackage = asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const doc = await InternetPackage.create({
    connectionId: new mongoose.Types.ObjectId(body.connectionId),
    month: monthToDate(body.month),
    packageName: body.packageName.trim(),
    dataLimitGB: body.dataLimitGB ?? null,
    cost: body.cost ?? null,
    currency: (body.currency || "LKR").trim(),
    remarks: (body.remarks || "").trim(),
  });
  res.status(201).json({ id: doc._id.toString() });
});

export const updatePackage = asyncHandler(async (req, res) => {
  const body = updateSchema.parse(req.body);
  const doc = await InternetPackage.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Not found" });

  if (body.packageName != null) doc.packageName = body.packageName.trim();
  if (body.dataLimitGB !== undefined) doc.dataLimitGB = body.dataLimitGB;
  if (body.cost !== undefined) doc.cost = body.cost;
  if (body.currency != null) doc.currency = body.currency.trim();
  if (body.remarks != null) doc.remarks = body.remarks.trim();

  await doc.save();
  res.json({ ok: true });
});

export const deletePackage = asyncHandler(async (req, res) => {
  await InternetPackage.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export const exportPackagesXlsx = asyncHandler(async (req, res) => {
  const monthStr = (req.query.month || ymNowUTC()).trim();
  const month = monthToDate(monthStr);

  const connectionId = (req.query.connectionId || "").trim();
  const filter = { month };
  if (connectionId)
    filter.connectionId = new mongoose.Types.ObjectId(connectionId);

  const items = await InternetPackage.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  const ids = [...new Set(items.map((x) => x.connectionId.toString()))];
  const conns = await InternetConnection.find({ _id: { $in: ids } })
    .select({ name: 1, provider: 1, location: 1 })
    .lean();
  const map = new Map(conns.map((c) => [c._id.toString(), c]));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Packages");

  ws.columns = [
    { header: "Month", key: "month", width: 10 },
    { header: "Connection", key: "connection", width: 22 },
    { header: "Provider", key: "provider", width: 14 },
    { header: "Location", key: "location", width: 16 },
    { header: "Package Name", key: "packageName", width: 24 },
    { header: "Data Limit (GB)", key: "dataLimitGB", width: 14 },
    { header: "Cost", key: "cost", width: 10 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Remarks", key: "remarks", width: 28 },
  ];

  ws.getRow(1).font = { bold: true };

  for (const x of items) {
    const c = map.get(x.connectionId.toString());
    ws.addRow({
      month: monthStr,
      connection: c?.name || "—",
      provider: c?.provider || "—",
      location: c?.location || "—",
      packageName: x.packageName,
      dataLimitGB: x.dataLimitGB == null ? "Unlimited" : x.dataLimitGB,
      cost: x.cost ?? "",
      currency: x.currency || "LKR",
      remarks: x.remarks || "",
    });
  }

  await sendXlsx(res, wb, `internet_packages_${monthStr}.xlsx`);
});
