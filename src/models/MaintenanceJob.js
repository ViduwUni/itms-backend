import mongoose from "mongoose";

const MaintenanceJobSchema = new mongoose.Schema(
  {
    jobNo: { type: String, required: true, unique: true, index: true },

    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    assetIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Asset",
        required: true,
        index: true,
      },
    ],

    department: { type: String, required: true, trim: true, index: true },

    purpose: { type: String, trim: true, default: "" },
    remarks: { type: String, trim: true, default: "" },

    status: {
      type: String,
      enum: ["open", "in_progress", "completed"],
      default: "open",
      required: true,
      index: true,
    },

    scheduledAt: { type: Date, default: null },

    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    completedAt: { type: Date, default: null },
    completedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

MaintenanceJobSchema.index({ status: 1, createdAt: -1 });
MaintenanceJobSchema.index({ employeeId: 1, createdAt: -1 });
MaintenanceJobSchema.index({ department: 1, createdAt: -1 });
MaintenanceJobSchema.index({ assetIds: 1, createdAt: -1 });

MaintenanceJobSchema.index({
  jobNo: "text",
  purpose: "text",
  remarks: "text",
});

export const MaintenanceJob = mongoose.model(
  "MaintenanceJob",
  MaintenanceJobSchema
);
