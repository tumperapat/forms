import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const where = req.user!.role === "ADMIN" ? {} : { published: true };
  const forms = await prisma.form.findMany({
    where,
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { fields: true, responses: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  res.json(forms);
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const form = await prisma.form.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      fields: { orderBy: { id: "asc" } },
    },
  });
  if (!form) return res.status(404).json({ error: "Form not found" });
  if (!form.published && req.user!.role !== "ADMIN") {
    return res.status(403).json({ error: "This form is not published" });
  }
  res.json(form);
});

const createFormSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

router.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = createFormSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const form = await prisma.form.create({
    data: { ...parsed.data, createdById: req.user!.id },
  });
  res.status(201).json(form);
});

const updateFormSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  published: z.boolean().optional(),
});

router.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateFormSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const form = await prisma.form.update({ where: { id }, data: parsed.data });
  res.json(form);
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  await prisma.form.delete({ where: { id } });
  res.status(204).end();
});

const fieldSchema = z.object({
  id: z.number().int().optional(),
  type: z.enum(["TEXT", "LONG_TEXT", "NUMBER", "CHECKBOX", "DROPDOWN", "DATE", "SECTION"]),
  label: z.string().min(1),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().min(20),
  height: z.number().min(20),
  zIndex: z.number().int().default(0),
});

const saveFieldsSchema = z.object({
  fields: z.array(fieldSchema),
});

// Replaces the entire field layout in one shot, matching how a canvas
// builder naturally saves its whole state after a batch of edits.
router.put("/:id/fields", requireRole("ADMIN"), async (req, res) => {
  const formId = Number(req.params.id);
  const parsed = saveFieldsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

  const form = await prisma.form.findUnique({ where: { id: formId }, include: { fields: true } });
  if (!form) return res.status(404).json({ error: "Form not found" });

  const incomingIds = new Set(parsed.data.fields.filter((f) => f.id).map((f) => f.id));
  const toDelete = form.fields.filter((f) => !incomingIds.has(f.id)).map((f) => f.id);

  await prisma.$transaction([
    ...(toDelete.length ? [prisma.formField.deleteMany({ where: { id: { in: toDelete } } })] : []),
    ...parsed.data.fields.map((f) => {
      const data = {
        type: f.type,
        label: f.label,
        required: f.required,
        options: f.options ? JSON.stringify(f.options) : null,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        zIndex: f.zIndex,
      };
      return f.id
        ? prisma.formField.update({ where: { id: f.id }, data })
        : prisma.formField.create({ data: { ...data, formId } });
    }),
  ]);

  const updated = await prisma.form.findUnique({
    where: { id: formId },
    include: { fields: { orderBy: { id: "asc" } } },
  });
  res.json(updated);
});

export default router;
