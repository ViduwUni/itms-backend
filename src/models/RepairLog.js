import mongoose from "mongoose";

const RepairLogSchema = new mongoose.Schema(
  {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RepairTicket",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: [
        "created",
        "updated",
        "status_change",
        "assignment_change",
        "note",
        "cost_update",
      ],
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

export const RepairLog = mongoose.model("RepairLog", RepairLogSchema);
