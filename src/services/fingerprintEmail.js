function fmt(d) {
  if (!d) return "—";
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? "—" : x.toISOString().slice(0, 10);
}

export function fingerprintApprovedEmailHtml({
  person,
  system,
  reqDoc,
  approver,
}) {
  return `
  <div style="font-family: Arial, sans-serif; line-height: 1.5">
    <h2>Fingerprint Access Approved</h2>

    <p>The following fingerprint system access request has been approved:</p>

    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;">
      <tr><td><b>Status</b></td><td>${String(
        reqDoc.status
      ).toUpperCase()}</td></tr>
      <tr><td><b>Request ID</b></td><td>${reqDoc._id}</td></tr>
      <tr><td><b>Approved By</b></td><td>${approver || "—"}</td></tr>
      <tr><td><b>Approved At</b></td><td>${fmt(reqDoc.approvedAt)}</td></tr>

      <tr><td colspan="2"><b>Person</b></td></tr>
      <tr><td><b>Name</b></td><td>${person.name || "—"}</td></tr>
      <tr><td><b>Email</b></td><td>${person.email || "—"}</td></tr>
      <tr><td><b>Department</b></td><td>${person.department || "—"}</td></tr>

      <tr><td colspan="2"><b>Fingerprint System</b></td></tr>
      <tr><td><b>Name</b></td><td>${system.name || "—"}</td></tr>
      <tr><td><b>Location</b></td><td>${system.location || "—"}</td></tr>
      <tr><td><b>Device ID</b></td><td>${system.deviceId || "—"}</td></tr>

      <tr><td colspan="2"><b>Access</b></td></tr>
      <tr><td><b>Type</b></td><td>${reqDoc.accessType}</td></tr>
      <tr><td><b>Valid From</b></td><td>${fmt(reqDoc.validFrom)}</td></tr>
      <tr><td><b>Valid To</b></td><td>${
        reqDoc.accessType === "temporary" ? fmt(reqDoc.validTo) : "—"
      }</td></tr>
      <tr><td><b>Remarks</b></td><td>${reqDoc.remarks || "—"}</td></tr>
    </table>

    <p style="margin-top: 12px;">Thanks,<br/>IT Team</p>
  </div>`;
}
