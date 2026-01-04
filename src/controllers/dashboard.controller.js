import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Asset } from "../models/Asset.js";
import { Employee } from "../models/Employee.js";
import { AssetAssignment } from "../models/AssetAssignment.js";
import { MaintenanceJob } from "../models/MaintenanceJob.js";
import { MaintenanceLog } from "../models/MaintenanceLog.js";
import { RepairTicket } from "../models/RepairTicket.js";

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function monthKey(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function lastNMonthsKeys(n = 6) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: monthKey(d), date: d });
  }
  return out;
}

// Finds the first existing collection name from candidates
async function pickCollection(nameCandidates) {
  const cols = await mongoose.connection.db.listCollections().toArray();
  const names = new Set(cols.map((c) => c.name));
  return nameCandidates.find((n) => names.has(n)) || null;
}

// Run aggregate on a raw collection
async function aggCol(colName, pipeline) {
  if (!colName) return [];
  return mongoose.connection.db
    .collection(colName)
    .aggregate(pipeline)
    .toArray();
}

async function safeCount(model, query = {}) {
  try {
    if (!model) return 0;
    return await model.countDocuments(query);
  } catch {
    return 0;
  }
}
async function safeAgg(model, pipeline = []) {
  try {
    if (!model) return [];
    return await model.aggregate(pipeline);
  } catch {
    return [];
  }
}

export const getDashboardSummary = asyncHandler(async (req, res) => {
  const now = new Date();
  const dueWindowDays = 14;

  const dueFrom = startOfDay(now);
  const dueTo = startOfDay(addDays(now, dueWindowDays));

  const months = lastNMonthsKeys(6);
  const currentKey = monthKey(now);

  // ----------------------------
  // KPI COUNTS
  // ----------------------------
  const [
    totalAssets,
    totalEmployees,
    assignedAssets,
    openMaintenance,
    openRepairs,
  ] = await Promise.all([
    safeCount(Asset),
    safeCount(Employee),
    safeCount(AssetAssignment, { status: "active" }),
    safeCount(MaintenanceJob, { status: { $in: ["open", "in_progress"] } }),
    safeCount(RepairTicket, { status: { $in: ["open", "in_progress"] } }),
  ]);

  const unassignedAssets = Math.max(0, totalAssets - assignedAssets);

  // ----------------------------
  // Alerts (14 days)
  // ----------------------------
  const warrantyDue = await safeCount(Asset, {
    warrantyExpiry: { $gte: dueFrom, $lte: dueTo },
  });

  const maintenanceOverdue = await safeCount(MaintenanceJob, {
    status: { $in: ["open", "in_progress"] },
    createdAt: { $lt: dueFrom },
  });

  const repairsOverdue = await safeCount(RepairTicket, {
    status: { $in: ["open", "in_progress"] },
    createdAt: { $lt: dueFrom },
  });

  // ----------------------------
  // SOFTWARE: renewals due in next 14 days (auto-detect collection + field)
  // ----------------------------
  const softwareCol = await pickCollection([
    "softwares",
    "software",
    "softwareitems",
  ]);

  let renewalsDue = 0;

  if (softwareCol) {
    // Support common renewal fields:
    // nextRenewalAt | renewalAt | renewalDate | expiryAt | expiresAt
    const out = await aggCol(softwareCol, [
      {
        $addFields: {
          __next: {
            $ifNull: [
              "$nextRenewalAt",
              {
                $ifNull: [
                  "$renewalAt",
                  {
                    $ifNull: [
                      "$renewalDate",
                      { $ifNull: ["$expiryAt", "$expiresAt"] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      { $match: { __next: { $type: "date" } } },
      { $match: { __next: { $gte: dueFrom, $lte: dueTo } } },
      { $count: "count" },
    ]);

    renewalsDue = out?.[0]?.count || 0;
  }

  // ----------------------------
  // INTERNET: month totals + trend (auto-detect collection)
  // ----------------------------
  const internetUsageCol = await pickCollection([
    "internetusages",
    "internet_usage",
    "internetusage",
    "usage",
    "internetusagemonths",
  ]);

  let internetUsageThisMonthGB = 0;
  let internetCostThisMonthLKR = 0;

  // default chart values
  let internetTrend = months.map((m) => ({
    month: m.key,
    usedGB: 0,
    costLKR: 0,
  }));

  if (internetUsageCol) {
    const rows = await aggCol(internetUsageCol, [
      {
        $addFields: {
          __monthKey: { $ifNull: ["$monthKey", "$month"] },
          __usedGB: {
            $ifNull: ["$totalGB", { $ifNull: ["$usedGB", "$usageGB"] }],
          },
          __costLKR: {
            $ifNull: ["$totalCostLKR", { $ifNull: ["$costLkr", "$cost"] }],
          },
        },
      },
      // If monthKey missing but year/month exists, build YYYY-MM
      {
        $addFields: {
          __monthKey: {
            $cond: [
              {
                $and: [
                  { $not: ["$__monthKey"] },
                  { $gt: ["$year", 0] },
                  { $gt: ["$month", 0] },
                ],
              },
              {
                $concat: [
                  { $toString: "$year" },
                  "-",
                  {
                    $cond: [
                      { $lt: ["$month", 10] },
                      { $concat: ["0", { $toString: "$month" }] },
                      { $toString: "$month" },
                    ],
                  },
                ],
              },
              "$__monthKey",
            ],
          },
        },
      },
      { $match: { __monthKey: { $in: months.map((m) => m.key) } } },
      {
        $group: {
          _id: "$__monthKey",
          usedGB: { $sum: { $toDouble: { $ifNull: ["$__usedGB", 0] } } },
          costLKR: { $sum: { $toDouble: { $ifNull: ["$__costLKR", 0] } } },
        },
      },
    ]);

    const map = new Map(rows.map((r) => [r._id, r]));

    internetTrend = months.map((m) => ({
      month: m.key,
      usedGB: map.get(m.key)?.usedGB || 0,
      costLKR: map.get(m.key)?.costLKR || 0,
    }));

    const cur = map.get(currentKey);
    internetUsageThisMonthGB = cur?.usedGB || 0;
    internetCostThisMonthLKR = cur?.costLKR || 0;
  }

  // Software cost monthly total (optional later; depends on your schema)
  const softwareCostThisMonthLKR = 0;

  // ----------------------------
  // Charts
  // ----------------------------
  const maintByMonth = await safeAgg(MaintenanceJob, [
    { $match: { createdAt: { $gte: new Date(months[0].date) } } },
    {
      $group: {
        _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
  ]);

  const repairsByMonth = await safeAgg(RepairTicket, [
    { $match: { createdAt: { $gte: new Date(months[0].date) } } },
    {
      $group: {
        _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
  ]);

  const maintMap = new Map(
    maintByMonth.map((x) => [
      `${x._id.y}-${String(x._id.m).padStart(2, "0")}`,
      x.count,
    ])
  );
  const repairsMap = new Map(
    repairsByMonth.map((x) => [
      `${x._id.y}-${String(x._id.m).padStart(2, "0")}`,
      x.count,
    ])
  );

  const ticketTrend = months.map((m) => ({
    month: m.key,
    maintenance: maintMap.get(m.key) || 0,
    repairs: repairsMap.get(m.key) || 0,
  }));

  // ----------------------------
  // Recent activity (last 10)
  // ----------------------------
  const maintLogs = await safeAgg(MaintenanceLog, [
    { $sort: { createdAt: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "maintenancejobs",
        localField: "jobId",
        foreignField: "_id",
        as: "job",
        pipeline: [{ $project: { jobNo: 1, status: 1, employeeId: 1 } }],
      },
    },
    { $unwind: { path: "$job", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        createdAt: 1,
        action: 1,
        note: 1,
        fromStatus: 1,
        toStatus: 1,
        jobNo: "$job.jobNo",
        kind: { $literal: "maintenance" },
      },
    },
  ]);

  const assignmentRecent = await safeAgg(AssetAssignment, [
    { $sort: { assignedAt: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "assets",
        localField: "assetId",
        foreignField: "_id",
        as: "asset",
        pipeline: [{ $project: { assetTag: 1, name: 1 } }],
      },
    },
    { $unwind: { path: "$asset", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "employees",
        localField: "employeeId",
        foreignField: "_id",
        as: "employee",
        pipeline: [{ $project: { name: 1, email: 1 } }],
      },
    },
    { $unwind: { path: "$employee", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        createdAt: "$assignedAt",
        kind: { $literal: "assignment" },
        action: { $literal: "assigned" },
        note: {
          $concat: [
            "Assigned ",
            { $ifNull: ["$asset.assetTag", "—"] },
            " to ",
            { $ifNull: ["$employee.name", "—"] },
          ],
        },
      },
    },
  ]);

  const recent = [...maintLogs, ...assignmentRecent]
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10)
    .map((x, i) => ({
      id: `${x.kind}-${i}-${new mongoose.Types.ObjectId().toString()}`,
      kind: x.kind,
      action: x.action,
      note: x.note || "",
      createdAt: x.createdAt,
      jobNo: x.jobNo,
    }));

  res.json({
    meta: {
      generatedAt: now.toISOString(),
      dueWindowDays,
      currency: "LKR",
    },
    kpis: {
      totalAssets,
      assignedAssets,
      unassignedAssets,
      totalEmployees,
      openRepairs,
      openMaintenance,
      renewalsDue,
      warrantyDue,
      internetUsageThisMonthGB,
      internetCostThisMonthLKR,
      softwareCostThisMonthLKR,
    },
    alerts: {
      renewalsDue,
      warrantyDue,
      repairsOverdue,
      maintenanceOverdue,
      dueFrom: dueFrom.toISOString(),
      dueTo: dueTo.toISOString(),
    },
    charts: {
      ticketTrend,
      internetTrend,
    },
    recent,
  });
});
