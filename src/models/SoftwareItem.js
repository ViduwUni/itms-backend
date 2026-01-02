import mongoose from "mongoose";

const softwareItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["domain", "saas", "license"],
      required: true,
      index: true,
    },

    // Common
    name: { type: String, required: true, trim: true },
    vendor: { type: String, trim: true, default: "" },
    department: { type: String, trim: true, default: "" },

    cost: { type: Number, default: null },
    currency: { type: String, trim: true, default: "USD" },

    autoRenew: { type: Boolean, default: false },
    startDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    renewalDate: { type: Date, default: null },

    remarks: { type: String, trim: true, default: "" },

    // Domain specific
    domainName: { type: String, trim: true, default: "" },
    registrar: { type: String, trim: true, default: "" },

    // SaaS / License capacity
    quantityTotal: { type: Number, default: null },

    // License specific
    licenseType: {
      type: String,
      enum: ["per_user", "per_device", "on_prem", ""],
      default: "",
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly", ""],
      default: "",
    },
  },
  { timestamps: true }
);

softwareItemSchema.index({
  name: "text",
  vendor: "text",
  domainName: "text",
  registrar: "text",
  remarks: "text",
});

softwareItemSchema.index({ expiryDate: 1 });
softwareItemSchema.index({ department: 1, type: 1 });

export const SoftwareItem = mongoose.model("SoftwareItem", softwareItemSchema);
