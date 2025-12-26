import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// --- Types
type PrereqRule =
  | { all: string[] }
  | { any: string[] };

type Course = {
  id: string;
  title: string;
  credits: number;
  prereqs?: PrereqRule; // optional
};

// --- Mini catalog (we'll expand later)
const CATALOG: Course[] = [
  { id: "COMP_SCI_200", title: "Programming I", credits: 3 },
  { id: "COMP_SCI_300", title: "Programming II", credits: 3, prereqs: { all: ["COMP_SCI_200"] } },
  { id: "COMP_SCI_400", title: "Programming III", credits: 3, prereqs: { all: ["COMP_SCI_300"] } },
  { id: "MATH_221", title: "Calculus I", credits: 5 },
  { id: "COMP_SCI_540", title: "Intro to AI", credits: 3, prereqs: { any: ["COMP_SCI_400", "COMP_SCI_300"] } },
];

const catalogById = new Map(CATALOG.map((c) => [c.id, c]));

// --- Helpers
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
      missing: ok ? [] : rule.any, // if none satisfied, show options
      explanation: ok ? "" : `Need one of: ${rule.any.join(", ")}`,
    };
  }

  return { ok: true, missing: [], explanation: "" };
}

// --- Routes
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/catalog", (_req, res) => {
  res.json(CATALOG);
});

app.post("/api/plan/validate", (req, res) => {
  const taken: string[] = Array.isArray(req.body?.taken) ? req.body.taken : [];
  const planned: string[] = Array.isArray(req.body?.planned) ? req.body.planned : [];

  const completed = new Set<string>(taken);

  const courseValidations = planned.map((courseId) => {
    const course = catalogById.get(courseId);

    if (!course) {
      return {
        courseId,
        valid: false,
        missing: [],
        messages: [`Unknown course: ${courseId}`],
      };
    }

    const result = evalPrereqs(course.prereqs, completed);

    return {
      courseId,
      valid: result.ok,
      missing: result.missing,
      messages: result.ok ? [] : [result.explanation || "Prerequisites not satisfied"],
    };
  });

  res.json({
    courseValidations,
  });
});

app.listen(3000, () => {
  console.log("Backend running on http://localhost:3000");
});
