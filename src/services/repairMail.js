import { sendMailSafe } from "./graphMail.js";

function isEnabled() {
  return String(process.env.EMAIL_NOTIFICATIONS_ENABLED || "true") === "true";
}

function parseList(envVal) {
  return (envVal || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function repairEmailHtml({
  title,
  ticketNo,
  asset,
  employee,
  ticket,
  actionLabel,
}) {
  const today = new Date().toISOString().slice(0, 10);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      background: #ffffff;
      color: #000000;
      margin: 0;
      padding: 24px;
    }
    .container {
      max-width: 640px;
      margin: 0 auto;
      border: 1px solid #000;
      padding: 32px;
    }
    .header {
      border-bottom: 2px solid #000;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
    }
    .header p {
      margin: 4px 0 0;
      font-size: 12px;
    }
    .section {
      margin-bottom: 24px;
    }
    .section h2 {
      font-size: 15px;
      margin-bottom: 12px;
      border-bottom: 1px solid #000;
      padding-bottom: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    td {
      padding: 8px 6px;
      vertical-align: top;
    }
    td.label {
      width: 35%;
      font-weight: bold;
    }
    .footer {
      border-top: 2px solid #000;
      padding-top: 16px;
      font-size: 12px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">

    <div class="header">
      <h1>${actionLabel}</h1>
      <p>IT Management System</p>
      <p>Date: ${today}</p>
    </div>

    <div class="section">
      <p>
        Dear <strong>${employee.name}</strong>,<br /><br />
        This email is to inform you about the following repair ticket.
      </p>
    </div>

    <div class="section">
      <h2>Ticket Details</h2>
      <table>
        <tr><td class="label">Ticket No</td><td>${ticketNo}</td></tr>
        <tr><td class="label">Title</td><td>${title}</td></tr>
        <tr><td class="label">Type</td><td>${ticket.type}</td></tr>
        <tr><td class="label">Priority</td><td>${ticket.priority}</td></tr>
        <tr><td class="label">Status</td><td>${ticket.status}</td></tr>
        <tr><td class="label">Warranty</td><td>${
          ticket.warranty ? "Yes" : "No"
        }</td></tr>
      </table>
    </div>

    <div class="section">
      <h2>Asset Information</h2>
      <table>
        <tr><td class="label">Asset Tag</td><td>${asset.assetTag}</td></tr>
        <tr><td class="label">Asset Name</td><td>${asset.name}</td></tr>
        <tr><td class="label">Category</td><td>${asset.category}</td></tr>
        <tr><td class="label">Department</td><td>${ticket.department}</td></tr>
      </table>
    </div>

    <div class="section">
      <h2>Additional Information</h2>
      <table>
        <tr><td class="label">Vendor</td><td>${
          ticket.vendorName || "—"
        }</td></tr>
        <tr><td class="label">Cost (LKR)</td><td>${
          ticket.costLKR ?? "—"
        }</td></tr>
        <tr><td class="label">Remarks</td><td>${ticket.remarks || "—"}</td></tr>
      </table>
    </div>

    <div class="footer">
      <p>This is an automated system email. Please do not reply.</p>
      <p>Contact the IT Department for assistance.</p>
      <p>© ${new Date().getFullYear()} IT Management System</p>
    </div>

  </div>
</body>
</html>`;
}

export function notifyRepair({ toEmployee, subject, html, extraTo = [] }) {
  if (!isEnabled()) return;

  const admin = process.env.ADMIN_EMAIL;
  const hr = process.env.HR_EMAIL;
  const extra = parseList(process.env.REPAIR_NOTIFY_LIST);

  const to = [
    ...(toEmployee ? [toEmployee] : []),
    ...(admin ? [admin] : []),
    ...(hr ? [hr] : []),
    ...extra,
    ...extraTo,
  ].filter(Boolean);

  // fire-and-forget safe
  sendMailSafe({ to, subject, html });
}
