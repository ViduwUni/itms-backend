import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, minlength: 2 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true,
    },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id.toString(),
    username: this.username,
    email: this.email,
    role: this.role,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model("User", userSchema);
