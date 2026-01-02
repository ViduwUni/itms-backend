import mongoose from "mongoose";

const notificationSettingsSchema = new mongoose.Schema(
  {
    softwareExpiryEmails: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const NotificationSettings = mongoose.model(
  "NotificationSettings",
  notificationSettingsSchema
);
