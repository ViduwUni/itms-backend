import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";

import {
  listFingerprintSystems,
  createFingerprintSystem,
  updateFingerprintSystem,
  deleteFingerprintSystem,
} from "../controllers/fingerprintSystems.controller.js";

import {
  listFingerprintRequests,
  createFingerprintRequest,
  approveFingerprintRequest,
  cancelFingerprintRequest,
  downloadFingerprintRequestPdf,
} from "../controllers/fingerprintRequests.controller.js";

const router = Router();

// Systems
router.get(
  "/systems",
  requireAuth,
  requireRole("admin"),
  listFingerprintSystems
);
router.post(
  "/systems",
  requireAuth,
  requireRole("admin"),
  createFingerprintSystem
);
router.patch(
  "/systems/:id",
  requireAuth,
  requireRole("admin"),
  updateFingerprintSystem
);
router.delete(
  "/systems/:id",
  requireAuth,
  requireRole("admin"),
  deleteFingerprintSystem
);

// Requests
router.get(
  "/requests",
  requireAuth,
  requireRole("admin"),
  listFingerprintRequests
);
router.post(
  "/requests",
  requireAuth,
  requireRole("admin"),
  createFingerprintRequest
);
router.post(
  "/requests/:id/approve",
  requireAuth,
  requireRole("admin"),
  approveFingerprintRequest
);
router.post(
  "/requests/:id/cancel",
  requireAuth,
  requireRole("admin"),
  cancelFingerprintRequest
);
router.get(
  "/requests/:id/pdf",
  requireAuth,
  requireRole("admin"),
  downloadFingerprintRequestPdf
);

export default router;
