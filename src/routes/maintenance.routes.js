import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listEmployeeAssets,
  createJob,
  listJobs,
  getJob,
  updateJob,
  changeJobStatus,
  addJobNote,
  deleteJob,
  exportJobsXlsx,
} from "../controllers/maintenance.controller.js";

const router = express.Router();

router.get("/employee-assets", requireAuth, listEmployeeAssets);

router.get("/jobs", requireAuth, listJobs);
router.get("/jobs/export.xlsx", requireAuth, exportJobsXlsx);

router.post("/jobs", requireAuth, createJob);
router.get("/jobs/:id", requireAuth, getJob);
router.patch("/jobs/:id", requireAuth, updateJob);
router.patch("/jobs/:id/status", requireAuth, changeJobStatus);
router.post("/jobs/:id/note", requireAuth, addJobNote);

router.delete("/jobs/:id", requireAuth, requireRole("admin"), deleteJob);

export default router;
