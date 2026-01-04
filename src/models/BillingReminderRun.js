import mongoose from "mongoose";

const BillingReminderRunSchema = new mongoose.Schema(
  {
    reminderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingReminder",
      required: true,
    },
    periodKey: { type: String, required: true },
    dueAt: { type: Date, required: true },

    status: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
    },
    sentAt: { type: Date, default: null },

    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
  },
  { timestamps: true }
);

BillingReminderRunSchema.index(
  { reminderId: 1, periodKey: 1 },
  { unique: true }
);

export const BillingReminderRun = mongoose.model(
  "BillingReminderRun",
  BillingReminderRunSchema
);
