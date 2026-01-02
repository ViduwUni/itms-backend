import mongoose from "mongoose";

const softwareAssignmentSchema = new mongoose.Schema(
  {
    softwareId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SoftwareItem",
      required: true,
      index: true,
    },

    targetType: {
      type: String,
      enum: ["employee", "asset", "department"],
      required: true,
      index: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    targetName: { type: String, trim: true, default: "" },

    seatCount: { type: Number, default: 1, min: 1 },

    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
      index: true,
    },
    assignedAt: { type: Date, default: Date.now, index: true },
    revokedAt: { type: Date, default: null },

    assignedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    revokedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    remarks: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

softwareAssignmentSchema.index({ softwareId: 1, status: 1 });

export const SoftwareAssignment = mongoose.model(
  "SoftwareAssignment",
  softwareAssignmentSchema
);
