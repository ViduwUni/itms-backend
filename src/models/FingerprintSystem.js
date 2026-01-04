import mongoose from "mongoose";

const FingerprintSystemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, trim: true, default: "" },
    vendor: { type: String, trim: true, default: "" },
    model: { type: String, trim: true, default: "" },
    deviceId: { type: String, trim: true, default: "" }, // serial/device id
    department: { type: String, trim: true, default: "" },

    enabled: { type: Boolean, default: true },
    remarks: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

FingerprintSystemSchema.index({ name: 1 });
FingerprintSystemSchema.index({ enabled: 1 });

export const FingerprintSystem = mongoose.model(
  "FingerprintSystem",
  FingerprintSystemSchema
);
