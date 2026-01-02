import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  assignAsset,
  returnAssignment,
  listAssignments,
} from "../controllers/assignments.controller.js";

const router = Router();

router.get("/", requireAuth, requireRole("admin"), listAssignments);
router.post("/", requireAuth, requireRole("admin"), assignAsset);
router.post("/:id/return", requireAuth, requireRole("admin"), returnAssignment);

export default router;
