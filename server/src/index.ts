import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import formRoutes from "./routes/forms";
import responseRoutes from "./routes/responses";
import { formSheetRouter, sheetsOAuthRouter } from "./routes/sheets";

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/forms/:id/responses", responseRoutes);
app.use("/api/forms/:id/sheet", formSheetRouter);
app.use("/api/sheets", sheetsOAuthRouter);

app.listen(PORT, () => {
  console.log(`Form builder API listening on http://localhost:${PORT}`);
});
