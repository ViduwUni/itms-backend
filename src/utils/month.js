export function monthToDate(ym) {
  // ym = "YYYY-MM"
  return new Date(`${ym}-01T00:00:00.000Z`);
}

export function ymNowUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
