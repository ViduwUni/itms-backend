import { asyncHandler } from "../utils/asyncHandler.js";
import { InternetUsageMonth } from "../models/InternetUsageMonth.js";
import { monthToDate, ymNowUTC } from "../utils/month.js";

function ymAddMonths(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export const usageSummary = asyncHandler(async (req, res) => {
  const monthStr = (req.query.month || ymNowUTC()).trim();
  const months = Math.min(
    24,
    Math.max(1, parseInt(req.query.months || "6", 10))
  );

  // build list of months: e.g. last 6 months ending at monthStr
  const monthList = [];
  for (let i = months - 1; i >= 0; i--)
    monthList.push(ymAddMonths(monthStr, -i));

  const monthDates = monthList.map(monthToDate);

  // Aggregation: compute computedUsed, then finalUsed, then group by month
  const rows = await InternetUsageMonth.aggregate([
    { $match: { month: { $in: monthDates } } },

    {
      $addFields: {
        computedUsedGB: {
          $cond: [
            {
              $and: [
                { $ne: ["$startReadingGB", null] },
                { $ne: ["$endReadingGB", null] },
                { $gte: ["$endReadingGB", "$startReadingGB"] },
              ],
            },
            { $subtract: ["$endReadingGB", "$startReadingGB"] },
            null,
          ],
        },
      },
    },
    {
      $addFields: {
        finalUsedGB: {
          $ifNull: ["$usedGB", { $ifNull: ["$computedUsedGB", 0] }],
        },
      },
    },

    {
      $group: {
        _id: "$month",
        totalUsedGB: { $sum: "$finalUsedGB" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const map = new Map(
    rows.map((r) => [new Date(r._id).toISOString().slice(0, 7), r.totalUsedGB])
  );

  const series = monthList.map((ym) => ({
    month: ym,
    totalUsedGB: Number(map.get(ym) || 0),
  }));

  // current month total
  const current = series[series.length - 1]?.totalUsedGB || 0;

  res.json({ month: monthStr, months, currentTotalUsedGB: current, series });
});
