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
  pageTitles: z.array(z.string().min(1)).min(1).optional(),
});

router.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateFormSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const { pageTitles, ...rest } = parsed.data;
  const form = await prisma.form.update({
    where: { id },
    data: { ...rest, ...(pageTitles ? { pageTitles: JSON.stringify(pageTitles) } : {}) },
  });
  res.json(form);
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  await prisma.form.delete({ where: { id } });
  res.status(204).end();
});

// Removes one page, shifting every later page's fields down by one index.
// Refuses if it's the only page, or if the page still has fields on it
// (the admin moves or deletes those first, so nothing is silently dropped).
router.delete("/:id/pages/:index", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  const index = Number(req.params.index);

  const form = await prisma.form.findUnique({ where: { id } });
  if (!form) return res.status(404).json({ error: "Form not found" });

  const pageTitles: string[] = JSON.parse(form.pageTitles);
  if (pageTitles.length <= 1) return res.status(400).json({ error: "A form needs at least one page" });
  if (index < 0 || index >= pageTitles.length) return res.status(400).json({ error: "Invalid page index" });

  const fieldsOnPage = await prisma.formField.count({ where: { formId: id, page: index } });
  if (fieldsOnPage > 0) {
    return res.status(400).json({ error: "Move or delete this page's fields before removing it" });
  }

  pageTitles.splice(index, 1);
  const laterFields = await prisma.formField.findMany({ where: { formId: id, page: { gt: index } } });

  await prisma.$transaction([
    prisma.form.update({ where: { id }, data: { pageTitles: JSON.stringify(pageTitles) } }),
    ...laterFields.map((f) => prisma.formField.update({ where: { id: f.id }, data: { page: f.page - 1 } })),
  ]);

  const updated = await prisma.form.findUnique({ where: { id }, include: { fields: { orderBy: { id: "asc" } } } });
  res.json(updated);
});

const fieldSchema = z.object({
  id: z.number().int().optional(),
  type: z.enum(["TEXT", "LONG_TEXT", "NUMBER", "CHECKBOX", "DROPDOWN", "DATE", "SECTION"]),
  label: z.string().min(1),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  page: z.number().int().min(0).default(0),
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
        page: f.page,
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
