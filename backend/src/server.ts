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
};


// =====================
// Catalog
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

  // Nested prereq example:
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

  // any
  const parts = expr.any.map(describeExpr);
  return parts.length > 1 ? `(${parts.join(" OR ")})` : parts[0] ?? "";
}

function evalPrereqs(
  expr: PrereqExpr | undefined,
  completed: Set<string>
): PrereqEvalResult {
  // Returns:
  // ok: whether prereqs are satisfied
  // missing: a *minimal-ish* set of courses that would satisfy prereqs (best suggestion)
  // explanation: human-friendly string

  if (!expr) return { ok: true, missing: [] as string[], explanation: "" };

  // Leaf course
  if ("course" in expr) {
    const ok = completed.has(expr.course);
    return {
      ok,
      missing: ok ? [] : [expr.course],
      explanation: ok ? "" : `Missing: ${expr.course}`,
    };
  }

  // AND: must satisfy all children
  if ("all" in expr) {
    const results = expr.all.map((child) => evalPrereqs(child, completed));
    const ok = results.every((r) => r.ok);

    const missing = Array.from(
      new Set(results.flatMap((r) => (r.ok ? [] : r.missing)))
    );

    return {
      ok,
      missing,
      explanation: ok ? "" : `Missing: ${missing.join(", ")}`,
    };
  }

  // OR: satisfy at least one child
  const results = expr.any.map((child) => evalPrereqs(child, completed));
  const ok = results.some((r) => r.ok);

  if (ok) {
    return { ok: true, missing: [], explanation: "" };
  }

  // none satisfied -> choose the option that requires the fewest missing courses
  const best = results.reduce((a, b) => (a.missing.length <= b.missing.length ? a : b));

  return {
    ok: false,
    missing: best.missing,
    explanation: `Need: ${describeExpr(expr)}. Closest path: ${best.missing.join(", ")}`,
  };
}

function creditsFor(courseIds: string[]) {
  return courseIds.reduce((sum, id) => {
    const c = catalogById.get(id);
    return sum + (c?.credits ?? 0);
  }, 0);
}

function safeParseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSubjects(subjects: string): { name?: string; abbreviation?: string }[] {
  try {
    const parsed = JSON.parse(subjects);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeCourseId(subjectAbbrev: string, number: number) {
  return `${subjectAbbrev.replace(/\s+/g, "_")}_${number}`;
}

function normalizeSpacesToUnderscore(s: string) {
  return s.trim().replace(/\s+/g, "_");
}

function parseSearchQuery(q: string): {
  subj: string | undefined;
  num: number | undefined;
  text: string;
} {
  const text = q.trim();
  const numMatch = text.match(/\b(\d{1,4})\b/); // find a number like 300, 221, 540
  const num = numMatch ? Number(numMatch[1]) : undefined;

  // Remove the number from the text to guess subject
  const withoutNum = numMatch ? text.replace(numMatch[0], "").trim() : text;

  // Common aliases (so "cs" works)
  const lower = withoutNum.toLowerCase();
  const aliasMap: Record<string, string> = {
    cs: "COMP SCI",
    compsci: "COMP SCI",
    "comp sci": "COMP SCI",
    ece: "E C E",
    math: "MATH",
    stat: "STAT",
  };

  // If the remaining text matches a known alias, use it
  const subj = aliasMap[lower] ?? (withoutNum ? withoutNum.toUpperCase() : undefined);

  return { subj, num, text };
}

// =====================
// Routes
// =====================
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

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
    const id = subj
      ? `${normalizeSpacesToUnderscore(subj)}_${c.number}`
      : `COURSE_${c.uuid}`;

    return {
      id,          // ✅ COMP_SCI_300
      title: c.name,
      credits: 0,
    };
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

app.get("/", (req, res) => {
  res.json({ ok: true, service: "course-planner-backend" });
});

app.post("/api/plans", async (req, res) => {
  const body = (req.body ?? {}) as Partial<PlanPayload>;

  const taken = Array.isArray(body.taken) ? body.taken : [];
  const inProgress = Array.isArray(body.inProgress) ? body.inProgress : [];
  const semesters = Array.isArray(body.semesters) ? body.semesters : [];

  const created = await prisma.plan.create({
    data: {
      taken: JSON.stringify(taken),
      inProgress: JSON.stringify(inProgress),
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
    },
    select: { id: true },
  });

  res.json({ id: created.id });
});

app.post("/api/plan/validate", (req, res) => {
  const taken: string[] = Array.isArray(req.body?.taken) ? req.body.taken : [];
  const inProgress: string[] = Array.isArray(req.body?.inProgress) ? req.body.inProgress : [];
  const planned: string[] = Array.isArray(req.body?.planned) ? req.body.planned : [];

  const completedStrict = new Set<string>(taken);
  const completedLoose = new Set<string>([...taken, ...inProgress]);

  // ---- Course validation
  const courseValidations = planned.map((courseId) => {
    const course = catalogById.get(courseId);

    if (!course) {
      return {
        courseId,
        status: "invalid",
        missing: [],
        messages: [`Unknown course: ${courseId}`],
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
        messages: [
          "Prereqs only satisfied by In Progress courses (finish them first).",
        ],
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
  const creditsTaken = creditsFor(taken);

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

app.put("/api/plans/:id", async (req, res) => {
  const id = req.params.id;
  const body = (req.body ?? {}) as Partial<PlanPayload>;

  const taken = Array.isArray(body.taken) ? body.taken : [];
  const inProgress = Array.isArray(body.inProgress) ? body.inProgress : [];
  const semesters = Array.isArray(body.semesters) ? body.semesters : [];

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // update plan core fields
      const plan = await tx.plan.update({
        where: { id },
        data: {
          taken: JSON.stringify(taken),
          inProgress: JSON.stringify(inProgress),
        },
        select: { id: true },
      });

      // delete old semesters (cascades to PlannedCourse)
      await tx.semester.deleteMany({ where: { planId: id } });

      // recreate semesters + courses
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


// =====================
app.listen(3000, () => {
  console.log("Backend running on http://localhost:3000");
});

process.on("SIGINT", async () => {
  console.log("Shutting down Prisma...");
  await prisma.$disconnect();
  process.exit(0);
});

