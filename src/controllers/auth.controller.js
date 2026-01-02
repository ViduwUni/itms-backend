import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const registerSchema = z.object({
  username: z.string().min(2).max(50),
  email: z.string().email().max(255),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      email: user.email,
      username: user.username,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

export const register = asyncHandler(async (req, res) => {
  const body = registerSchema.parse(req.body);

  const exists = await User.findOne({ email: body.email }).lean();
  if (exists) return res.status(409).json({ message: "Email already in use" });

  const passwordHash = await bcrypt.hash(body.password, 12);

  const user = await User.create({
    username: body.username,
    email: body.email,
    passwordHash,
    role: "user", // forced default
  });

  const token = signToken(user);
  res.status(201).json({ token, user: user.toSafeJSON() });
});

export const login = asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);

  const user = await User.findOne({ email: body.email });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = signToken(user);
  res.json({ token, user: user.toSafeJSON() });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.sub);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user: user.toSafeJSON() });
});
