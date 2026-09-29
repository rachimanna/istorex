// Seeds the base categories (idempotent). Does NOT create fake apps.
// Usage: npm run db:seed
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const categories = [
  { slug: "games-action", name: "Экшен", kind: "GAME", icon: "🎮", sortOrder: 1 },
  { slug: "games-puzzle", name: "Головоломки", kind: "GAME", icon: "🧩", sortOrder: 2 },
  { slug: "games-arcade", name: "Аркады", kind: "GAME", icon: "🕹️", sortOrder: 3 },
  { slug: "emulators", name: "Эмуляторы", kind: "GAME", icon: "👾", sortOrder: 4 },
  { slug: "modified", name: "Модифицированные", kind: "APP", icon: "🧪", sortOrder: 1 },
  { slug: "social", name: "Социальные сети", kind: "APP", icon: "💬", sortOrder: 2 },
  { slug: "music-video", name: "Музыка и видео", kind: "APP", icon: "🎬", sortOrder: 3 },
  { slug: "tools", name: "Инструменты", kind: "APP", icon: "🛠️", sortOrder: 4 },
  { slug: "other", name: "Другое", kind: "APP", icon: "📦", sortOrder: 9 },
];

for (const c of categories) {
  await db.category.upsert({ where: { slug: c.slug }, create: c, update: {} });
}
console.log(`Категорий: ${await db.category.count()}`);
await db.$disconnect();
