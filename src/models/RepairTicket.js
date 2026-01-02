import mongoose from "mongoose";

const RepairTicketSchema = new mongoose.Schema(
  {
    ticketNo: { type: String, required: true, unique: true, index: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },

    type: {
      type: String,
      enum: ["hardware", "software", "network", "other"],
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "open",
        "in_progress",
        "waiting_parts",
        "waiting_vendor",
        "resolved",
        "closed",
        "cancelled",
      ],
      required: true,
      default: "open",
      index: true,
    },

    // always required
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asset",
      required: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },

    department: { type: String, required: true, trim: true, index: true },

    reportedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    assignedToUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    warranty: { type: Boolean, default: false },
    vendorName: { type: String, trim: true, default: "" },
    vendorContact: { type: String, trim: true, default: "" },
    costLKR: { type: Number, default: null },

    startedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },

    remarks: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

// Performance indexes
RepairTicketSchema.index({ status: 1, priority: 1, createdAt: -1 });
RepairTicketSchema.index({ type: 1, createdAt: -1 });
RepairTicketSchema.index({ department: 1, createdAt: -1 });

RepairTicketSchema.index({
  ticketNo: "text",
  title: "text",
  description: "text",
  vendorName: "text",
});

export const RepairTicket = mongoose.model("RepairTicket", RepairTicketSchema);
