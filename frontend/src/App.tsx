import { useEffect, useMemo, useState } from "react";

type Course = { id: string; title: string; credits: number; prereqs?: unknown };

type ValidationItem = {
  courseId: string;
  status: "valid" | "warning" | "invalid";
  missing: string[];
  messages: string[];
};

type RequirementResult =
  | {
      id: string;
      title: string;
      done: boolean;
      missing: string[];
    }
  | {
      id: string;
      title: string;
      done: boolean;
      current: number;
      required: number;
    };

export default function App() {
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [taken, setTaken] = useState<string[]>([]);
  const [inProgress, setInProgress] = useState<string[]>([]);
  const [planned, setPlanned] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");

  const [validations, setValidations] = useState<ValidationItem[]>([]);
  const [requirements, setRequirements] = useState<RequirementResult[]>([]);
  const [loadingValidation, setLoadingValidation] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ----------------------
  // Load catalog
  // ----------------------
  useEffect(() => {
    fetch("/api/catalog")
      .then((res) => res.json())
      .then((data: Course[]) => setCatalog(data));
  }, []);

  // ----------------------
  // Validate plan
  // ----------------------
  useEffect(() => {
    setLoadingValidation(true);
    setValidationError(null);

    fetch("/api/plan/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taken, inProgress, planned }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(
        (data: {
          courseValidations: ValidationItem[];
          requirements: RequirementResult[];
        }) => {
          setValidations(data.courseValidations ?? []);
          setRequirements(data.requirements ?? []);
        }
      )
      .catch((e) => setValidationError(String(e)))
      .finally(() => setLoadingValidation(false));
  }, [taken, inProgress, planned]);

  // ----------------------
  // Helpers
  // ----------------------
  function addCourse(list: "taken" | "inProgress" | "planned") {
    if (!selected) return;

    const addUnique = (arr: string[], setArr: (v: string[]) => void) => {
      if (!arr.includes(selected)) setArr([...arr, selected]);
    };

    if (list === "taken") addUnique(taken, setTaken);
    if (list === "inProgress") addUnique(inProgress, setInProgress);
    if (list === "planned") addUnique(planned, setPlanned);

    setSelected("");
  }

  function removeCourse(list: "taken" | "inProgress" | "planned", id: string) {
    if (list === "taken") setTaken(taken.filter((x) => x !== id));
    if (list === "inProgress") setInProgress(inProgress.filter((x) => x !== id));
    if (list === "planned") setPlanned(planned.filter((x) => x !== id));
  }

  function courseLabel(id: string) {
    const c = catalog.find((x) => x.id === id);
    return c ? `${c.id} — ${c.title}` : id;
  }

  function creditsFor(ids: string[]) {
    return ids.reduce((sum, id) => {
      const c = catalog.find((x) => x.id === id);
      return sum + (c?.credits ?? 0);
    }, 0);
  }

  const creditsTaken = creditsFor(taken);
  const creditsInProgress = creditsFor(inProgress);
  const creditsPlanned = creditsFor(planned);
  const totalAttempted = creditsTaken + creditsInProgress + creditsPlanned;
  const remainingTo120 = Math.max(0, 120 - creditsTaken);

  const validationByCourseId = useMemo(
    () => new Map(validations.map((v) => [v.courseId, v])),
    [validations]
  );

  // ----------------------
  // Render
  // ----------------------
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Course Planner</h1>

      {/* Credits summary */}
      <div style={{ marginTop: 8, marginBottom: 16 }}>
        <div>Credits Taken: <b>{creditsTaken}</b></div>
        <div>Credits In Progress: <b>{creditsInProgress}</b></div>
        <div>Credits Planned: <b>{creditsPlanned}</b></div>
        <div>Total Attempted: <b>{totalAttempted}</b></div>
        <div>Remaining to 120 (Taken only): <b>{remainingTo120}</b></div>
      </div>

      {/* Course picker */}
      <label>
        Select course:{" "}
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">-- choose --</option>
          {catalog.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} — {c.title}
            </option>
          ))}
        </select>
      </label>

      <div style={{ marginTop: 12 }}>
        <button onClick={() => addCourse("taken")}>Add to Taken</button>
        <button onClick={() => addCourse("inProgress")} style={{ marginLeft: 8 }}>
          Add to In Progress
        </button>
        <button onClick={() => addCourse("planned")} style={{ marginLeft: 8 }}>
          Add to Planned
        </button>
      </div>

      <hr style={{ margin: "24px 0" }} />

      {/* Lists */}
      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <h2>Taken</h2>
          <ul>
            {taken.map((id) => (
              <li key={id}>
                {courseLabel(id)}
                <button onClick={() => removeCourse("taken", id)} style={{ marginLeft: 8 }}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ flex: 1 }}>
          <h2>In Progress</h2>
          <ul>
            {inProgress.map((id) => (
              <li key={id}>
                {courseLabel(id)}
                <button onClick={() => removeCourse("inProgress", id)} style={{ marginLeft: 8 }}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ flex: 1 }}>
          <h2>Planned</h2>
          <ul>
            {planned.map((id) => {
              const v = validationByCourseId.get(id);
              return (
                <li key={id} style={{ marginBottom: 10 }}>
                  <div>
                    {courseLabel(id)}
                    <button onClick={() => removeCourse("planned", id)} style={{ marginLeft: 8 }}>
                      remove
                    </button>
                  </div>

                  {v &&
                    (v.status === "valid" ? (
                      <div style={{ color: "green" }}>✅ OK</div>
                    ) : v.status === "warning" ? (
                      <div style={{ color: "#b26a00" }}>⚠️ {v.messages.join(" | ")}</div>
                    ) : (
                      <div style={{ color: "red" }}>❌ {v.messages.join(" | ")}</div>
                    ))}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <hr style={{ margin: "24px 0" }} />

      {/* Degree requirements */}
      <h2>Degree Requirements</h2>
      <ul>
        {requirements.map((r) => (
          <li key={r.id} style={{ marginBottom: 8 }}>
            <b>{r.title}</b>{" "}
            {r.done ? (
              <span style={{ color: "green" }}>✅ Completed</span>
            ) : "missing" in r ? (
              <span style={{ color: "red" }}>
                ❌ Missing: {r.missing.join(", ")}
              </span>
            ) : (
              <span style={{ color: "red" }}>
                ❌ {r.current}/{r.required} credits
              </span>
            )}
          </li>
        ))}
      </ul>

      <hr style={{ margin: "24px 0" }} />

      {/* Debug */}
      <h2>Validation (debug)</h2>
      {loadingValidation && <p>Validating...</p>}
      {validationError && <p style={{ color: "red" }}>Error: {validationError}</p>}
      {!loadingValidation && !validationError && (
        <pre style={{ background: "#f6f6f6", padding: 12 }}>
          {JSON.stringify({ validations, requirements }, null, 2)}
        </pre>
      )}
    </div>
  );
}
