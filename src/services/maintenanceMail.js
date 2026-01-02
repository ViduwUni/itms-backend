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

function assetsTableHtml(assets) {
  const rows = (assets || [])
    .map(
      (a) => `
      <tr>
        <td>${a.assetTag || "—"}</td>
        <td>${a.name || "—"}</td>
        <td>${a.category || "—"}</td>
        <td>${a.department || "—"}</td>
        <td>${a.serialNumber || "—"}</td>
      </tr>`
    )
    .join("");

  return `
  <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse; width:100%;">
    <thead>
      <tr>
        <th align="left">Asset Tag</th>
        <th align="left">Name</th>
        <th align="left">Category</th>
        <th align="left">Department</th>
        <th align="left">Serial</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function maintenanceEmailHtml({ kind, job, employee, assets }) {
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
      ? "Please hand over the asset(s) to the IT Department for maintenance/cleanup."
      : kind === "completed"
      ? "Maintenance is completed. Please collect your asset(s) from the IT Department."
      : "Maintenance job updated.";

  return `
  <div style="font-family: Arial, sans-serif; line-height: 1.5">
    <h2>${headline}</h2>
    <p><b>Job:</b> ${job.jobNo}</p>
    <p><b>Employee:</b> ${employee.name} (${employee.email})</p>
    <p><b>Scheduled:</b> ${scheduled}</p>
    <p><b>Purpose:</b> ${job.purpose || "—"}</p>
    <p><b>Status:</b> ${job.status}</p>
    <p><b>Remarks:</b> ${job.remarks || "—"}</p>

    <h3>Assets</h3>
    ${assetsTableHtml(assets)}

    <p style="margin-top: 12px;">${message}</p>
    <p style="margin-top: 12px;">Thanks,<br/>IT Team</p>
  </div>`;
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
