import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TOKEN = (process.env.MADGRADES_TOKEN || "").trim();
console.log("Has token:", Boolean(TOKEN));
if (!TOKEN) {
  console.error("Missing MADGRADES_TOKEN in backend/.env");
  process.exit(1);
}

const BASE = "https://api.madgrades.com/v1/courses";
const PER_PAGE = 200;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.courses)) return data.courses;
  return null;
}

function toIntMaybe(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  let page = 1;
  let total = 0;

  while (true) {
    const url = `${BASE}?page=\${page}&per_page=\${PER_PAGE}`;
    const res = await fetch(url, {
      headers: {
        "Authorization": `Token token=${TOKEN}`,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Madgrades HTTP ${res.status}: ${text}`);
    }

    const data = await res.json();
    const items = pickArray(data);
    if (!items) throw new Error("Unexpected response shape from Madgrades");
    if (items.length === 0) break;

    for (const item of items) {
      const uuid = item.uuid ?? item.id;
      const name = item.name ?? item.title ?? "";
      const number = item.number ?? item.course_number ?? null;
      const subjects = item.subjects ?? item.subject ?? [];

      if (!uuid || !name) continue;

      await prisma.course.upsert({
        where: { uuid: String(uuid) },
        create: {
          uuid: String(uuid),
          name: String(name),
          number: number === null ? null : toIntMaybe(number),
          subjects: JSON.stringify(subjects ?? []),
          raw: JSON.stringify(item),
        },
        update: {
          name: String(name),
          number: number === null ? null : toIntMaybe(number),
          subjects: JSON.stringify(subjects ?? []),
          raw: JSON.stringify(item),
        },
      });

      total += 1;
    }

    console.log(`Imported page ${page} (${items.length} items). Total upserts: ${total}`);
    page += 1;
    await sleep(150);
  }

  console.log("Done importing courses.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
