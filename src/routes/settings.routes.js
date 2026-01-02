import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getNotificationSettings,
  updateNotificationSettings,
} from "../controllers/settings.controller.js";

const router = Router();

router.get(
  "/notifications",
  requireAuth,
  requireRole("admin"),
  getNotificationSettings
);
router.patch(
  "/notifications",
  requireAuth,
  requireRole("admin"),
  updateNotificationSettings
);

export default router;
