import { Router, type Request } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { appendResponseRow } from "../lib/sheets";

const router = Router({ mergeParams: true });
router.use(requireAuth);

const submitSchema = z.object({
  values: z.array(z.object({ fieldId: z.number().int(), value: z.string() })),
});

router.post("/", async (req: Request<{ id: string }>, res) => {
  const formId = Number(req.params.id);
  const form = await prisma.form.findUnique({ where: { id: formId }, include: { fields: true } });
  if (!form) return res.status(404).json({ error: "Form not found" });
  if (!form.published) return res.status(403).json({ error: "This form is not published" });

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const byId = new Map(parsed.data.values.map((v) => [v.fieldId, v.value]));
  const missingRequired = form.fields.filter(
    (f) => f.required && f.type !== "SECTION" && !(byId.get(f.id) ?? "").trim()
  );
  if (missingRequired.length) {
    return res.status(400).json({ error: `Missing required field(s): ${missingRequired.map((f) => f.label).join(", ")}` });
  }

  const response = await prisma.formResponse.create({
    data: {
      formId,
      submittedById: req.user!.id,
      values: {
        create: parsed.data.values
          .filter((v) => form.fields.some((f) => f.id === v.fieldId))
          .map((v) => ({ fieldId: v.fieldId, value: v.value })),
      },
    },
    include: { values: true, submittedBy: { select: { id: true, name: true } } },
  });

  appendResponseRow(formId, response).catch((err) => {
    console.error(`Sheet sync failed for form ${formId}:`, err.message);
  });

  res.status(201).json(response);
});

router.get("/", requireRole("ADMIN"), async (req, res) => {
  const formId = Number(req.params.id);
  const responses = await prisma.formResponse.findMany({
    where: { formId },
    include: { values: true, submittedBy: { select: { id: true, name: true } } },
    orderBy: { submittedAt: "desc" },
  });
  res.json(responses);
});

router.get("/export.xlsx", requireRole("ADMIN"), async (req, res) => {
  const formId = Number(req.params.id);
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: {
      fields: { where: { type: { not: "SECTION" } }, orderBy: { id: "asc" } },
      responses: {
        include: { values: true, submittedBy: { select: { id: true, name: true } } },
        orderBy: { submittedAt: "asc" },
      },
    },
  });
  if (!form) return res.status(404).json({ error: "Form not found" });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Responses");
  sheet.columns = [
    { header: "Submitted at", key: "submittedAt", width: 22 },
    { header: "Submitted by", key: "submittedBy", width: 22 },
    ...form.fields.map((f) => ({ header: f.label, key: `field_${f.id}`, width: 24 })),
  ];

  for (const r of form.responses) {
    const row: Record<string, string> = {
      submittedAt: r.submittedAt.toISOString(),
      submittedBy: r.submittedBy?.name ?? "—",
    };
    for (const v of r.values) row[`field_${v.fieldId}`] = v.value;
    sheet.addRow(row);
  }
  sheet.getRow(1).font = { bold: true };

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${form.title.replace(/[^a-z0-9]+/gi, "-")}-responses.xlsx"`
  );
  await workbook.xlsx.write(res);
  res.end();
});

export default router;
