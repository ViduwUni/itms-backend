import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listUsers,
  updateUser,
  deleteUser,
  changeUserPassword,
} from "../controllers/users.controller.js";

const router = Router();

router.get("/", requireAuth, requireRole("admin"), listUsers);
router.patch("/:id", requireAuth, requireRole("admin"), updateUser);
router.patch(
  "/:id/password",
  requireAuth,
  requireRole("admin"),
  changeUserPassword
);
router.delete("/:id", requireAuth, requireRole("admin"), deleteUser);

export default router;
