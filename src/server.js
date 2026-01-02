import "dotenv/config";
import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";

const app = createApp();
await connectDB(process.env.MONGO_URI);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
