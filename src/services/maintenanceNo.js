import { Counter } from "../models/Counter.js";

export async function nextMaintenanceJobNo() {
  const year = new Date().getUTCFullYear();
  const key = `maintenance:${year}`;

  const c = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );

  const seq = String(c.seq).padStart(6, "0");
  return `M-${year}-${seq}`;
}
