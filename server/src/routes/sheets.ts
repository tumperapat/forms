import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  createSpreadsheetForForm,
  exchangeCodeForRefreshToken,
  getAuthUrl,
  isGoogleConfigured,
  resyncWholeSheet,
} from "../lib/sheets";

const JWT_SECRET = process.env.JWT_SECRET as string;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5174";

// Mounted at /api/forms/:id/sheet
export const formSheetRouter = Router({ mergeParams: true });
formSheetRouter.use(requireAuth);

formSheetRouter.get("/", requireRole("ADMIN"), async (req, res) => {
  const formId = Number(req.params.id);
  const connection = await prisma.sheetConnection.findUnique({ where: { formId } });
  res.json({
    googleConfigured: isGoogleConfigured(),
    connected: !!connection?.refreshToken,
    spreadsheetId: connection?.spreadsheetId ?? null,
    sheetName: connection?.sheetName ?? "Responses",
    syncOnSubmit: connection?.syncOnSubmit ?? true,
  });
});

formSheetRouter.get("/connect", requireRole("ADMIN"), async (req, res) => {
  if (!isGoogleConfigured()) {
    return res.status(400).json({
      error: "Google Sheets isn't configured on this server yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI.",
    });
  }
  const formId = Number(req.params.id);
  const state = jwt.sign({ formId, adminId: req.user!.id }, JWT_SECRET, { expiresIn: "10m" });
  res.json({ authUrl: getAuthUrl(state) });
});

const updateSchema = z.object({
  syncOnSubmit: z.boolean().optional(),
  sheetName: z.string().min(1).optional(),
});

formSheetRouter.patch("/", requireRole("ADMIN"), async (req, res) => {
  const formId = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const existing = await prisma.sheetConnection.findUnique({ where: { formId } });
  if (!existing) return res.status(404).json({ error: "This form has no Google Sheet connection yet" });

  const connection = await prisma.sheetConnection.update({ where: { formId }, data: parsed.data });
  res.json(connection);
});

formSheetRouter.delete("/", requireRole("ADMIN"), async (req, res) => {
  const formId = Number(req.params.id);
  const existing = await prisma.sheetConnection.findUnique({ where: { formId } });
  if (!existing) return res.status(404).json({ error: "This form has no Google Sheet connection yet" });

  await prisma.sheetConnection.update({ where: { formId }, data: { refreshToken: null, spreadsheetId: null } });
  res.status(204).end();
});

formSheetRouter.post("/sync-now", requireRole("ADMIN"), async (req, res) => {
  const formId = Number(req.params.id);
  try {
    await resyncWholeSheet(formId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Sync failed" });
  }
});

// Mounted at /api/sheets — Google redirects here directly, not nested under a form.
export const sheetsOAuthRouter = Router();

sheetsOAuthRouter.get("/oauth/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  if (!code || !state) return res.redirect(`${CLIENT_URL}/?sheetError=missing_code`);

  let payload: { formId: number; adminId: number };
  try {
    payload = jwt.verify(state, JWT_SECRET) as { formId: number; adminId: number };
  } catch {
    return res.redirect(`${CLIENT_URL}/?sheetError=invalid_state`);
  }

  try {
    const refreshToken = await exchangeCodeForRefreshToken(code);
    const form = await prisma.form.findUnique({ where: { id: payload.formId } });
    if (!form) return res.redirect(`${CLIENT_URL}/?sheetError=form_not_found`);

    const existing = await prisma.sheetConnection.findUnique({ where: { formId: form.id } });
    const sheetName = existing?.sheetName || "Responses";
    let spreadsheetId = existing?.spreadsheetId ?? null;
    if (!spreadsheetId) {
      spreadsheetId = await createSpreadsheetForForm(refreshToken, form.id, `${form.title} — Responses`, sheetName);
    }

    await prisma.sheetConnection.upsert({
      where: { formId: form.id },
      create: { formId: form.id, refreshToken, spreadsheetId, sheetName, connectedById: payload.adminId },
      update: { refreshToken, spreadsheetId, connectedById: payload.adminId },
    });

    res.redirect(`${CLIENT_URL}/forms/${form.id}/responses?sheetConnected=1`);
  } catch (err) {
    console.error("Google Sheets OAuth callback failed:", err);
    res.redirect(`${CLIENT_URL}/?sheetError=oauth_failed`);
  }
});

export default sheetsOAuthRouter;
