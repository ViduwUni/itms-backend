import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  exportAssetsXlsx,
} from "../controllers/assets.controller.js";

const router = Router();

router.get("/", requireAuth, requireRole("admin"), listAssets);
router.get("/export.xlsx", requireAuth, requireRole("admin"), exportAssetsXlsx);
router.post("/", requireAuth, requireRole("admin"), createAsset);
router.patch("/:id", requireAuth, requireRole("admin"), updateAsset);
router.delete("/:id", requireAuth, requireRole("admin"), deleteAsset);

export default router;
