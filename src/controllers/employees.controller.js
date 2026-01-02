import { z } from "zod";
import { Employee } from "../models/Employee.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import ExcelJS from "exceljs";

const createSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(255),
  department: z.string().min(1).max(100),
});

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().max(255).optional(),
  department: z.string().min(1).max(100).optional(),
});

export const listEmployees = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    100,
    Math.max(5, parseInt(req.query.limit || "10", 10))
  );
  const q = (req.query.q || "").trim();
  const department = (req.query.department || "").trim();

  const filter = {};
  if (department) filter.department = department;

  if (q) {
    // Uses text index if available; falls back to regex if needed.
    // Text search is very fast for your scale.
    filter.$text = { $search: q };
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Employee.find(filter)
      .select("name email department createdAt updatedAt") // keep payload small
      .sort(q ? { score: { $meta: "textScore" } } : { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Employee.countDocuments(filter),
  ]);

  res.json({
    items: items.map((e) => ({ ...e, id: e._id.toString() })),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  });
});

export const createEmployee = asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);

  const exists = await Employee.findOne({ email: body.email }).lean();
  if (exists)
    return res.status(409).json({ message: "Employee email already exists" });

  const emp = await Employee.create({
    name: body.name,
    email: body.email,
    department: body.department,
  });

  res.status(201).json({
    item: {
      id: emp._id.toString(),
      name: emp.name,
      email: emp.email,
      department: emp.department,
      createdAt: emp.createdAt,
    },
  });
});

export const updateEmployee = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = updateSchema.parse(req.body);

  if (body.email) {
    const exists = await Employee.findOne({
      email: body.email,
      _id: { $ne: id },
    }).lean();
    if (exists)
      return res.status(409).json({ message: "Employee email already exists" });
  }

  const emp = await Employee.findByIdAndUpdate(id, body, {
    new: true,
    runValidators: true,
  });

  if (!emp) return res.status(404).json({ message: "Employee not found" });

  res.json({
    item: {
      id: emp._id.toString(),
      name: emp.name,
      email: emp.email,
      department: emp.department,
      updatedAt: emp.updatedAt,
    },
  });
});

export const deleteEmployee = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const emp = await Employee.findByIdAndDelete(id);
  if (!emp) return res.status(404).json({ message: "Employee not found" });

  res.json({ ok: true });
});

export const exportEmployeesXlsx = asyncHandler(async (req, res) => {
  // Optional: allow same filters used in list (q, department)
  const q = (req.query.q || "").trim();
  const department = (req.query.department || "").trim();

  const filter = {};
  if (department) filter.department = department;
  if (q) filter.$text = { $search: q };

  const employees = await Employee.find(filter)
    .select("name email department createdAt updatedAt")
    .sort({ createdAt: -1 })
    .lean();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ITMS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Employees", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Email", key: "email", width: 32 },
    { header: "Department", key: "department", width: 20 },
    { header: "Created At", key: "createdAt", width: 18 },
  ];

  // Header formatting
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 20;

  headerRow.eachCell((cell) => {
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

  // Data rows
  for (const e of employees) {
    sheet.addRow({
      name: e.name,
      email: e.email,
      department: e.department,
      assets: "—", // placeholder for now
      createdAt: e.createdAt ? new Date(e.createdAt) : "",
    });
  }

  // Alignment + borders
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 18;

    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  // Date format for createdAt column
  sheet.getColumn("createdAt").numFmt = "yyyy-mm-dd";

  // Autofilter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  // Response headers
  const ts = new Date().toISOString().slice(0, 10);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="employees_${ts}.xlsx"`
  );

  await workbook.xlsx.write(res);
  res.end();
});
