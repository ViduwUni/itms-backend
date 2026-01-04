import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";
import employeesRoutes from "./routes/employees.route.js";
import assetsRoutes from "./routes/assets.routes.js";
import assignmentsRoutes from "./routes/assignments.routes.js";
import softwareRoutes from "./routes/software.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import internetRoutes from "./routes/internet.routes.js";
import repairsRoutes from "./routes/repairs.routes.js";
import maintenanceRoutes from "./routes/maintenance.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import billingRemindersRoutes from "./routes/billingReminders.routes.js";
import fingerprintRoutes from "./routes/fingerprint.routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN }));
  app.use(express.json({ limit: "50kb" }));
  app.use(morgan("dev"));

  // app.use((req, res, next) => {
  //   const delay = 600 + Math.random() * 1200; // 600–1800ms
  //   setTimeout(next, delay);
  // });

  // app.use((req, res, next) => {
  //   res.set("Cache-Control", "no-store");
  //   next();
  // });

  app.get("/health", (req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/employees", employeesRoutes);
  app.use("/api/assets", assetsRoutes);
  app.use("/api/assignments", assignmentsRoutes);
  app.use("/api/software", softwareRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/internet", internetRoutes);
  app.use("/api/repairs", repairsRoutes);
  app.use("/api/maintenance", maintenanceRoutes);
  app.use("/api/billing-reminders", billingRemindersRoutes);
  app.use("/api/fingerprint", fingerprintRoutes);

  app.use((err, req, res, next) => {
    const status = err?.name === "ZodError" ? 400 : err.status || 500;
    const message =
      err?.name === "ZodError"
        ? err.issues?.[0]?.message || "Invalid input"
        : err.message || "Server error";
    res.status(status).json({ message });
  });

  return app;
}
