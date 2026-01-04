import mongoose from "mongoose";
import { BillingReminder } from "../models/BillingReminder.js";
import { BillingReminderRun } from "../models/BillingReminderRun.js";
import { sendMailSafe } from "./graphMail.js";

function monthKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseHHmm(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ""));
  if (!m) return { h: 9, min: 30 };
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return { h, min };
}

function computeDueAt(now, config) {
  // NOTE: This uses server time. If your server is not in Asia/Colombo,
  // set TZ=Asia/Colombo in environment when running node (recommended).
  const { h, min } = parseHHmm(config.schedule?.timeHHmm || "09:30");
  const dayMode = config.schedule?.dayMode || "lastDay";
  const dayOfMonth = config.schedule?.dayOfMonth || 28;

  const y = now.getFullYear();
  const mo = now.getMonth();

  let day;
  if (dayMode === "lastDay") {
    // last day: day 0 of next month
    day = new Date(y, mo + 1, 0).getDate();
  } else {
    // custom day; clamp to month's max day
    const maxDay = new Date(y, mo + 1, 0).getDate();
    day = Math.max(1, Math.min(maxDay, dayOfMonth));
  }

  const due = new Date(y, mo, day, h, min, 0, 0);
  return due;
}

function dedupeEmails(list) {
  const cleaned = (list || [])
    .map((s) =>
      String(s || "")
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

function reminderEmailHtml({ config, periodKeyStr, dueAt }) {
  const cats = config.categories?.length ? config.categories : [];

  const listRows = cats
    .map(
      (c) => `
        <tr>
          <td class="label">${c.label}</td>
          <td>Collect and record invoices / receipts</td>
        </tr>
      `
    )
    .join("");

  const scheduled = new Date(dueAt)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");

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
      <h1>${config.title || "Monthly Bills Reminder"}</h1>
      <p>IT Management System</p>
      <p>Date: ${today}</p>
    </div>

    <div class="section">
      <p>
        This is a reminder to prepare and submit the monthly billing documents
        for the period stated below.
      </p>
    </div>

    <div class="section">
      <h2>Reminder Details</h2>
      <table>
        <tr>
          <td class="label">Billing Period</td>
          <td>${periodKeyStr}</td>
        </tr>
        <tr>
          <td class="label">Scheduled Date</td>
          <td>${scheduled}</td>
        </tr>
      </table>
    </div>

    <div class="section">
      <h2>Required Documents</h2>
      <table>
        ${
          listRows ||
          `
          <tr>
            <td colspan="2">No categories configured</td>
          </tr>
        `
        }
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

async function ensureDefaultConfig() {
  const existing = await BillingReminder.findOne().lean();
  if (existing) return existing;
  const created = await BillingReminder.create({});
  return created.toObject();
}

async function getOrCreateRun(reminderId, periodKeyStr, dueAt) {
  try {
    const run = await BillingReminderRun.findOneAndUpdate(
      { reminderId, periodKey: periodKeyStr },
      {
        $setOnInsert: { dueAt, status: "pending", attempts: 0, lastError: "" },
      },
      { new: true, upsert: true }
    );
    return run;
  } catch (e) {
    // In rare race conditions, just read after duplicate key
    const run = await BillingReminderRun.findOne({
      reminderId,
      periodKey: periodKeyStr,
    });
    return run;
  }
}

async function sendIfDue() {
  const now = new Date();
  const config = await ensureDefaultConfig();

  if (!config.enabled) return;

  const dueAt = computeDueAt(now, config);
  const periodKeyStr = monthKey(now);

  const run = await getOrCreateRun(config._id, periodKeyStr, dueAt);
  if (!run) return;

  // already sent => stop
  if (run.status === "sent") return;

  // not due yet => stop
  if (new Date(run.dueAt).getTime() > now.getTime()) return;

  // Build recipients: ADMIN + extra
  const admin = String(process.env.ADMIN_EMAIL || "").trim();
  const extras = config.extraEmails || [];
  const to = dedupeEmails([admin, ...extras]);

  if (!admin) {
    await BillingReminderRun.updateOne(
      { _id: run._id },
      {
        $set: {
          status: "failed",
          lastError: "ADMIN_EMAIL is not set",
        },
        $inc: { attempts: 1 },
      }
    );
    return;
  }

  const subject = `Monthly Bills Reminder (${periodKeyStr})`;
  const html = reminderEmailHtml({ config, periodKeyStr, dueAt: run.dueAt });

  try {
    await BillingReminderRun.updateOne(
      { _id: run._id },
      { $inc: { attempts: 1 }, $set: { lastError: "" } }
    );

    await sendMailSafe({ to, subject, html });

    await BillingReminderRun.updateOne(
      { _id: run._id },
      { $set: { status: "sent", sentAt: new Date(), lastError: "" } }
    );
  } catch (e) {
    await BillingReminderRun.updateOne(
      { _id: run._id },
      {
        $set: {
          status: "failed",
          lastError: String(e?.message || e),
        },
      }
    );
  }
}

let _timer = null;
const ts = () => new Date().toISOString();

export function startBillingReminderScheduler() {
  console.log(`[${ts()}] [BillingScheduler] Started (interval: 5 minutes)`);

  // Run once at startup (catch-up)
  sendIfDue().catch((err) => {
    console.error(`[${ts()}] [BillingScheduler] Initial run failed:`, err);
  });

  // Prevent duplicate timers
  if (_timer) clearInterval(_timer);

  _timer = setInterval(() => {
    console.log(`[${ts()}] [BillingScheduler] Check triggered`);
    sendIfDue().catch((err) => {
      console.error(`[${ts()}] [BillingScheduler] Scheduled run failed:`, err);
    });
  }, 5 * 60 * 1000);
}

export async function getBillingReminderStatus() {
  const now = new Date();
  const config = await ensureDefaultConfig();
  const periodKeyStr = monthKey(now);

  const dueAt = computeDueAt(now, config);
  const run = await BillingReminderRun.findOne({
    reminderId: config._id,
    periodKey: periodKeyStr,
  }).lean();

  const status = run?.status || "pending";
  const sentAt = run?.sentAt || null;
  const overdue =
    config.enabled && status !== "sent" && dueAt.getTime() <= now.getTime();

  return {
    enabled: !!config.enabled,
    periodKey: periodKeyStr,
    dueAt,
    status,
    sentAt,
    attempts: run?.attempts || 0,
    lastError: run?.lastError || "",
    extraEmails: config.extraEmails || [],
    title: config.title || "Monthly Bills Reminder",
  };
}

export async function sendTestBillingReminderEmail() {
  const now = new Date();
  const config = await ensureDefaultConfig();
  const periodKeyStr = monthKey(now);

  const admin = String(process.env.ADMIN_EMAIL || "").trim();
  const to = dedupeEmails([admin, ...(config.extraEmails || [])]);
  if (!admin) throw new Error("ADMIN_EMAIL is not set");

  const subject = `TEST: Monthly Bills Reminder (${periodKeyStr})`;
  const html = reminderEmailHtml({ config, periodKeyStr, dueAt: now });

  await sendMailSafe({ to, subject, html });
}
