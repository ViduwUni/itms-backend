import { z } from "zod";
import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import bcrypt from "bcryptjs";

export const listUsers = asyncHandler(async (req, res) => {
  const users = await User.find()
    .select("username email role createdAt")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ users: users.map((u) => ({ ...u, id: u._id.toString() })) });
});

const updateSchema = z.object({
  username: z.string().min(2).max(50).optional(),
  email: z.string().email().max(255).optional(),
  role: z.enum(["user", "admin"]).optional(),
});

const passwordSchema = z.object({
  password: z.string().min(6).max(100),
});

export const changeUserPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { password } = passwordSchema.parse(req.body);

  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: "User not found." });

  user.passwordHash = await bcrypt.hash(password, 12);
  await user.save();

  res.json({ ok: true });
});

export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = updateSchema.parse(req.body);

  // Safety: prevent admin from accidentally demoting themself (optional)
  if (req.user.sub === id && body.role && body.role !== req.user.role) {
    return res
      .status(400)
      .json({ message: "You cannot change your own role." });
  }

  // If email is changing, enforce uniqueness
  if (body.email) {
    const exists = await User.findOne({
      email: body.email,
      _id: { $ne: id },
    }).lean();
    if (exists)
      return res.status(409).json({ message: "Email already in use" });
  }

  const user = await User.findByIdAndUpdate(id, body, {
    new: true,
    runValidators: true,
  });

  if (!user) return res.status(404).json({ message: "User not found" });

  res.json({ user: user.toSafeJSON() });
});

export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Safety: prevent self-delete (optional)
  if (req.user.sub === id) {
    return res
      .status(400)
      .json({ message: "You cannot delete your own account." });
  }

  const user = await User.findByIdAndDelete(id);
  if (!user) return res.status(404).json({ message: "User not found" });

  res.json({ ok: true });
});
