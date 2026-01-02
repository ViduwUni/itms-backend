import mongoose from "mongoose";

const MaintenanceLogSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MaintenanceJob",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["created", "updated", "status_change", "note"],
      required: true,
      index: true,
    },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    note: { type: String, trim: true, default: "" },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

export const MaintenanceLog = mongoose.model(
  "MaintenanceLog",
  MaintenanceLogSchema
);
