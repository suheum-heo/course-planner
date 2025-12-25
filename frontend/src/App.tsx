import { useEffect, useState } from "react";
import axios from "axios";

type Course = { id: string; title: string; credits: number };

export default function App() {
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [taken, setTaken] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    axios.get<Course[]>("http://localhost:3000/catalog").then((res) => {
      setCatalog(res.data);
    });
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Course Planner (MVP)</h1>

      <label>
        Add course to Taken:{" "}
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">-- choose --</option>
          {catalog.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} — {c.title}
            </option>
          ))}
        </select>
      </label>

      <button
        style={{ marginLeft: 8 }}
        onClick={() => {
          if (!selected) return;
          if (taken.includes(selected)) return;
          setTaken([...taken, selected]);
          setSelected("");
        }}
      >
        Add
      </button>

      <h2>Taken</h2>
      <ul>
        {taken.map((id) => {
          const c = catalog.find((x) => x.id === id);
          return <li key={id}>{id} — {c?.title}</li>;
        })}
      </ul>
    </div>
  );
}
