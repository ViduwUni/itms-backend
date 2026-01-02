import { z } from "zod";
import { Asset } from "../models/Asset.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ExcelJS from "exceljs";

const createSchema = z.object({
  assetTag: z.string().min(1).max(50),
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(80),
  brand: z.string().max(80).optional().default(""),
  model: z.string().max(80).optional().default(""),
  serialNumber: z.string().max(120).optional().default(""),
  purchaseDate: z.string().optional().nullable(),
  warrantyExpiry: z.string().optional().nullable(),
  department: z.string().min(1).max(100),
  remarks: z.string().max(1000).optional().default(""),
});

const updateSchema = createSchema.partial();

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const listAssets = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    100,
    Math.max(5, parseInt(req.query.limit || "10", 10))
  );

  const q = (req.query.q || "").trim();
  const department = (req.query.department || "").trim();
  const category = (req.query.category || "").trim();
  const expiringSoon = String(req.query.expiringSoon || "") === "1";

  const filter = {};
  if (department) filter.department = department;
  if (category) filter.category = category;
  if (q) filter.$text = { $search: q };

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Asset.find(filter)
      .select(
        "assetTag name category brand model serialNumber purchaseDate warrantyExpiry department remarks createdAt"
      )
      .sort(q ? { score: { $meta: "textScore" } } : { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Asset.countDocuments(filter),
  ]);

  if (expiringSoon) {
    const now = new Date();
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);

    filter.warrantyExpiry = { $ne: null, $gte: now, $lte: soon };
  }

  res.json({
    items: items.map((a) => ({ ...a, id: a._id.toString() })),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  });
});

export const createAsset = asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);

  const exists = await Asset.findOne({ assetTag: body.assetTag.trim() }).lean();
  if (exists)
    return res.status(409).json({ message: "Asset Tag already exists" });

  const doc = await Asset.create({
    assetTag: body.assetTag.trim(),
    name: body.name.trim(),
    category: body.category.trim(),
    brand: (body.brand || "").trim(),
    model: (body.model || "").trim(),
    serialNumber: (body.serialNumber || "").trim(),
    purchaseDate: toDateOrNull(body.purchaseDate),
    warrantyExpiry: toDateOrNull(body.warrantyExpiry),
    department: body.department.trim(),
    remarks: (body.remarks || "").trim(),
  });

  res.status(201).json({
    item: {
      id: doc._id.toString(),
      assetTag: doc.assetTag,
      name: doc.name,
      category: doc.category,
      brand: doc.brand,
      model: doc.model,
      serialNumber: doc.serialNumber,
      purchaseDate: doc.purchaseDate,
      warrantyExpiry: doc.warrantyExpiry,
      department: doc.department,
      remarks: doc.remarks,
      createdAt: doc.createdAt,
    },
  });
});

export const updateAsset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = updateSchema.parse(req.body);

  if (body.assetTag) {
    const exists = await Asset.findOne({
      assetTag: body.assetTag.trim(),
      _id: { $ne: id },
    }).lean();
    if (exists)
      return res.status(409).json({ message: "Asset Tag already exists" });
  }

  const update = {
    ...body,
    assetTag: body.assetTag ? body.assetTag.trim() : undefined,
    name: body.name ? body.name.trim() : undefined,
    category: body.category ? body.category.trim() : undefined,
    brand: body.brand != null ? String(body.brand).trim() : undefined,
    model: body.model != null ? String(body.model).trim() : undefined,
    serialNumber:
      body.serialNumber != null ? String(body.serialNumber).trim() : undefined,
    department: body.department ? body.department.trim() : undefined,
    remarks: body.remarks != null ? String(body.remarks).trim() : undefined,
  };

  if ("purchaseDate" in body)
    update.purchaseDate = toDateOrNull(body.purchaseDate);
  if ("warrantyExpiry" in body)
    update.warrantyExpiry = toDateOrNull(body.warrantyExpiry);

  const doc = await Asset.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });
  if (!doc) return res.status(404).json({ message: "Asset not found" });

  res.json({
    item: {
      id: doc._id.toString(),
      assetTag: doc.assetTag,
      name: doc.name,
      category: doc.category,
      brand: doc.brand,
      model: doc.model,
      serialNumber: doc.serialNumber,
      purchaseDate: doc.purchaseDate,
      warrantyExpiry: doc.warrantyExpiry,
      department: doc.department,
      remarks: doc.remarks,
      updatedAt: doc.updatedAt,
    },
  });
});

export const deleteAsset = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const doc = await Asset.findByIdAndDelete(id);
  if (!doc) return res.status(404).json({ message: "Asset not found" });

  res.json({ ok: true });
});

export const exportAssetsXlsx = asyncHandler(async (req, res) => {
  function daysBetween(a, b) {
    const ms = b.getTime() - a.getTime();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  function calcAgeYears(purchaseDate) {
    if (!purchaseDate) return "";
    const now = new Date();
    const years =
      (now.getTime() - new Date(purchaseDate).getTime()) /
      (1000 * 60 * 60 * 24 * 365.25);
    if (years < 0) return "";
    return years.toFixed(1); // like 2.4 years
  }

  function warrantyStatus(warrantyExpiry) {
    if (!warrantyExpiry) return "—";
    const now = new Date();
    const exp = new Date(warrantyExpiry);

    if (exp < now) return "Expired";

    const d = daysBetween(now, exp);
    if (d <= 30) return `Expiring (${d}d)`;

    return "Active";
  }

  // optional filters (same as list endpoint)
  const q = (req.query.q || "").trim();
  const department = (req.query.department || "").trim();
  const category = (req.query.category || "").trim();
  const expiringSoon = String(req.query.expiringSoon || "") === "1";

  const filter = {};
  if (department) filter.department = department;
  if (category) filter.category = category;
  if (q) filter.$text = { $search: q };

  const assets = await Asset.find(filter)
    .select(
      "assetTag name category brand model serialNumber purchaseDate warrantyExpiry department remarks createdAt"
    )
    .sort({ createdAt: -1 })
    .lean();

  if (expiringSoon) {
    const now = new Date();
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    filter.warrantyExpiry = { $ne: null, $gte: now, $lte: soon };
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "ITMS";
  wb.created = new Date();

  const ws = wb.addWorksheet("Assets", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = [
    { header: "Asset Tag", key: "assetTag", width: 16 },
    { header: "Name", key: "name", width: 26 },
    { header: "Category", key: "category", width: 18 },
    { header: "Brand", key: "brand", width: 16 },
    { header: "Model", key: "model", width: 16 },
    { header: "Serial Number", key: "serialNumber", width: 22 },
    { header: "Purchase Date", key: "purchaseDate", width: 14 },
    { header: "Age (Years)", key: "ageYears", width: 12 },
    { header: "Warranty Expiry", key: "warrantyExpiry", width: 16 },
    { header: "Warranty Status", key: "warrantyStatus", width: 16 },
    { header: "Department", key: "department", width: 18 },
    { header: "Remarks", key: "remarks", width: 32 },
    { header: "Created At", key: "createdAt", width: 14 },
  ];

  // Header styling
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle" };
  header.height = 20;

  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" }, // slate-900
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
  });

  // Rows
  for (const a of assets) {
    ws.addRow({
      assetTag: a.assetTag || "",
      name: a.name || "",
      category: a.category || "",
      brand: a.brand || "",
      model: a.model || "",
      serialNumber: a.serialNumber || "",
      purchaseDate: a.purchaseDate ? new Date(a.purchaseDate) : "",
      ageYears: a.purchaseDate ? calcAgeYears(a.purchaseDate) : "",
      warrantyExpiry: a.warrantyExpiry ? new Date(a.warrantyExpiry) : "",
      warrantyStatus: warrantyStatus(a.warrantyExpiry),
      department: a.department || "",
      remarks: a.remarks || "",
      createdAt: a.createdAt ? new Date(a.createdAt) : "",
    });
  }

  // Row styling (light borders + vertical center)
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 18;

    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  // Date formats
  ws.getColumn("purchaseDate").numFmt = "yyyy-mm-dd";
  ws.getColumn("warrantyExpiry").numFmt = "yyyy-mm-dd";
  ws.getColumn("createdAt").numFmt = "yyyy-mm-dd";

  // Auto-filter
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
    `attachment; filename="assets_${ts}.xlsx"`
  );

  await wb.xlsx.write(res);
  res.end();
});
