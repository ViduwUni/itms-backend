import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { InternetConnection } from "../models/InternetConnection.js";
import { sendXlsx } from "../utils/sendXlsx.js";
import ExcelJS from "exceljs";

const schema = z.object({
  name: z.string().min(1),
  provider: z.string().optional().default(""),
  location: z.string().optional().default(""),
  accountNumber: z.string().optional().default(""),
  routerModel: z.string().optional().default(""),
  serialNumber: z.string().optional().default(""),
  ipAddress: z.string().optional().default(""),
  status: z.enum(["active", "inactive"]).optional().default("active"),
  remarks: z.string().optional().default(""),
});

export const listConnections = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1"));
  const limit = Math.min(100, Math.max(5, parseInt(req.query.limit || "10")));
  const skip = (page - 1) * limit;

  const q = (req.query.q || "").trim();
  const status = (req.query.status || "").trim();

  const filter = {};
  if (q) filter.$text = { $search: q };
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    InternetConnection.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    InternetConnection.countDocuments(filter),
  ]);

  res.json({
    items: items.map((x) => ({ ...x, id: x._id.toString() })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

export const createConnection = asyncHandler(async (req, res) => {
  const body = schema.parse(req.body);
  const doc = await InternetConnection.create(body);
  res.status(201).json({ id: doc._id.toString() });
});

export const updateConnection = asyncHandler(async (req, res) => {
  const body = schema.partial().parse(req.body);
  const doc = await InternetConnection.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  Object.assign(doc, body);
  await doc.save();
  res.json({ ok: true });
});

export const deleteConnection = asyncHandler(async (req, res) => {
  await InternetConnection.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export const exportConnectionsXlsx = asyncHandler(async (req, res) => {
  const q = (req.query.q || "").trim();
  const status = (req.query.status || "").trim();

  const filter = {};
  if (q) filter.$text = { $search: q };
  if (status) filter.status = status;

  const items = await InternetConnection.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Connections");

  ws.columns = [
    { header: "Name", key: "name", width: 22 },
    { header: "Provider", key: "provider", width: 14 },
    { header: "Location", key: "location", width: 16 },
    { header: "Account #", key: "accountNumber", width: 16 },
    { header: "Router Model", key: "routerModel", width: 16 },
    { header: "Serial", key: "serialNumber", width: 18 },
    { header: "IP", key: "ipAddress", width: 16 },
    { header: "Status", key: "status", width: 10 },
    { header: "Remarks", key: "remarks", width: 26 },
  ];

  ws.getRow(1).font = { bold: true };

  for (const x of items) {
    ws.addRow({
      name: x.name,
      provider: x.provider || "",
      location: x.location || "",
      accountNumber: x.accountNumber || "",
      routerModel: x.routerModel || "",
      serialNumber: x.serialNumber || "",
      ipAddress: x.ipAddress || "",
      status: x.status,
      remarks: x.remarks || "",
    });
  }

  await sendXlsx(res, wb, `internet_connections.xlsx`);
});
