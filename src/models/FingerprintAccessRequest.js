import mongoose from "mongoose";

const TempPersonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: "" },
    department: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const FingerprintAccessRequestSchema = new mongoose.Schema(
  {
    personType: {
      type: String,
      enum: ["employee", "temporary"],
      required: true,
    },

    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },

    tempPerson: { type: TempPersonSchema, default: null },

    systemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FingerprintSystem",
      required: true,
    },

    accessType: {
      type: String,
      enum: ["permanent", "temporary"],
      required: true,
    },
    validFrom: { type: Date, default: () => new Date() },
    validTo: { type: Date, default: null }, // required if temporary

    remarks: { type: String, trim: true, default: "" },

    status: {
      type: String,
      enum: ["open", "approved", "cancelled"],
      default: "open",
    },

    createdByUserId: { type: String, required: true }, // from JWT (sub)
    approvedByUserId: { type: String, default: "" },
    approvedAt: { type: Date, default: null },

    cancelledByUserId: { type: String, default: "" },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

// Fast filtering
FingerprintAccessRequestSchema.index({ status: 1, createdAt: -1 });
FingerprintAccessRequestSchema.index({ systemId: 1, status: 1 });
FingerprintAccessRequestSchema.index({ employeeId: 1, status: 1 });
FingerprintAccessRequestSchema.index({ "tempPerson.email": 1, status: 1 });

// Rule A: no duplicate approved access for same employee+system
FingerprintAccessRequestSchema.index(
  { employeeId: 1, systemId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "approved",
      employeeId: { $type: "objectId" },
    },
  }
);

// Rule A: for temporary person WITH email, no duplicate approved by email+system
FingerprintAccessRequestSchema.index(
  { "tempPerson.email": 1, systemId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "approved",
      "tempPerson.email": { $type: "string" },
    },
  }
);

export const FingerprintAccessRequest = mongoose.model(
  "FingerprintAccessRequest",
  FingerprintAccessRequestSchema
);
