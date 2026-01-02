export default function assignmentEmailHtml({ employee, asset, assignment }) {
  const exp = assignment.expectedReturnAt
    ? new Date(assignment.expectedReturnAt).toISOString().slice(0, 10)
    : "Not specified";

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
      <h1>Asset Assignment Notification</h1>
      <p>IT Management System</p>
      <p>Date: ${today}</p>
    </div>

    <div class="section">
      <p>
        Dear <strong>${employee.name}</strong>,<br /><br />
        This email confirms that the following asset has been assigned to you.
      </p>
    </div>

    <div class="section">
      <h2>Assignment Details</h2>
      <table>
        <tr>
          <td class="label">Assignment ID</td>
          <td>ASS-${
            assignment.id?.slice(-8) || Date.now().toString().slice(-8)
          }</td>
        </tr>
        <tr>
          <td class="label">Assignment Type</td>
          <td>${assignment.type}</td>
        </tr>
        <tr>
          <td class="label">Assigned To</td>
          <td>${employee.name} (${employee.email || employee.department})</td>
        </tr>
        <tr>
          <td class="label">Department</td>
          <td>${asset.department}</td>
        </tr>
        <tr>
          <td class="label">Expected Return</td>
          <td>${exp}</td>
        </tr>
      </table>
    </div>

    <div class="section">
      <h2>Asset Information</h2>
      <table>
        <tr>
          <td class="label">Asset Tag</td>
          <td>${asset.assetTag}</td>
        </tr>
        <tr>
          <td class="label">Asset Name</td>
          <td>${asset.name}</td>
        </tr>
        <tr>
          <td class="label">Category</td>
          <td>${asset.category}</td>
        </tr>
        <tr>
          <td class="label">Brand / Model</td>
          <td>${asset.brand || "—"} ${
    asset.model ? `/ ${asset.model}` : ""
  }</td>
        </tr>
        <tr>
          <td class="label">Serial Number</td>
          <td>${asset.serialNumber || "Not recorded"}</td>
        </tr>
      </table>
    </div>

    ${
      assignment.remarks
        ? `
    <div class="section">
      <h2>Additional Notes</h2>
      <div class="remarks">${assignment.remarks}</div>
    </div>
    `
        : ""
    }

    <div class="footer">
      <p>This is an automated system email. Please do not reply.</p>
      <p>Contact the IT Department for assistance.</p>
      <p>© ${new Date().getFullYear()} IT Management System</p>
    </div>

  </div>
</body>
</html>`;
}
