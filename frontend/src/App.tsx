import { useEffect, useState } from "react";

type Course = { id: string; title: string; credits: number; prereqs?: unknown };

type ValidationItem = {
  courseId: string;
  valid: boolean;
  missing: string[];
  messages: string[];
};

export default function App() {
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [taken, setTaken] = useState<string[]>([]);
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

  // validate whenever taken/planned changes
  useEffect(() => {
    setLoadingValidation(true);
    setValidationError(null);

    fetch("/api/plan/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taken, planned }),
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
  }, [taken, planned]);

  function addCourse(list: "taken" | "planned") {
    if (!selected) return;

    if (list === "taken") {
      if (!taken.includes(selected)) setTaken([...taken, selected]);
    } else {
      if (!planned.includes(selected)) setPlanned([...planned, selected]);
    }

    setSelected("");
  }

  function removeCourse(list: "taken" | "planned", id: string) {
    if (list === "taken") setTaken(taken.filter((x) => x !== id));
    else setPlanned(planned.filter((x) => x !== id));
  }

  function courseLabel(id: string) {
    const c = catalog.find((x) => x.id === id);
    return c ? `${c.id} — ${c.title}` : id;
  }

  const validationByCourseId = new Map(validations.map((v) => [v.courseId, v]));

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Course Planner</h1>

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
          <h2>Planned</h2>
          <ul>
            {planned.map((id) => {
              const v = validationByCourseId.get(id);
              return (
                <li key={id} style={{ marginBottom: 10 }}>
                  <div>
                    {courseLabel(id)}{" "}
                    <button onClick={() => removeCourse("planned", id)} style={{ marginLeft: 8 }}>
                      remove
                    </button>
                  </div>

                  {v && !v.valid && (
                    <div style={{ color: "red", marginTop: 4 }}>
                      ❌ {v.messages.join(" | ")}
                    </div>
                  )}
                  {v && v.valid && <div style={{ color: "green", marginTop: 4 }}>✅ OK</div>}
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
