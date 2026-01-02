import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listSoftware,
  createSoftware,
  updateSoftware,
  deleteSoftware,
  renewSoftware,
  exportSoftwareXlsx,
  listRenewals,
} from "../controllers/software.controller.js";

import {
  listSoftwareAssignments,
  assignSoftware,
  revokeSoftwareAssignment,
} from "../controllers/softwareAssignments.controller.js";

const router = Router();

router.get("/", requireAuth, requireRole("admin"), listSoftware);
router.get(
  "/export.xlsx",
  requireAuth,
  requireRole("admin"),
  exportSoftwareXlsx
);

router.post("/", requireAuth, requireRole("admin"), createSoftware);
router.get("/:id/renewals", requireAuth, requireRole("admin"), listRenewals);
router.patch("/:id", requireAuth, requireRole("admin"), updateSoftware);
router.delete("/:id", requireAuth, requireRole("admin"), deleteSoftware);

router.post("/:id/renew", requireAuth, requireRole("admin"), renewSoftware);

router.get(
  "/:id/assignments",
  requireAuth,
  requireRole("admin"),
  listSoftwareAssignments
);
router.post("/:id/assign", requireAuth, requireRole("admin"), assignSoftware);
router.post(
  "/assignments/:assignmentId/revoke",
  requireAuth,
  requireRole("admin"),
  revokeSoftwareAssignment
);

export default router;
