import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  await prisma.formResponseValue.deleteMany();
  await prisma.formResponse.deleteMany();
  await prisma.sheetConnection.deleteMany();
  await prisma.formField.deleteMany();
  await prisma.form.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash("password123", 10);

  const [admin, staff] = await Promise.all([
    prisma.user.create({ data: { name: "Alex Admin", email: "admin@forms.test", password, role: "ADMIN" } }),
    prisma.user.create({ data: { name: "Sam Staff", email: "staff@forms.test", password, role: "STAFF" } }),
  ]);

  const form = await prisma.form.create({
    data: {
      title: "Daily Shift Check-in",
      description: "A short example form you can fill, edit in the builder, or export.",
      createdById: admin.id,
      published: true,
      fields: {
        create: [
          { type: "SECTION", label: "Shift details", required: false, x: 40, y: 40, width: 400, height: 40, zIndex: 0 },
          { type: "TEXT", label: "Your name", required: true, x: 40, y: 100, width: 280, height: 70, zIndex: 1 },
          {
            type: "DROPDOWN",
            label: "Shift",
            required: true,
            options: JSON.stringify(["Morning", "Afternoon", "Night"]),
            x: 340,
            y: 100,
            width: 220,
            height: 70,
            zIndex: 1,
          },
          { type: "DATE", label: "Date", required: true, x: 40, y: 190, width: 220, height: 70, zIndex: 1 },
          { type: "CHECKBOX", label: "Handover notes reviewed", required: false, x: 280, y: 190, width: 280, height: 50, zIndex: 1 },
          { type: "LONG_TEXT", label: "Notes for the next shift", required: false, x: 40, y: 280, width: 520, height: 120, zIndex: 1 },
        ],
      },
    },
  });

  console.log("Seed complete.");
  console.log(`Login with: ${admin.email} / ${staff.email} — password123 for both`);
  console.log(`Example form created: "${form.title}" (id ${form.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
