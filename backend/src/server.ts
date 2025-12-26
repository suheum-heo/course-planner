import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// =====================
// Types
// =====================
type PrereqRule =
  | { all: string[] }
  | { any: string[] };

type Course = {
  id: string;
  title: string;
  credits: number;
  prereqs?: PrereqRule;
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

// =====================
// Catalog
// =====================
const CATALOG: Course[] = [
  { id: "COMP_SCI_200", title: "Programming I", credits: 3 },
  { id: "COMP_SCI_300", title: "Programming II", credits: 3, prereqs: { all: ["COMP_SCI_200"] } },
  { id: "COMP_SCI_400", title: "Programming III", credits: 3, prereqs: { all: ["COMP_SCI_300"] } },
  { id: "MATH_221", title: "Calculus I", credits: 5 },
  {
    id: "COMP_SCI_540",
    title: "Intro to AI",
    credits: 3,
    prereqs: { any: ["COMP_SCI_400", "COMP_SCI_300"] },
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
function evalPrereqs(rule: PrereqRule | undefined, completed: Set<string>) {
  if (!rule) return { ok: true, missing: [] as string[], explanation: "" };

  if ("all" in rule) {
    const missing = rule.all.filter((c) => !completed.has(c));
    return {
      ok: missing.length === 0,
      missing,
      explanation: missing.length ? `Missing: ${missing.join(", ")}` : "",
    };
  }

  if ("any" in rule) {
    const ok = rule.any.some((c) => completed.has(c));
    return {
      ok,
      missing: ok ? [] : rule.any,
      explanation: ok ? "" : `Need one of: ${rule.any.join(", ")}`,
    };
  }

  return { ok: true, missing: [], explanation: "" };
}

function creditsFor(courseIds: string[]) {
  return courseIds.reduce((sum, id) => {
    const c = catalogById.get(id);
    return sum + (c?.credits ?? 0);
  }, 0);
}

// =====================
// Routes
// =====================
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/catalog", (_req, res) => {
  res.json(CATALOG);
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

// =====================
app.listen(3000, () => {
  console.log("Backend running on http://localhost:3000");
});
