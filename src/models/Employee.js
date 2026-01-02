import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    department: { type: String, required: true, trim: true, index: true },
  },
  { timestamps: true }
);

employeeSchema.index({ name: 1 });
employeeSchema.index({ department: 1, createdAt: -1 });
employeeSchema.index({ name: "text", email: "text", department: "text" });

export const Employee = mongoose.model("Employee", employeeSchema);
