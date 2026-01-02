import mongoose from "mongoose";

const assetSchema = new mongoose.Schema(
  {
    assetTag: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, index: true },

    category: { type: String, required: true, trim: true, index: true },
    brand: { type: String, trim: true, default: "" },
    model: { type: String, trim: true, default: "" },

    serialNumber: { type: String, trim: true, default: "", index: true },

    purchaseDate: { type: Date, default: null },
    warrantyExpiry: { type: Date, default: null },

    department: { type: String, required: true, trim: true, index: true },
    remarks: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

// Text search (fast for 100+ and still fine for 10k)
assetSchema.index({
  assetTag: "text",
  name: "text",
  category: "text",
  brand: "text",
  model: "text",
  serialNumber: "text",
  department: "text",
  remarks: "text",
});

export const Asset = mongoose.model("Asset", assetSchema);
