import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const BillingReminderSchema = new mongoose.Schema(
  {
    title: { type: String, default: "Monthly Bills Reminder", trim: true },
    enabled: { type: Boolean, default: true },

    schedule: {
      dayMode: {
        type: String,
        enum: ["lastDay", "customDay"],
        default: "lastDay",
      },
      dayOfMonth: { type: Number, default: 28 },
      timeHHmm: { type: String, default: "09:30" },
      timezone: { type: String, default: "Asia/Colombo" },
    },

    categories: {
      type: [CategorySchema],
      default: [
        { key: "internet", label: "Internet Bills" },
        { key: "printer", label: "Printer Invoices" },
      ],
    },

    extraEmails: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const BillingReminder = mongoose.model(
  "BillingReminder",
  BillingReminderSchema
);
