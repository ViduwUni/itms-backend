import { Router } from "express";
import {
  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  exportConnectionsXlsx,
} from "../controllers/internetConnections.controller.js";

import {
  listPackages,
  createPackage,
  updatePackage,
  deletePackage,
  exportPackagesXlsx,
} from "../controllers/internetPackages.controller.js";

import {
  listUsage,
  generateMonth,
  updateUsage,
  exportUsageXlsx,
} from "../controllers/internetUsage.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

import { usageSummary } from "../controllers/internetUsageSummary.controller.js";

const router = Router();

// Connections
router.get("/connections", requireAuth, requireRole("admin"), listConnections);
router.post(
  "/connections",
  requireAuth,
  requireRole("admin"),
  createConnection
);
router.patch(
  "/connections/:id",
  requireAuth,
  requireRole("admin"),
  updateConnection
);
router.delete(
  "/connections/:id",
  requireAuth,
  requireRole("admin"),
  deleteConnection
);
router.get(
  "/connections/export.xlsx",
  requireAuth,
  requireRole("admin"),
  exportConnectionsXlsx
);

// Packages
router.get("/packages", requireAuth, requireRole("admin"), listPackages);
router.post("/packages", requireAuth, requireRole("admin"), createPackage);
router.patch("/packages/:id", requireAuth, requireRole("admin"), updatePackage);
router.delete(
  "/packages/:id",
  requireAuth,
  requireRole("admin"),
  deletePackage
);
router.get(
  "/packages/export.xlsx",
  requireAuth,
  requireRole("admin"),
  exportPackagesXlsx
);

// Usage
router.get("/usage", requireAuth, requireRole("admin"), listUsage);
router.post(
  "/usage/generate-month",
  requireAuth,
  requireRole("admin"),
  generateMonth
);
router.patch("/usage/:id", requireAuth, requireRole("admin"), updateUsage);
router.get(
  "/usage/export.xlsx",
  requireAuth,
  requireRole("admin"),
  exportUsageXlsx
);

// Summary
router.get("/usage/summary", requireAuth, requireRole("admin"), usageSummary);

export default router;
