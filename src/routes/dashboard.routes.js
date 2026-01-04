import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { getDashboardSummary } from "../controllers/dashboard.controller.js";

const router = express.Router();

router.get("/summary", requireAuth, getDashboardSummary);

export default router;
