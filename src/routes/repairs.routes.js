import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  createRepair,
  listRepairs,
  getRepair,
  updateRepair,
  changeRepairStatus,
  assignRepair,
  addRepairNote,
  deleteRepair,
  exportRepairsXlsx,
} from "../controllers/repairs.controller.js";

const router = express.Router();

router.get("/", requireAuth, listRepairs);
router.get("/export.xlsx", requireAuth, exportRepairsXlsx);

router.post("/", requireAuth, createRepair);
router.get("/:id", requireAuth, getRepair);
router.patch("/:id", requireAuth, updateRepair);

router.patch("/:id/status", requireAuth, changeRepairStatus);
router.patch("/:id/assign", requireAuth, requireRole("admin"), assignRepair);

router.post("/:id/note", requireAuth, addRepairNote);
router.delete("/:id", requireAuth, requireRole("admin"), deleteRepair);

export default router;
