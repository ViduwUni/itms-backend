import "dotenv/config";
import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { startBillingReminderScheduler } from "./services/billingReminderScheduler.js";

const app = createApp();
try {
  await connectDB(process.env.MONGO_URI);
  startBillingReminderScheduler();

  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
  });
} catch (err) {
  console.error("Startup failed:", err);
  process.exit(1);
}
