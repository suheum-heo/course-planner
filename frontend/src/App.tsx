import React, { useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

// =======================
// Types
// =======================
type Course = { id: string; title: string; credits: number; prereqs?: unknown };

type ValidationItem = {
  courseId: string;
  status: "valid" | "warning" | "invalid";
  missing: string[];
  messages: string[];
};

type RequirementResult =
  | { id: string; title: string; done: boolean; missing: string[] }
  | { id: string; title: string; done: boolean; current: number; required: number };

type Semester = {
  name: string;
  order: number;
  courses: { courseId: string; order: number; creditsOverride: number | null }[];
};

type Theme = {
  name: string;
  accent: string;
  bg: string;
  card: string;
  mutedCard: string;
  border: string;
  pill: string;
  text: string;
  softText: string;
};

const THEMES: Record<string, Theme> = {
  uw_red: {
    name: "UW Red",
    accent: "#8c1d18",
    bg: "#f5f7fb",
    card: "#ffffff",
    mutedCard: "#fafafa",
    border: "#e5e7eb",
    pill: "#fee2e2",
    text: "#111827",
    softText: "#4b5563",
  },
  uw_gray: {
    name: "UW Gray",
    accent: "#374151",
    bg: "#f3f4f6",
    card: "#ffffff",
    mutedCard: "#f9fafb",
    border: "#d1d5db",
    pill: "#e5e7eb",
    text: "#111827",
    softText: "#4b5563",
  },
  cool_blue: {
    name: "Cool Blue",
    accent: "#1d4ed8",
    bg: "#eff6ff",
    card: "#ffffff",
    mutedCard: "#f8fafc",
    border: "#dbeafe",
    pill: "#dbeafe",
    text: "#0f172a",
    softText: "#475569",
  },
};

export default function App() {
  // ----------------------
  // Plan state
  // ----------------------
  const [taken, setTaken] = useState<string[]>([]);
  const [inProgress, setInProgress] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");

  const [semesters, setSemesters] = useState<Semester[]>([
    { name: "Fall 2021", order: 0, courses: [] },
    { name: "Spring 2022", order: 1, courses: [] },

    { name: "Fall 2024", order: 2, courses: [] },
    { name: "Spring 2025", order: 3, courses: [] },

    { name: "Fall 2025", order: 4, courses: [] },
    { name: "Spring 2026", order: 5, courses: [] },

    { name: "Fall 2026", order: 6, courses: [] },
    { name: "Spring 2027", order: 7, courses: [] },
  ]);

  const [activeSemesterOrder, setActiveSemesterOrder] = useState<number>(2); // Fall 2024

  // Global per-course credit overrides (applies everywhere)
  const [creditOverrides, setCreditOverrides] = useState<Record<string, number>>({});

  // Collapsible semesters
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  // Save/load
  const [planId, setPlanId] = useState<string>(() => localStorage.getItem("planId") || "");
  const [saveMsg, setSaveMsg] = useState<string>("");

  // ----------------------
  // Theme
  // ----------------------
  const [themeKey, setThemeKey] = useState<string>(() => localStorage.getItem("themeKey") || "uw_red");
  const theme = THEMES[themeKey] ?? THEMES.uw_red;

  // ----------------------
  // Validation + requirements state
  // ----------------------
  const [validations, setValidations] = useState<ValidationItem[]>([]);
  const [requirements, setRequirements] = useState<RequirementResult[]>([]);
  const [loadingValidation, setLoadingValidation] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ----------------------
  // Search UI state
  // ----------------------
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Course[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Cache course info we’ve seen (labels/credits)
  const [courseCache, setCourseCache] = useState<Record<string, Course>>({});

  // ----------------------
  // Styles
  // ----------------------
  const btn: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: theme.card,
    color: theme.text,
    cursor: "pointer",
  };

  const primaryBtn: React.CSSProperties = {
    ...btn,
    background: theme.accent,
    color: "white",
    border: "none",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    padding: 10,
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: theme.card,
    color: theme.text,
  };

  // ----------------------
  // Search courses (debounced)
  // ----------------------
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const t = setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);

      fetch(`${API_BASE}/api/catalog?query=${encodeURIComponent(q)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data: Course[]) => {
          const list = Array.isArray(data) ? data : [];
          setSearchResults(list);

          // cache results
          setCourseCache((prev) => {
            const next = { ...prev };
            for (const c of list) next[c.id] = c;
            return next;
          });
        })
        .catch((e) => setSearchError(String(e)))
        .finally(() => setSearchLoading(false));
    }, 250);

    return () => clearTimeout(t);
  }, [search]);

  // ----------------------
  // Validate plan (server)
  // ----------------------
  useEffect(() => {
    setLoadingValidation(true);
    setValidationError(null);

    fetch(`${API_BASE}/api/plan/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taken, inProgress, semesters, creditOverrides }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { courseValidations: ValidationItem[]; requirements: RequirementResult[] }) => {
        setValidations(data.courseValidations ?? []);
        setRequirements(data.requirements ?? []);
      })
      .catch((e) => setValidationError(String(e)))
      .finally(() => setLoadingValidation(false));
  }, [taken, inProgress, semesters, creditOverrides]);

  // ----------------------
  // Helpers
  // ----------------------
  function courseLabel(id: string) {
    const c = courseCache[id];
    return c ? `${c.id} — ${c.title}` : id;
  }

  function removeCourse(list: "taken" | "inProgress", id: string) {
    if (list === "taken") setTaken((prev) => prev.filter((x) => x !== id));
    if (list === "inProgress") setInProgress((prev) => prev.filter((x) => x !== id));
  }

  // Effective credits: global override > cache credits
  function effectiveCredits(courseId: string): number {
    if (creditOverrides[courseId] != null) return creditOverrides[courseId];
    return courseCache[courseId]?.credits ?? 0;
  }

  function setGlobalCreditsOverride(courseId: string, next: number | null) {
    setCreditOverrides((prev) => {
      const copy = { ...prev };
      if (next == null) delete copy[courseId];
      else copy[courseId] = next;
      return copy;
    });
  }

  // Add a Course (not just an id) to taken/inProgress and ensure cache has it
  function addUniqueCourse(course: Course, list: "taken" | "inProgress") {
    setCourseCache((prev) => ({ ...prev, [course.id]: course }));

    if (list === "taken") {
      setTaken((prev) => (prev.includes(course.id) ? prev : [...prev, course.id]));
    } else {
      setInProgress((prev) => (prev.includes(course.id) ? prev : [...prev, course.id]));
    }
  }

  // Ensure typed course IDs still work (fetch + cache on demand)
  async function ensureCourseInCache(courseId: string): Promise<Course | null> {
    const id = courseId.trim();
    if (!id) return null;

    if (courseCache[id]) return courseCache[id];

    try {
      const res = await fetch(`/api/catalog?query=${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const data: Course[] = await res.json();
      const list = Array.isArray(data) ? data : [];

      // prefer exact match
      const exact = list.find((c) => c.id.toLowerCase() === id.toLowerCase()) ?? list[0];
      if (!exact) return null;

      setCourseCache((prev) => ({ ...prev, [exact.id]: exact }));
      return exact;
    } catch {
      return null;
    }
  }

  function addToActiveSemester(courseId: string, creditsOverride: number | null = null) {
    if (!courseId) return;

    // If they add with an override, also set global override (so totals update everywhere)
    if (creditsOverride != null) setGlobalCreditsOverride(courseId, creditsOverride);

    setSemesters((prev) =>
      prev.map((s) => {
        if (s.order !== activeSemesterOrder) return s;

        const already = s.courses.some((c) => c.courseId === courseId);
        if (already) return s;

        return {
          ...s,
          courses: [...s.courses, { courseId, order: s.courses.length, creditsOverride }],
        };
      })
    );
  }

  function removeFromSemester(semOrder: number, courseId: string) {
    setSemesters((prev) =>
      prev.map((s) => {
        if (s.order !== semOrder) return s;
        const filtered = s.courses.filter((c) => c.courseId !== courseId);
        return { ...s, courses: filtered.map((c, idx) => ({ ...c, order: idx })) };
      })
    );
  }

  function setSemesterCreditsOverride(semOrder: number, courseId: string, next: number | null) {
    // Update semester row
    setSemesters((prev) =>
      prev.map((s) => {
        if (s.order !== semOrder) return s;
        return {
          ...s,
          courses: s.courses.map((c) => (c.courseId === courseId ? { ...c, creditsOverride: next } : c)),
        };
      })
    );
    // ALSO update global override so totals/taken update
    setGlobalCreditsOverride(courseId, next);
  }

  function creditsForIds(ids: string[]) {
    return ids.reduce((sum, id) => sum + effectiveCredits(id), 0);
  }

  function creditsForSemester(s: Semester) {
    return s.courses.reduce((sum, c) => {
      // semester-specific override wins if present, else global/cache
      if (c.creditsOverride != null) return sum + c.creditsOverride;
      return sum + effectiveCredits(c.courseId);
    }, 0);
  }

  function parseTerm(name: string): { term: "Fall" | "Spring" | null; year: number | null } {
    const m = name.match(/^(Fall|Spring)\s+(\d{4})$/);
    if (!m) return { term: null, year: null };
    return { term: m[1] as "Fall" | "Spring", year: Number(m[2]) };
  }

  function nextTermName(lastName: string): string {
    const { term, year } = parseTerm(lastName);
    if (!term || !year) return `Fall ${new Date().getFullYear()}`;
    if (term === "Fall") return `Spring ${year + 1}`;
    return `Fall ${year}`;
  }

  function addNextSemester() {
    setSemesters((prev) => {
      const sorted = prev.slice().sort((a, b) => a.order - b.order);
      const last = sorted[sorted.length - 1];
      const nextOrder = (last?.order ?? -1) + 1;
      const nextName = nextTermName(last?.name ?? "Fall 2024");
      const nextSem: Semester = { name: nextName, order: nextOrder, courses: [] };
      return [...prev, nextSem];
    });

    setActiveSemesterOrder(() => {
      const maxOrder = semesters.reduce((m, s) => Math.max(m, s.order), -1);
      return maxOrder + 1;
    });
  }

  function removeSemester(orderToRemove: number) {
    setSemesters((prev) => {
      const kept = prev.filter((s) => s.order !== orderToRemove).sort((a, b) => a.order - b.order);
      return kept.map((s, idx) => ({
        ...s,
        order: idx,
        courses: s.courses
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((c, cIdx) => ({ ...c, order: cIdx })),
      }));
    });

    setActiveSemesterOrder((prevActive) => {
      if (prevActive === orderToRemove) return 0;
      if (prevActive > orderToRemove) return prevActive - 1;
      return prevActive;
    });
  }

  // Selected add actions (fetch + cache if needed)
  async function addSelectedToTaken() {
    const id = selected.trim();
    if (!id) return;
    const c = await ensureCourseInCache(id);
    if (!c) return;
    addUniqueCourse(c, "taken");
    setSelected("");
  }

  async function addSelectedToInProgress() {
    const id = selected.trim();
    if (!id) return;
    const c = await ensureCourseInCache(id);
    if (!c) return;
    addUniqueCourse(c, "inProgress");
    setSelected("");
  }

  async function addSelectedToActiveSemester() {
    const id = selected.trim();
    if (!id) return;
    const c = await ensureCourseInCache(id);
    if (!c) return;
    addToActiveSemester(c.id);
    setSelected("");
  }

  // Validation map (YOU WERE MISSING THIS)
  const validationByCourseId = useMemo(() => {
    const m = new Map<string, ValidationItem>();
    for (const v of validations) m.set(v.courseId, v);
    return m;
  }, [validations]);

  // Credits summary
  const creditsTaken = creditsForIds(taken);
  const creditsInProgress = creditsForIds(inProgress);
  const creditsPlanned = semesters.reduce((sum, s) => sum + creditsForSemester(s), 0);
  const remainingTo120 = Math.max(0, 120 - creditsTaken);

  // ----------------------
  // Save / Load
  // ----------------------
  async function createPlan() {
    setSaveMsg("");
    const res = await fetch(`${API_BASE}/api/plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taken, inProgress, semesters, creditOverrides }),
    });
    if (!res.ok) throw new Error(`Create failed: HTTP ${res.status}`);
    const data: { id: string } = await res.json();
    setPlanId(data.id);
    localStorage.setItem("planId", data.id);
    setSaveMsg(`Created plan: ${data.id}`);
  }

  async function savePlan() {
    if (!planId) {
      await createPlan();
      return;
    }
    setSaveMsg("");
    const res = await fetch(`${API_BASE}/api/plans/${planId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taken, inProgress, semesters, creditOverrides }),
    });
    if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`);
    setSaveMsg("Saved ✅");
  }

  async function loadPlan(id: string) {
    setSaveMsg("");
    const res = await fetch(`${API_BASE}/api/plans/${id}`);
    if (!res.ok) throw new Error(`Load failed: HTTP ${res.status}`);

    const data: {
      id: string;
      taken: string[];
      inProgress: string[];
      semesters: Semester[];
      creditOverrides?: Record<string, number>;
    } = await res.json();

    setTaken(Array.isArray(data.taken) ? data.taken : []);
    setInProgress(Array.isArray(data.inProgress) ? data.inProgress : []);
    setSemesters(Array.isArray(data.semesters) ? data.semesters : []);
    setCreditOverrides(data.creditOverrides ?? {});

    setPlanId(data.id);
    localStorage.setItem("planId", data.id);
    setSaveMsg(`Loaded plan: ${data.id}`);

    if (Array.isArray(data.semesters) && data.semesters.length > 0) {
      setActiveSemesterOrder(data.semesters[0].order ?? 0);
    }
  }

  // =======================
  // Render
  // =======================
  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.bg,
        padding: 32,
        fontFamily: "system-ui",
        color: theme.text,
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          background: theme.card,
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          border: `1px solid ${theme.border}`,
          overflow: "hidden",
        }}
      >
        {/* Sticky top bar */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            background: theme.card,
            borderBottom: `1px solid ${theme.border}`,
            padding: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <h1 style={{ color: theme.accent, margin: 0 }}>Course Planner</h1>
                <span style={{ opacity: 0.75, color: theme.softText }}>
                  Taken {creditsTaken} • In Progress {creditsInProgress} • Planned {creditsPlanned}
                </span>
              </div>
              <div style={{ opacity: 0.8, color: theme.softText, marginTop: 4 }}>
                Remaining to 120 (Taken only): <b>{remainingTo120}</b>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={themeKey}
                onChange={(e) => {
                  setThemeKey(e.target.value);
                  localStorage.setItem("themeKey", e.target.value);
                }}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: theme.card,
                  color: theme.text,
                }}
              >
                {Object.entries(THEMES).map(([key, t]) => (
                  <option key={key} value={key}>
                    {t.name}
                  </option>
                ))}
              </select>

              <button onClick={savePlan} style={primaryBtn}>
                Save
              </button>
              <button onClick={createPlan} style={btn}>
                Save As New
              </button>

              <input
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                placeholder="Plan ID"
                style={{ ...inputStyle, width: 220, maxWidth: 220, padding: 8 }}
              />
              <button
                onClick={() => {
                  if (!planId) return;
                  loadPlan(planId);
                }}
                style={btn}
              >
                Load
              </button>

              {saveMsg && <div style={{ opacity: 0.9 }}>{saveMsg}</div>}
            </div>
          </div>
        </div>

        {/* Main content padding */}
        <div style={{ padding: 24 }}>
          {/* Search UI */}
          <div style={{ marginTop: 4 }}>
            <div style={{ marginBottom: 6, fontWeight: 700 }}>Search course</div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Try "cs 300", "math 221", "calculus"...'
              style={inputStyle}
            />

            <div style={{ marginTop: 10 }}>
              {searchLoading && <div>Searching...</div>}
              {searchError && <div style={{ color: "#b91c1c" }}>Error: {searchError}</div>}

              {!searchLoading && !searchError && search.trim() && searchResults.length === 0 && (
                <div style={{ opacity: 0.75 }}>No matches.</div>
              )}

              {!searchLoading && !searchError && searchResults.length > 0 && (
                <div style={{ maxWidth: 900, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 8 }}>
                  {searchResults.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: 10,
                        borderBottom: `1px solid ${theme.border}`,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.title}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>{c.id}</div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <button onClick={() => setSelected(c.id)} style={btn}>
                          Select
                        </button>

                        {/* IMPORTANT FIX: use addUniqueCourse so cache gets populated */}
                        <button onClick={() => addUniqueCourse(c, "taken")} style={btn}>
                          + Taken
                        </button>
                        <button onClick={() => addUniqueCourse(c, "inProgress")} style={btn}>
                          + In Progress
                        </button>

                        <button onClick={() => addToActiveSemester(c.id)} style={primaryBtn}>
                          + Active Semester
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected controls */}
            <div style={{ marginTop: 14 }}>
              <div style={{ marginBottom: 6, fontWeight: 700 }}>Selected</div>
              <input value={selected} onChange={(e) => setSelected(e.target.value)} placeholder="Course ID" style={inputStyle} />
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={addSelectedToTaken} style={btn}>
                  Add to Taken
                </button>
                <button onClick={addSelectedToInProgress} style={btn}>
                  Add to In Progress
                </button>
                <button onClick={addSelectedToActiveSemester} style={primaryBtn} disabled={!selected}>
                  Selected → Active
                </button>
              </div>
            </div>
          </div>

          <hr style={{ margin: "24px 0", borderColor: theme.border }} />

          {/* Taken + In Progress lists */}
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 320 }}>
              <h2 style={{ marginTop: 0 }}>Taken</h2>
              <ul style={{ paddingLeft: 18 }}>
                {taken.map((id) => (
                  <li key={id} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span>{courseLabel(id)}</span>

                      <span style={{ fontSize: 12, opacity: 0.75 }}>
                        credits: <b>{effectiveCredits(id)}</b>
                      </span>

                      <input
                        type="number"
                        placeholder="override"
                        value={creditOverrides[id] ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          const next = raw === "" ? null : Number(raw);
                          setGlobalCreditsOverride(id, Number.isFinite(next as number) ? (next as number) : null);
                        }}
                        style={{ width: 110, padding: 6, borderRadius: 10, border: `1px solid ${theme.border}` }}
                      />

                      <button onClick={() => removeCourse("taken", id)} style={btn}>
                        remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ flex: 1, minWidth: 320 }}>
              <h2 style={{ marginTop: 0 }}>In Progress</h2>
              <ul style={{ paddingLeft: 18 }}>
                {inProgress.map((id) => (
                  <li key={id} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span>{courseLabel(id)}</span>
                      <span style={{ fontSize: 12, opacity: 0.75 }}>
                        credits: <b>{effectiveCredits(id)}</b>
                      </span>
                      <button onClick={() => removeCourse("inProgress", id)} style={btn}>
                        remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <hr style={{ margin: "24px 0", borderColor: theme.border }} />

          {/* Semester planner */}
          <h2>Semester Planner</h2>

          <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span>Active semester:</span>
            <select
              value={activeSemesterOrder}
              onChange={(e) => setActiveSemesterOrder(Number(e.target.value))}
              style={{ padding: "8px 10px", borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.card }}
            >
              {semesters
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((s) => (
                  <option key={s.order} value={s.order}>
                    {s.name}
                  </option>
                ))}
            </select>

            <button onClick={addSelectedToActiveSemester} style={primaryBtn} disabled={!selected}>
              + Selected → Active
            </button>

            <button onClick={addNextSemester} style={btn}>
              + Add Next Semester
            </button>

            <button
              onClick={() => {
                const nextOrder = semesters.length;
                const next: Semester = { name: `Semester ${nextOrder + 1}`, order: nextOrder, courses: [] };
                setSemesters((prev) => [...prev, next]);
                setActiveSemesterOrder(nextOrder);
              }}
              style={btn}
            >
              + Add Custom Semester
            </button>

            <span style={{ fontSize: 12, opacity: 0.75 }}>
              Selected: <b>{selected || "(none)"}</b>
            </span>
          </div>

          {/* split into 2 rows: start new row at Fall 2025 (order 4) */}
          {(() => {
            const sorted = semesters.slice().sort((a, b) => a.order - b.order);
            const row1 = sorted.filter((s) => s.order < 4);
            const row2 = sorted.filter((s) => s.order >= 4);

            const renderRow = (row: Semester[]) => (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 16 }}>
                {row.map((s) => {
                  const isCollapsed = !!collapsed[s.order];

                  return (
                    <div
                      key={s.order}
                      style={{
                        width: 340,
                        borderRadius: 14,
                        padding: 14,
                        background: s.order === activeSemesterOrder ? theme.pill : theme.mutedCard,
                        border: s.order === activeSemesterOrder ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <b>{s.name}</b>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => setActiveSemesterOrder(s.order)} style={btn}>
                            {activeSemesterOrder === s.order ? "Active" : "Set Active"}
                          </button>

                          <button
                            onClick={() =>
                              setCollapsed((prev) => ({
                                ...prev,
                                [s.order]: !prev[s.order],
                              }))
                            }
                            style={btn}
                          >
                            {isCollapsed ? "Expand" : "Collapse"}
                          </button>

                          <button
                            onClick={() => removeSemester(s.order)}
                            disabled={semesters.length <= 1}
                            title={semesters.length <= 1 ? "You need at least 1 semester" : "Remove this semester"}
                            style={btn}
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      <div style={{ marginTop: 6, opacity: 0.85, fontSize: 12 }}>
                        Semester credits: <b>{creditsForSemester(s)}</b>
                      </div>

                      {!isCollapsed && (
                        <ul style={{ paddingLeft: 18, marginTop: 10 }}>
                          {s.courses
                            .slice()
                            .sort((a, b) => a.order - b.order)
                            .map((c) => {
                              const v = validationByCourseId.get(c.courseId);

                              return (
                                <li key={c.courseId} style={{ marginBottom: 12 }}>
                                  <div
                                    style={{
                                      background: theme.card,
                                      border: `1px solid ${theme.border}`,
                                      borderRadius: 10,
                                      padding: "8px 10px",
                                      fontSize: 14,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {courseLabel(c.courseId)}
                                  </div>

                                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 12, opacity: 0.8 }}>Credits override:</span>
                                    <input
                                      type="number"
                                      value={c.creditsOverride ?? ""}
                                      placeholder="(auto/unknown)"
                                      style={{
                                        width: 140,
                                        padding: 8,
                                        borderRadius: 10,
                                        border: `1px solid ${theme.border}`,
                                        background: theme.card,
                                      }}
                                      onChange={(e) => {
                                        const raw = e.target.value.trim();
                                        const next = raw === "" ? null : Number(raw);
                                        setSemesterCreditsOverride(
                                          s.order,
                                          c.courseId,
                                          Number.isFinite(next as number) ? (next as number) : null
                                        );
                                      }}
                                    />

                                    <button onClick={() => removeFromSemester(s.order, c.courseId)} style={btn}>
                                      remove
                                    </button>
                                  </div>

                                  {v &&
                                    (v.status === "valid" ? (
                                      <div style={{ color: "#15803d", fontWeight: 600, marginTop: 6 }}>✅ OK</div>
                                    ) : v.status === "warning" ? (
                                      <div style={{ color: "#a16207", fontWeight: 600, marginTop: 6 }}>
                                        ⚠️ {v.messages.join(" | ")}
                                      </div>
                                    ) : (
                                      <div style={{ color: "#b91c1c", fontWeight: 600, marginTop: 6 }}>
                                        ❌ {v.messages.join(" | ")}
                                      </div>
                                    ))}
                                </li>
                              );
                            })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            );

            return (
              <>
                {renderRow(row1)}
                {renderRow(row2)}
              </>
            );
          })()}

          <hr style={{ margin: "24px 0", borderColor: theme.border }} />

          {/* Degree requirements */}
          <h2 style={{ marginTop: 0 }}>Degree Requirements</h2>
          <div style={{ background: theme.mutedCard, borderRadius: 12, padding: 16, border: `1px solid ${theme.border}` }}>
            {requirements.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No requirements returned yet.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {requirements.map((r) => (
                  <li key={r.id} style={{ marginBottom: 10 }}>
                    <b>{r.title}</b>{" "}
                    {r.done ? (
                      <span style={{ color: "#15803d", fontWeight: 700 }}>✅ Completed</span>
                    ) : "missing" in r ? (
                      <span style={{ color: "#b91c1c", fontWeight: 700 }}>❌ Missing: {r.missing.join(", ")}</span>
                    ) : (
                      <span style={{ color: "#b91c1c", fontWeight: 700 }}>
                        ❌ {r.current}/{r.required} credits
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <hr style={{ margin: "24px 0", borderColor: theme.border }} />

          {/* Debug (dev-only) */}
          {import.meta.env.DEV && (
            <>
              <h2>Validation (debug)</h2>
              {loadingValidation && <p>Validating...</p>}
              {validationError && <p style={{ color: "#b91c1c" }}>Error: {validationError}</p>}
              {!loadingValidation && !validationError && (
                <pre
                  style={{
                    background: theme.mutedCard,
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    overflowX: "auto",
                  }}
                >
                  {JSON.stringify({ validations, requirements, semesters, creditOverrides, taken, inProgress, courseCacheKeys: Object.keys(courseCache) }, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
