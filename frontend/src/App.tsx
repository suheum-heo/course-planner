import { useEffect, useMemo, useState } from "react";

type Course = { id: string; title: string; credits: number; prereqs?: unknown };

type ValidationItem = {
  courseId: string;
  status: "valid" | "warning" | "invalid";
  missing: string[];
  messages: string[];
};

export default function App() {
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [taken, setTaken] = useState<string[]>([]);
  const [inProgress, setInProgress] = useState<string[]>([]);
  const [planned, setPlanned] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");

  const [validations, setValidations] = useState<ValidationItem[]>([]);
  const [loadingValidation, setLoadingValidation] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/catalog")
      .then((res) => res.json())
      .then((data: Course[]) => setCatalog(data));
  }, []);

  // validate whenever taken/inProgress/planned changes
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
      .then((data: { courseValidations: ValidationItem[] }) => {
        setValidations(data.courseValidations ?? []);
      })
      .catch((e) => setValidationError(String(e)))
      .finally(() => setLoadingValidation(false));
  }, [taken, inProgress, planned]);

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


  const validationByCourseId = useMemo(() => {
    return new Map(validations.map((v) => [v.courseId, v]));
  }, [validations]);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Course Planner</h1>

      <div style={{ marginTop: 8, marginBottom: 16 }}>
        <div>Credits Taken: <b>{creditsTaken}</b></div>
        <div>Credits In Progress: <b>{creditsInProgress}</b></div>
        <div>Credits Planned: <b>{creditsPlanned}</b></div>
        <div>Total (Taken + In Progress + Planned): <b>{totalAttempted}</b></div>
        <div>Remaining to 120 (based on Taken): <b>{remainingTo120}</b></div>
      </div>


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

      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <h2>Taken</h2>
          <ul>
            {taken.map((id) => (
              <li key={id}>
                {courseLabel(id)}{" "}
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
                {courseLabel(id)}{" "}
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

              const statusLine =
                !v ? null : v.status === "valid" ? (
                  <div style={{ color: "green", marginTop: 4 }}>✅ OK</div>
                ) : v.status === "warning" ? (
                  <div style={{ color: "#b26a00", marginTop: 4 }}>
                    ⚠️ {v.messages.join(" | ")}
                  </div>
                ) : (
                  <div style={{ color: "red", marginTop: 4 }}>
                    ❌ {v.messages.join(" | ")}
                  </div>
                );

              return (
                <li key={id} style={{ marginBottom: 10 }}>
                  <div>
                    {courseLabel(id)}{" "}
                    <button onClick={() => removeCourse("planned", id)} style={{ marginLeft: 8 }}>
                      remove
                    </button>
                  </div>
                  {statusLine}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <hr style={{ margin: "24px 0" }} />

      <h2>Validation</h2>
      {loadingValidation && <p>Validating...</p>}
      {validationError && <p style={{ color: "red" }}>Error: {validationError}</p>}
      {!loadingValidation && !validationError && (
        <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8 }}>
          {JSON.stringify(validations, null, 2)}
        </pre>
      )}
    </div>
  );
}
