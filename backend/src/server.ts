import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const app = express();
app.use(cors());
app.use(express.json());

// =====================
// Types
// =====================
type PrereqExpr =
  | { course: string }
  | { all: PrereqExpr[] }
  | { any: PrereqExpr[] };

type Course = {
  id: string;
  title: string;
  credits: number;
  prereqs?: PrereqExpr;
};

type Requirement =
  | {
      id: string;
      title: string;
      type: "all_of";
      courses: string[];
    }
  | {
      id: string;
      title: string;
      type: "min_credits";
      minCredits: number;
    };

type PrereqEvalResult = {
  ok: boolean;
  missing: string[];
  explanation: string;
};

type MadgradesSubject = { abbreviation?: string; name?: string };

type MadgradesCourse = {
  uuid: string;
  number: number;
  name: string;
  subjects: MadgradesSubject[];
};

type SemesterPayload = {
  name: string;
  order: number;
  courses: { courseId: string; order: number; creditsOverride: number | null }[];
};

type PlanPayload = {
  taken: string[];
  inProgress: string[];
  semesters: SemesterPayload[];
  creditOverrides?: Record<string, number>;
};

// =====================
// Catalog (LOCAL, for prereqs + known credits)
// =====================
const CATALOG: Course[] = [
  { id: "COMP_SCI_200", title: "Programming I", credits: 3 },

  {
    id: "COMP_SCI_300",
    title: "Programming II",
    credits: 3,
    prereqs: { course: "COMP_SCI_200" },
  },

  {
    id: "COMP_SCI_400",
    title: "Programming III",
    credits: 3,
    prereqs: { course: "COMP_SCI_300" },
  },

  { id: "MATH_221", title: "Calculus I", credits: 5 },

  // (COMP_SCI_300 AND MATH_221) OR COMP_SCI_400
  {
    id: "COMP_SCI_540",
    title: "Intro to AI",
    credits: 3,
    prereqs: {
      any: [
        { all: [{ course: "COMP_SCI_300" }, { course: "MATH_221" }] },
        { course: "COMP_SCI_400" },
      ],
    },
  },
];

const catalogById = new Map(CATALOG.map((c) => [c.id, c]));

// =====================
// Degree Requirements
// =====================
const DEGREE_REQUIREMENTS: Requirement[] = [
  {
    id: "CS_CORE",
    title: "CS Core Courses",
    type: "all_of",
    courses: ["COMP_SCI_200", "COMP_SCI_300", "COMP_SCI_400"],
  },
  {
    id: "TOTAL_CREDITS",
    title: "Total Credits",
    type: "min_credits",
    minCredits: 120,
  },
];

// =====================
// Helpers
// =====================
function describeExpr(expr: PrereqExpr): string {
  if ("course" in expr) return expr.course;

  if ("all" in expr) {
    const parts = expr.all.map(describeExpr);
    return parts.length > 1 ? `(${parts.join(" AND ")})` : parts[0] ?? "";
  }

  const parts = expr.any.map(describeExpr);
  return parts.length > 1 ? `(${parts.join(" OR ")})` : parts[0] ?? "";
}

function evalPrereqs(expr: PrereqExpr | undefined, completed: Set<string>): PrereqEvalResult {
  if (!expr) return { ok: true, missing: [], explanation: "" };

  if ("course" in expr) {
    const ok = completed.has(expr.course);
    return {
      ok,
      missing: ok ? [] : [expr.course],
      explanation: ok ? "" : `Missing: ${expr.course}`,
    };
  }

  if ("all" in expr) {
    const results = expr.all.map((child) => evalPrereqs(child, completed));
    const ok = results.every((r) => r.ok);

    const missing = Array.from(new Set(results.flatMap((r) => (r.ok ? [] : r.missing))));

    return {
      ok,
      missing,
      explanation: ok ? "" : `Missing: ${missing.join(", ")}`,
    };
  }

  const results = expr.any.map((child) => evalPrereqs(child, completed));
  const ok = results.some((r) => r.ok);

  if (ok) return { ok: true, missing: [], explanation: "" };

  const best = results.reduce((a, b) => (a.missing.length <= b.missing.length ? a : b));

  return {
    ok: false,
    missing: best.missing,
    explanation: `Need: ${describeExpr(expr)}. Closest path: ${best.missing.join(", ")}`,
  };
}

function safeParseArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseObject(value: string | null | undefined): Record<string, number> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, number>;
    return {};
  } catch {
    return {};
  }
}

function normalizeSpacesToUnderscore(s: string) {
  return s.trim().replace(/\s+/g, "_");
}

// Credits helper that respects overrides + local catalog credits
function creditsFor(courseIds: string[], creditOverrides?: Record<string, number>) {
  const co = creditOverrides ?? {};
  return courseIds.reduce((sum, id) => {
    if (co[id] != null && Number.isFinite(co[id])) return sum + co[id];

    const c = catalogById.get(id);
    return sum + (c?.credits ?? 0);
  }, 0);
}

// planned list from semesters
function plannedFromSemesters(semesters: SemesterPayload[]): string[] {
  const ids: string[] = [];
  for (const s of semesters) {
    for (const c of s.courses ?? []) ids.push(c.courseId);
  }
  return ids;
}

// =====================
// Routes
// =====================
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/catalog", async (req, res) => {
  const q = typeof req.query.query === "string" ? req.query.query.trim() : "";
  const take = Math.min(Number(req.query.take) || 20, 50);

  if (!q) return res.json([]);

  const token = process.env.MADGRADES_TOKEN;
  if (!token) return res.status(500).json({ error: "Missing MADGRADES_TOKEN in backend/.env" });

  const url = `https://api.madgrades.com/v1/courses?query=${encodeURIComponent(q)}&page=1&per_page=${take}`;

  const r = await fetch(url, {
    headers: { Authorization: `Token token=${token}` },
  });

  const text = await r.text();
  if (!r.ok) return res.status(r.status).send(text);

  const payload = JSON.parse(text) as { results: MadgradesCourse[] };
  const results = (payload.results ?? []).map((c) => {
    const subj = c.subjects?.[0]?.abbreviation ?? c.subjects?.[0]?.name ?? "";
    const id = subj ? `${normalizeSpacesToUnderscore(subj)}_${c.number}` : `COURSE_${c.uuid}`;

    // IMPORTANT: fill credits if it’s in our local catalog, else 0
    const local = catalogById.get(id);

    return {
      id, // e.g. COMP_SCI_300
      title: c.name,
      credits: local?.credits ?? 0,
    } satisfies Course;
  });

  res.json(results);
});

app.get("/api/plans/:id", async (req, res) => {
  const id = req.params.id;

  const plan = await prisma.plan.findUnique({
    where: { id },
    include: {
      semesters: {
        orderBy: { order: "asc" },
        include: { courses: { orderBy: { order: "asc" } } },
      },
    },
  });

  if (!plan) return res.status(404).json({ error: "Plan not found" });

  res.json({
    id: plan.id,
    taken: safeParseArray(plan.taken),
    inProgress: safeParseArray(plan.inProgress),
    creditOverrides: safeParseObject((plan as any).creditOverrides),
    semesters: plan.semesters.map((s) => ({
      name: s.name,
      order: s.order,
      courses: s.courses.map((c) => ({
        courseId: c.courseId,
        order: c.order,
        creditsOverride: c.creditsOverride ?? null,
      })),
    })),
  });
});

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "course-planner-backend" });
});

app.post("/api/plans", async (req, res) => {
  const body = (req.body ?? {}) as Partial<PlanPayload>;

  const taken = Array.isArray(body.taken) ? body.taken : [];
  const inProgress = Array.isArray(body.inProgress) ? body.inProgress : [];
  const semesters = Array.isArray(body.semesters) ? body.semesters : [];
  const creditOverrides =
    body.creditOverrides && typeof body.creditOverrides === "object" && !Array.isArray(body.creditOverrides)
      ? (body.creditOverrides as Record<string, number>)
      : {};

  const created = await prisma.plan.create({
    data: {
      taken: JSON.stringify(taken),
      inProgress: JSON.stringify(inProgress),
      // REQUIRES prisma schema field Plan.creditOverrides String?
      creditOverrides: JSON.stringify(creditOverrides) as any,
      semesters: {
        create: semesters
          .sort((a, b) => a.order - b.order)
          .map((s) => ({
            name: s.name,
            order: s.order,
            courses: {
              create: (s.courses ?? [])
                .sort((a, b) => a.order - b.order)
                .map((c) => ({
                  courseId: c.courseId,
                  order: c.order,
                  creditsOverride: c.creditsOverride ?? null,
                })),
            },
          })),
      },
    } as any,
    select: { id: true },
  });

  res.json({ id: created.id });
});

app.put("/api/plans/:id", async (req, res) => {
  const id = req.params.id;
  const body = (req.body ?? {}) as Partial<PlanPayload>;

  const taken = Array.isArray(body.taken) ? body.taken : [];
  const inProgress = Array.isArray(body.inProgress) ? body.inProgress : [];
  const semesters = Array.isArray(body.semesters) ? body.semesters : [];
  const creditOverrides =
    body.creditOverrides && typeof body.creditOverrides === "object" && !Array.isArray(body.creditOverrides)
      ? (body.creditOverrides as Record<string, number>)
      : {};

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const plan = await tx.plan.update({
        where: { id },
        data: {
          taken: JSON.stringify(taken),
          inProgress: JSON.stringify(inProgress),
          // REQUIRES prisma schema field Plan.creditOverrides String?
          creditOverrides: JSON.stringify(creditOverrides) as any,
        } as any,
        select: { id: true },
      });

      await tx.semester.deleteMany({ where: { planId: id } });

      for (const s of semesters.sort((a, b) => a.order - b.order)) {
        await tx.semester.create({
          data: {
            planId: id,
            name: s.name,
            order: s.order,
            courses: {
              create: (s.courses ?? [])
                .sort((a, b) => a.order - b.order)
                .map((c) => ({
                  courseId: c.courseId,
                  order: c.order,
                  creditsOverride: c.creditsOverride ?? null,
                })),
            },
          },
        });
      }

      return plan;
    });

    res.json({ id: updated.id, ok: true });
  } catch {
    res.status(404).json({ error: "Plan not found" });
  }
});

app.post("/api/plan/validate", (req, res) => {
  const taken: string[] = Array.isArray(req.body?.taken) ? req.body.taken : [];
  const inProgress: string[] = Array.isArray(req.body?.inProgress) ? req.body.inProgress : [];

  const semesters: SemesterPayload[] = Array.isArray(req.body?.semesters) ? req.body.semesters : [];
  const planned: string[] = plannedFromSemesters(semesters);

  const creditOverrides =
    req.body?.creditOverrides && typeof req.body.creditOverrides === "object" && !Array.isArray(req.body.creditOverrides)
      ? (req.body.creditOverrides as Record<string, number>)
      : {};

  const completedStrict = new Set<string>(taken);
  const completedLoose = new Set<string>([...taken, ...inProgress]);

  // ---- Course validation
  const courseValidations = planned.map((courseId) => {
    const course = catalogById.get(courseId);

    // If we don’t have prereq data for it (likely Madgrades course),
    // don’t mark it invalid — just “warning” (we can’t validate prereqs).
    if (!course) {
      return {
        courseId,
        status: "warning",
        missing: [],
        messages: ["Prereqs not checked (course not in local prereq catalog)."],
      };
    }

    const strict = evalPrereqs(course.prereqs, completedStrict);
    if (strict.ok) {
      return { courseId, status: "valid", missing: [], messages: [] };
    }

    const loose = evalPrereqs(course.prereqs, completedLoose);
    if (loose.ok) {
      return {
        courseId,
        status: "warning",
        missing: [],
        messages: ["Prereqs only satisfied by In Progress courses (finish them first)."],
      };
    }

    return {
      courseId,
      status: "invalid",
      missing: loose.missing,
      messages: [loose.explanation || "Prerequisites not satisfied"],
    };
  });

  // ---- Degree requirements
  const creditsTaken = creditsFor(taken, creditOverrides);

  const requirements = DEGREE_REQUIREMENTS.map((req) => {
    if (req.type === "all_of") {
      const missing = req.courses.filter((c) => !taken.includes(c));
      return {
        id: req.id,
        title: req.title,
        done: missing.length === 0,
        missing,
      };
    }

    return {
      id: req.id,
      title: req.title,
      done: creditsTaken >= req.minCredits,
      current: creditsTaken,
      required: req.minCredits,
    };
  });

  res.json({
    courseValidations,
    requirements,
  });
});

// =====================
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  console.log("Shutting down Prisma...");
  await prisma.$disconnect();
  process.exit(0);
});
