import mongoose from "mongoose";

const internetConnectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    provider: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },

    accountNumber: { type: String, trim: true, default: "" },
    routerModel: { type: String, trim: true, default: "" },
    serialNumber: { type: String, trim: true, default: "" },
    ipAddress: { type: String, trim: true, default: "" },

    status: { type: String, enum: ["active", "inactive"], default: "active" },

    remarks: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

internetConnectionSchema.index({
  name: "text",
  provider: "text",
  location: "text",
});

internetConnectionSchema.index({ status: 1 });

export const InternetConnection = mongoose.model(
  "InternetConnection",
  internetConnectionSchema
);
