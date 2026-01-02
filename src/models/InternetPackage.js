import mongoose from "mongoose";

const internetPackageSchema = new mongoose.Schema(
  {
    connectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternetConnection",
      required: true,
      index: true,
    },

    // first day of month (YYYY-MM-01)
    month: { type: Date, required: true, index: true },

    packageName: { type: String, required: true, trim: true },
    dataLimitGB: { type: Number, default: null }, // null = unlimited

    cost: { type: Number, default: null },
    currency: { type: String, default: "LKR" },

    remarks: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

// One package per connection per month
internetPackageSchema.index({ connectionId: 1, month: 1 }, { unique: true });

export const InternetPackage = mongoose.model(
  "InternetPackage",
  internetPackageSchema
);
