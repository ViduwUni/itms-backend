import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getBillingReminderConfig,
  updateBillingReminderConfig,
  billingReminderStatus,
  testBillingReminder,
} from "../controllers/billingReminders.controller.js";

const router = Router();

router.get("/", requireAuth, requireRole("admin"), getBillingReminderConfig);
router.patch(
  "/",
  requireAuth,
  requireRole("admin"),
  updateBillingReminderConfig
);
router.get("/status", requireAuth, requireRole("admin"), billingReminderStatus);
router.post("/test", requireAuth, requireRole("admin"), testBillingReminder);

export default router;
