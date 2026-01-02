import mongoose from "mongoose";

const internetUsageMonthSchema = new mongoose.Schema(
  {
    connectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternetConnection",
      required: true,
      index: true,
    },

    month: { type: Date, required: true, index: true },

    startReadingGB: { type: Number, default: null },
    endReadingGB: { type: Number, default: null },

    usedGB: { type: Number, default: null }, // manual override

    recordedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    remarks: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

// One usage record per connection per month
internetUsageMonthSchema.index({ connectionId: 1, month: 1 }, { unique: true });

export const InternetUsageMonth = mongoose.model(
  "InternetUsageMonth",
  internetUsageMonthSchema
);
