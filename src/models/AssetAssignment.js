import mongoose from "mongoose";

const assetAssignmentSchema = new mongoose.Schema(
  {
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asset",
      required: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },

    type: { type: String, enum: ["temporary", "permanent"], required: true },
    status: {
      type: String,
      enum: ["active", "returned"],
      default: "active",
      index: true,
    },

    assignedAt: { type: Date, default: Date.now, index: true },
    expectedReturnAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },

    remarks: { type: String, trim: true, default: "" },

    assignedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    returnedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

assetAssignmentSchema.index(
  { assetId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);

export const AssetAssignment = mongoose.model(
  "AssetAssignment",
  assetAssignmentSchema
);
