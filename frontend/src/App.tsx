import { useEffect, useState } from "react";

type Course = { id: string; title: string; credits: number };

export default function App() {
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [taken, setTaken] = useState<string[]>([]);
  const [planned, setPlanned] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    fetch("/api/catalog")
      .then((res) => res.json())
      .then((data: Course[]) => setCatalog(data));
  }, []);

  function addCourse(list: "taken" | "planned") {
    if (!selected) return;

    if (list === "taken") {
      if (!taken.includes(selected)) {
        setTaken([...taken, selected]);
      }
    } else {
      if (!planned.includes(selected)) {
        setPlanned([...planned, selected]);
      }
    }

    setSelected("");
  }

  function courseLabel(id: string) {
    const c = catalog.find((x) => x.id === id);
    return c ? `${c.id} — ${c.title}` : id;
  }

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

      <h2>Taken</h2>
      <ul>
        {taken.map((id) => (
          <li key={id}>{courseLabel(id)}</li>
        ))}
      </ul>

      <h2>Planned</h2>
      <ul>
        {planned.map((id) => (
          <li key={id}>{courseLabel(id)}</li>
        ))}
      </ul>
    </div>
  );
}
