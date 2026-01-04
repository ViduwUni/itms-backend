import PDFDocument from "pdfkit";
import fs from "fs";

function fmtDate(d) {
  if (!d) return "—";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "—";
  return x.toISOString().slice(0, 10);
}

function createHeader(doc, reqDoc) {
  // Header with corporate blue
  doc.rect(0, 0, doc.page.width, 80).fill("#1e3a5f");

  // Logo on the right
  const logoPath = "../assets/logo.png";
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, doc.page.width - 160, 20, {
      width: 120,
      align: "right",
    });
  }

  // Title
  doc
    .fontSize(16)
    .font("Helvetica-Bold")
    .fillColor("#ffffff")
    .text("Fingerprint Access Request", 50, 30);

  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("rgba(255, 255, 255, 0.8)")
    .text("Security Access Control System", 50, 50);

  // Document ID
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#ffffff")
    .text(
      `Document ID: ${reqDoc._id.toString().slice(0, 8)}`,
      doc.page.width - 160,
      50
    );

  doc.y = 100;
}

function createSection(doc, title) {
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .fillColor("#1e3a5f")
    .text(title.toUpperCase());

  doc
    .moveDown(0.1)
    .lineWidth(1)
    .strokeColor("#e0e6ef")
    .moveTo(doc.x, doc.y)
    .lineTo(doc.x + 150, doc.y)
    .stroke();

  doc.moveDown(0.3);
  return doc.y;
}

function createTwoColumnRow(doc, label1, value1, label2, value2) {
  const col1X = 50;
  const col2X = doc.page.width / 2 + 20;
  const currentY = doc.y;

  // Column 1
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor("#4a5568")
    .text(label1, col1X, currentY);

  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#2d3748")
    .text(value1 || "—", col1X, currentY + 12, {
      width: doc.page.width / 2 - 70,
    });

  // Column 2
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor("#4a5568")
    .text(label2, col2X, currentY);

  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#2d3748")
    .text(value2 || "—", col2X, currentY + 12, {
      width: doc.page.width / 2 - 70,
    });

  doc.y = currentY + 30;
}

function createStatusBadge(doc, status) {
  const statusColors = {
    pending: { bg: "#fef3c7", text: "#92400e" },
    approved: { bg: "#d1fae5", text: "#065f46" },
    rejected: { bg: "#fee2e2", text: "#991b1b" },
    completed: { bg: "#dbeafe", text: "#1e40af" },
  };

  const color = statusColors[status] || { bg: "#f3f4f6", text: "#374151" };

  doc.roundedRect(doc.page.width - 80, 30, 60, 20, 10).fill(color.bg);

  doc
    .fontSize(8)
    .font("Helvetica-Bold")
    .fillColor(color.text)
    .text(status.toUpperCase(), doc.page.width - 75, 36, {
      width: 50,
      align: "center",
    });
}

export function buildFingerprintRequestPdf({ reqDoc, person, system }) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    bufferPages: true,
  });

  // Create header
  createHeader(doc, reqDoc);

  // Add status badge
  createStatusBadge(doc, reqDoc.status);

  /* =====================
     REQUEST SUMMARY
     ===================== */

  doc.moveDown(0.5);
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#4a5568")
    .text(`Request Date: ${fmtDate(reqDoc.createdAt)}`, { align: "right" });

  doc
    .moveDown(0.3)
    .lineWidth(0.5)
    .strokeColor("#e2e8f0")
    .moveTo(50, doc.y)
    .lineTo(doc.page.width - 50, doc.y)
    .stroke();

  /* =====================
     PERSON DETAILS
     ===================== */

  createSection(doc, "Person Details");

  createTwoColumnRow(
    doc,
    "Full Name:",
    person?.name || "—",
    "Email:",
    person?.email || "—"
  );

  createTwoColumnRow(
    doc,
    "Department:",
    person?.department || "—",
    "Employee ID:",
    person?.employeeId || "—"
  );

  createTwoColumnRow(
    doc,
    "Person Type:",
    reqDoc.personType || "—",
    "Position:",
    person?.position || "—"
  );

  /* =====================
     SYSTEM DETAILS
     ===================== */

  createSection(doc, "System Details");

  createTwoColumnRow(
    doc,
    "System Name:",
    system?.name || "—",
    "Location:",
    system?.location || "—"
  );

  createTwoColumnRow(
    doc,
    "Device ID:",
    system?.deviceId || "—",
    "Department:",
    system?.department || "—"
  );

  createTwoColumnRow(
    doc,
    "Vendor:",
    system?.vendor || "—",
    "Model:",
    system?.model || "—"
  );

  createTwoColumnRow(
    doc,
    "IP Address:",
    system?.ipAddress || "—",
    "Serial Number:",
    system?.serialNumber || "—"
  );

  /* =====================
     ACCESS DETAILS
     ===================== */

  createSection(doc, "Access Details");

  createTwoColumnRow(
    doc,
    "Access Type:",
    reqDoc.accessType || "—",
    "Access Level:",
    reqDoc.accessLevel || "Standard"
  );

  createTwoColumnRow(
    doc,
    "Valid From:",
    fmtDate(reqDoc.validFrom),
    "Valid To:",
    reqDoc.accessType === "temporary" ? fmtDate(reqDoc.validTo) : "Permanent"
  );

  createTwoColumnRow(
    doc,
    "Schedule:",
    reqDoc.schedule || "24/7 Access",
    "Timezone:",
    reqDoc.timezone || "UTC"
  );

  // Remarks
  doc.moveDown(0.3);
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor("#4a5568")
    .text("Remarks:", 50, doc.y);

  doc
    .moveDown(0.1)
    .lineWidth(0.5)
    .strokeColor("#e2e8f0")
    .moveTo(50, doc.y)
    .lineTo(doc.page.width - 50, doc.y)
    .stroke();

  doc.moveDown(0.2);
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#4a5568")
    .text(reqDoc.remarks || "No remarks provided.", 50, doc.y, {
      width: doc.page.width - 100,
      lineGap: 3,
    });

  doc.y += 20;

  /* =====================
     APPROVAL DETAILS
     ===================== */

  createSection(doc, "Approval Details");

  createTwoColumnRow(
    doc,
    "Approved By:",
    reqDoc.approvedByUserId || "Pending",
    "Approver Role:",
    reqDoc.approverRole || "—"
  );

  createTwoColumnRow(
    doc,
    "Approval Date:",
    fmtDate(reqDoc.approvedAt),
    "Approval Status:",
    reqDoc.approvedByUserId ? "Approved" : "Pending"
  );

  /* =====================
     AUTHORIZATIONS
     ===================== */

  createSection(doc, "Authorizations");

  const signatureY = doc.y + 10;
  const signatureWidth = (doc.page.width - 100) / 2;

  // HR Authorization
  doc.rect(50, signatureY, signatureWidth, 80).stroke("#e2e8f0");

  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor("#4a5568")
    .text("HR Department", 60, signatureY + 15);

  doc
    .moveTo(60, signatureY + 50)
    .lineTo(50 + signatureWidth - 20, signatureY + 50)
    .stroke("#cbd5e0")
    .lineWidth(0.5);

  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor("#718096")
    .text("Signature", 60, signatureY + 55);

  doc.fontSize(8).text("Date: ___________", 60, signatureY + 65);

  // IT Security Authorization
  doc
    .rect(50 + signatureWidth, signatureY, signatureWidth, 80)
    .stroke("#e2e8f0");

  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor("#4a5568")
    .text("IT Security", 60 + signatureWidth, signatureY + 15);

  doc
    .moveTo(60 + signatureWidth, signatureY + 50)
    .lineTo(50 + signatureWidth * 2 - 20, signatureY + 50)
    .stroke("#cbd5e0")
    .lineWidth(0.5);

  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor("#718096")
    .text("Signature", 60 + signatureWidth, signatureY + 55);

  doc
    .fontSize(8)
    .text("Date: ___________", 60 + signatureWidth, signatureY + 65);

  doc.y = signatureY + 90;

  /* =====================
     FOOTER
     ===================== */

  doc
    .moveDown(0.5)
    .lineWidth(0.5)
    .strokeColor("#e2e8f0")
    .moveTo(50, doc.y)
    .lineTo(doc.page.width - 50, doc.y)
    .stroke();

  doc.moveDown(0.3);

  doc
    .fontSize(7)
    .font("Helvetica")
    .fillColor("#718096")
    .text(
      "This document is system-generated and intended for internal corporate use only.",
      50,
      doc.y,
      {
        align: "center",
        width: doc.page.width - 100,
      }
    );

  doc
    .fontSize(7)
    .text(
      `Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString(
        [],
        { hour: "2-digit", minute: "2-digit" }
      )}`,
      50,
      doc.y + 10,
      {
        align: "center",
        width: doc.page.width - 100,
      }
    );

  // Add page numbers if multiple pages (but this should fit on one)
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);

    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor("#a0aec0")
      .text(`Page ${i + 1} of ${pages.count}`, 50, doc.page.height - 30, {
        align: "right",
        width: doc.page.width - 100,
      });
  }

  doc.end();
  return doc;
}
