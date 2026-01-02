import mongoose from "mongoose";

const softwareRenewalSchema = new mongoose.Schema(
  {
    softwareId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SoftwareItem",
      required: true,
      index: true,
    },

    renewedAt: { type: Date, default: Date.now, index: true },

    oldExpiryDate: { type: Date, default: null },
    newExpiryDate: { type: Date, default: null },

    cost: { type: Number, default: null },
    currency: { type: String, trim: true, default: "USD" },

    renewedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    remarks: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

softwareRenewalSchema.index({ softwareId: 1, renewedAt: -1 });

export const SoftwareRenewal = mongoose.model(
  "SoftwareRenewal",
  softwareRenewalSchema
);
