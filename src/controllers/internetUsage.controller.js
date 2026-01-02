import mongoose from "mongoose";
import { z } from "zod";
import ExcelJS from "exceljs";
import { asyncHandler } from "../utils/asyncHandler.js";
import { InternetConnection } from "../models/InternetConnection.js";
import { InternetPackage } from "../models/InternetPackage.js";
import { InternetUsageMonth } from "../models/InternetUsageMonth.js";
import { monthToDate, ymNowUTC } from "../utils/month.js";
import { sendXlsx } from "../utils/sendXlsx.js";

function computeUsed(start, end) {
  if (start == null || end == null) return null;
  const v = end - start;
  return Number.isFinite(v) && v >= 0 ? v : null;
}

export const generateMonth = asyncHandler(async (req, res) => {
  const monthStr = (req.query.month || "").trim();
  if (!monthStr) return res.status(400).json({ message: "Month required" });
  const month = monthToDate(monthStr);

  const actorId = req.user?.sub || req.user?.id || req.user?._id;
  if (!actorId)
    return res.status(401).json({ message: "Unauthorized (missing user id)" });

  const conns = await InternetConnection.find({ status: "active" })
    .select({ _id: 1 })
    .lean();
  const ids = conns.map((c) => c._id);

  // find existing records for month
  const existing = await InternetUsageMonth.find({
    month,
    connectionId: { $in: ids },
  })
    .select({ connectionId: 1 })
    .lean();

  const existsSet = new Set(existing.map((x) => x.connectionId.toString()));
  const missing = ids.filter((id) => !existsSet.has(id.toString()));

  if (missing.length === 0) return res.json({ created: 0 });

  const docs = missing.map((connectionId) => ({
    connectionId,
    month,
    recordedByUserId: new mongoose.Types.ObjectId(actorId),
  }));

  // insertMany is fast
  await InternetUsageMonth.insertMany(docs, { ordered: false }).catch(() => {});
  res.json({ created: missing.length });
});

export const listUsage = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    100,
    Math.max(5, parseInt(req.query.limit || "10", 10))
  );
  const skip = (page - 1) * limit;

  const monthStr = (req.query.month || ymNowUTC()).trim();
  const month = monthToDate(monthStr);

  const q = (req.query.q || "").trim();

  // build aggregation for joining + filtering
  const match = { month };

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: "internetconnections",
        localField: "connectionId",
        foreignField: "_id",
        as: "connection",
      },
    },
    { $unwind: "$connection" },
    {
      $lookup: {
        from: "internetpackages",
        let: { cid: "$connectionId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$connectionId", "$$cid"] },
                  { $eq: ["$month", month] },
                ],
              },
            },
          },
          {
            $project: { packageName: 1, dataLimitGB: 1, cost: 1, currency: 1 },
          },
        ],
        as: "pkg",
      },
    },
    { $unwind: { path: "$pkg", preserveNullAndEmptyArrays: true } },
  ];

  if (q) {
    pipeline.push({
      $match: {
        $or: [
          { "connection.name": { $regex: q, $options: "i" } },
          { "connection.provider": { $regex: q, $options: "i" } },
          { "connection.location": { $regex: q, $options: "i" } },
          { "pkg.packageName": { $regex: q, $options: "i" } },
        ],
      },
    });
  }

  pipeline.push(
    { $sort: { "connection.name": 1 } },
    {
      $facet: {
        items: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    }
  );

  const out = await InternetUsageMonth.aggregate(pipeline);
  const rows = out[0]?.items || [];
  const total = out[0]?.total?.[0]?.count || 0;

  const items = rows.map((r) => {
    const computed = computeUsed(r.startReadingGB, r.endReadingGB);
    const finalUsed = r.usedGB ?? computed ?? 0;

    const limitGB = r.pkg?.dataLimitGB ?? null;
    const percent =
      limitGB != null && limitGB > 0
        ? Math.round((finalUsed / limitGB) * 100)
        : null;
    const remainingGB =
      limitGB != null ? Math.max(0, limitGB - finalUsed) : null;

    // status label
    let usageStatus = "—";
    if (percent != null) {
      if (percent >= 100) usageStatus = "Over";
      else if (percent >= 95) usageStatus = "Critical";
      else if (percent >= 80) usageStatus = "Warning";
      else usageStatus = "OK";
    }

    return {
      id: r._id.toString(),
      month: monthStr,

      connectionId: r.connectionId.toString(),
      connectionName: r.connection.name,
      provider: r.connection.provider || "",
      location: r.connection.location || "",

      packageName: r.pkg?.packageName || "—",
      limitGB,
      usedGB: finalUsed,
      remainingGB,
      percent,
      usageStatus,

      startReadingGB: r.startReadingGB,
      endReadingGB: r.endReadingGB,
      manualUsedGB: r.usedGB,

      remarks: r.remarks || "",
      updatedAt: r.updatedAt,
    };
  });

  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

const patchSchema = z.object({
  startReadingGB: z.number().nullable().optional(),
  endReadingGB: z.number().nullable().optional(),
  manualUsedGB: z.number().nullable().optional(), // maps to usedGB
  remarks: z.string().max(1000).optional(),
});

export const updateUsage = asyncHandler(async (req, res) => {
  const body = patchSchema.parse(req.body);
  const doc = await InternetUsageMonth.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Not found" });

  if (body.startReadingGB !== undefined)
    doc.startReadingGB = body.startReadingGB;
  if (body.endReadingGB !== undefined) doc.endReadingGB = body.endReadingGB;
  if (body.manualUsedGB !== undefined) doc.usedGB = body.manualUsedGB;
  if (body.remarks !== undefined) doc.remarks = (body.remarks || "").trim();

  await doc.save();
  res.json({ ok: true });
});

export const exportUsageXlsx = asyncHandler(async (req, res) => {
  const monthStr = (req.query.month || ymNowUTC()).trim();
  const month = monthToDate(monthStr);

  // pull all usage for month (export needs full)
  const rows = await InternetUsageMonth.aggregate([
    { $match: { month } },
    {
      $lookup: {
        from: "internetconnections",
        localField: "connectionId",
        foreignField: "_id",
        as: "connection",
      },
    },
    { $unwind: "$connection" },
    {
      $lookup: {
        from: "internetpackages",
        let: { cid: "$connectionId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$connectionId", "$$cid"] },
                  { $eq: ["$month", month] },
                ],
              },
            },
          },
          {
            $project: { packageName: 1, dataLimitGB: 1, cost: 1, currency: 1 },
          },
        ],
        as: "pkg",
      },
    },
    { $unwind: { path: "$pkg", preserveNullAndEmptyArrays: true } },
    { $sort: { "connection.name": 1 } },
  ]);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Usage");

  ws.columns = [
    { header: "Month", key: "month", width: 10 },
    { header: "Connection", key: "conn", width: 22 },
    { header: "Provider", key: "provider", width: 14 },
    { header: "Location", key: "location", width: 16 },
    { header: "Package", key: "pkg", width: 22 },
    { header: "Limit (GB)", key: "limit", width: 12 },
    { header: "Start (GB)", key: "start", width: 12 },
    { header: "End (GB)", key: "end", width: 12 },
    { header: "Manual Used (GB)", key: "manual", width: 14 },
    { header: "Final Used (GB)", key: "used", width: 14 },
    { header: "Remaining (GB)", key: "remain", width: 14 },
    { header: "%", key: "pct", width: 8 },
    { header: "Status", key: "status", width: 10 },
    { header: "Remarks", key: "remarks", width: 28 },
  ];

  ws.getRow(1).font = { bold: true };

  let totalUsed = 0;

  for (const r of rows) {
    const computed = computeUsed(r.startReadingGB, r.endReadingGB);
    const finalUsed = r.usedGB ?? computed ?? 0;
    totalUsed += finalUsed;

    const limitGB = r.pkg?.dataLimitGB ?? null;
    const percent =
      limitGB != null && limitGB > 0
        ? Math.round((finalUsed / limitGB) * 100)
        : null;
    const remaining = limitGB != null ? Math.max(0, limitGB - finalUsed) : null;

    let usageStatus = "—";
    if (percent != null) {
      if (percent >= 100) usageStatus = "Over";
      else if (percent >= 95) usageStatus = "Critical";
      else if (percent >= 80) usageStatus = "Warning";
      else usageStatus = "OK";
    }

    ws.addRow({
      month: monthStr,
      conn: r.connection.name,
      provider: r.connection.provider || "—",
      location: r.connection.location || "—",
      pkg: r.pkg?.packageName || "—",
      limit: limitGB == null ? "Unlimited/—" : limitGB,
      start: r.startReadingGB ?? "",
      end: r.endReadingGB ?? "",
      manual: r.usedGB ?? "",
      used: finalUsed,
      remain: remaining ?? "",
      pct: percent ?? "",
      status: usageStatus,
      remarks: r.remarks || "",
    });
  }

  // summary row
  ws.addRow({});
  const sumRow = ws.addRow({
    month: "TOTAL",
    used: totalUsed,
  });
  sumRow.font = { bold: true };

  await sendXlsx(res, wb, `internet_usage_${monthStr}.xlsx`);
});
