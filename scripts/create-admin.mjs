// Creates an administrator or promotes an existing user.
// Prefer env vars so the password does not end up in shell history:
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='long-random' npm run admin:create
// or: npm run admin:create -- you@example.com 'long-random' "Имя"
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// --if-missing: do nothing when this admin already exists (used on every container start).
const ifMissing = process.argv.includes("--if-missing");
const [, , argEmail, argPassword, argName] = process.argv.filter((a) => a !== "--if-missing");
const email = (process.env.ADMIN_EMAIL || argEmail || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || argPassword || "";
const name = process.env.ADMIN_NAME || argName || "Администратор";

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Укажите email администратора (ADMIN_EMAIL или первый аргумент).");
  process.exit(1);
}
if (password.length < 12) {
  console.error("Пароль администратора должен быть не короче 12 символов.");
  process.exit(1);
}

const db = new PrismaClient();
if (ifMissing && (await db.user.findFirst({ where: { email, role: "ADMIN" }, select: { id: true } }))) {
  console.log(`Администратор уже существует: ${email}`);
  await db.$disconnect();
  process.exit(0);
}
const passwordHash = await bcrypt.hash(password, 12);
const user = await db.user.upsert({
  where: { email },
  create: { email, passwordHash, displayName: name, role: "ADMIN" },
  update: { passwordHash, role: "ADMIN" },
});
await db.session.deleteMany({ where: { userId: user.id } });
await db.auditLog.create({ data: { actorId: null, action: "admin.bootstrap", entityType: "user", entityId: user.id, meta: { email } } });
console.log(`Администратор готов: ${email}`);
await db.$disconnect();
