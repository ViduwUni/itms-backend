import { sendMailSafe } from "./graphMail.js";

function isEnabled() {
  return String(process.env.EMAIL_NOTIFICATIONS_ENABLED || "true") === "true";
}

function parseList(v) {
  return (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function maintenanceAssetsTableHtml(assets) {
  const rows = (assets || [])
    .map(
      (a) => `
        <tr>
          <td class="label">Asset Tag</td>
          <td>${a.assetTag || "—"}</td>
        </tr>
        <tr>
          <td class="label">Asset Name</td>
          <td>${a.name || "—"}</td>
        </tr>
        <tr>
          <td class="label">Category</td>
          <td>${a.category || "—"}</td>
        </tr>
        <tr>
          <td class="label">Department</td>
          <td>${a.department || "—"}</td>
        </tr>
        <tr>
          <td class="label">Serial Number</td>
          <td>${a.serialNumber || "—"}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding: 4px 0;"></td>
        </tr>
      `
    )
    .join("");

  return `<table>${rows}</table>`;
}

export function maintenanceEmailHtml({ kind, job, employee, assets }) {
  const today = new Date().toISOString().slice(0, 10);

  const scheduled = job.scheduledAt
    ? new Date(job.scheduledAt).toISOString().slice(0, 10)
    : "—";

  const headline =
    kind === "created"
      ? "Maintenance Job Opened"
      : kind === "completed"
      ? "Maintenance Completed"
      : "Maintenance Update";

  const message =
    kind === "created"
      ? "Please hand over the asset(s) to the IT Department for maintenance or cleanup."
      : kind === "completed"
      ? "Maintenance has been completed. Please collect your asset(s) from the IT Department."
      : "The maintenance job has been updated.";

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
      font-weight: bold;
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

    .remarks {
      border: 1px solid #000;
      padding: 12px;
      font-size: 14px;
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
      <h1>${headline}</h1>
      <p>IT Management System</p>
      <p>Date: ${today}</p>
    </div>

    <div class="section">
      <p>
        Dear <strong>${employee.name}</strong>,<br /><br />
        ${message}
      </p>
    </div>

    <div class="section">
      <h2>Maintenance Details</h2>
      <table>
        <tr>
          <td class="label">Job Number</td>
          <td>${job.jobNo}</td>
        </tr>
        <tr>
          <td class="label">Scheduled Date</td>
          <td>${scheduled}</td>
        </tr>
        <tr>
          <td class="label">Employee</td>
          <td>${employee.name} (${employee.email})</td>
        </tr>
        <tr>
          <td class="label">Purpose</td>
          <td>${job.purpose || "—"}</td>
        </tr>
        <tr>
          <td class="label">Status</td>
          <td>${job.status}</td>
        </tr>
      </table>
    </div>

    ${
      job.remarks
        ? `
    <div class="section">
      <h2>Remarks</h2>
      <div class="remarks">${job.remarks}</div>
    </div>
    `
        : ""
    }

    <div class="section">
      <h2>Assets Included</h2>
      ${maintenanceAssetsTableHtml(assets)}
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

export function notifyMaintenance({ toEmployee, subject, html, extraTo = [] }) {
  if (!isEnabled()) return;

  const admin = process.env.ADMIN_EMAIL;
  const hr = process.env.HR_EMAIL;
  const extra = parseList(process.env.MAINTENANCE_NOTIFY_LIST);

  const to = [
    ...(toEmployee ? [toEmployee] : []),
    ...(admin ? [admin] : []),
    ...(hr ? [hr] : []),
    ...extra,
    ...extraTo,
  ].filter(Boolean);

  sendMailSafe({ to, subject, html });
}
