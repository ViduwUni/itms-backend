import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  exportEmployeesXlsx,
} from "../controllers/employees.controller.js";

const router = Router();

router.get("/", requireAuth, requireRole("admin"), listEmployees);
router.get(
  "/export.xlsx",
  requireAuth,
  requireRole("admin"),
  exportEmployeesXlsx
);
router.post("/", requireAuth, requireRole("admin"), createEmployee);
router.patch("/:id", requireAuth, requireRole("admin"), updateEmployee);
router.delete("/:id", requireAuth, requireRole("admin"), deleteEmployee);

export default router;
