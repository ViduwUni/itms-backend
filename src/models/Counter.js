import mongoose from "mongoose";

const CounterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

export const Counter = mongoose.model("Counter", CounterSchema);
