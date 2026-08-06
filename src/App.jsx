import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { storage } from "./storage";

// ---------- date helpers ----------
const toISO = (d) => {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
};
const todayISO = () => toISO(new Date());
const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const dowOf = (iso) => new Date(iso + "T00:00:00").getDay();
const isWeekend = (iso) => {
  const d = dowOf(iso);
  return d === 0 || d === 6;
};
const dateLabel = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const dateLabelFull = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
};
const dowLabel = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1);
};
const calendarDaysBetween = (fromISO, toISOStr) => {
  const a = new Date(fromISO + "T00:00:00");
  const b = new Date(toISOStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
};
const mondayOf = (iso) => {
  const dow = dowOf(iso);
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(iso, -back);
};

const STORAGE_KEY = "ledger-data-v2";
const emptyState = { projects: [], entries: {} };

const MISS_THRESHOLD = 3;
const STALE_TASK_DAYS = 21;
const BACKFILL_WINDOW_DAYS = 90; // how far back the backfill date picker allows

function recentWeekdays(refISO, n) {
  const out = [];
  let cursor = refISO;
  for (let guard = 0; guard < 3650 && out.length < n; guard++) {
    if (!isWeekend(cursor)) out.unshift(cursor);
    cursor = addDays(cursor, -1);
  }
  return out;
}

function computeStreak(entriesForProject, refToday) {
  if (!entriesForProject) return 0;
  let cursor = refToday;
  if (!isWeekend(cursor) && !entriesForProject[cursor]) {
    cursor = addDays(cursor, -1);
  }
  let streak = 0;
  for (let guard = 0; guard < 3650; guard++) {
    if (isWeekend(cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (entriesForProject[cursor]) {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}

function weekdaysSince(fromISO, toISOStr) {
  let count = 0;
  let cursor = addDays(fromISO, 1);
  for (let guard = 0; guard < 3650 && cursor <= toISOStr; guard++) {
    if (!isWeekend(cursor)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

function lastEntryDate(entries) {
  const keys = Object.keys(entries || {});
  if (keys.length === 0) return null;
  return keys.sort().pop();
}

const OTHER = "__other__";

// Default suggestions offered when a project has no open tasks worth picking —
// ways to add value without a formal action item.
const DEFAULT_OTHER_TASKS = [
  "Reviewed risk/issue log for changes",
  "Checked budget burn vs. percent complete",
  "Verified upcoming milestones are still realistic",
  "Checked in with client/stakeholder contact",
  "Scanned recent emails/Slack for untracked items",
  "Reviewed dependencies on other teams/vendors",
  "Updated project status doc/tracker",
  "Started or updated AAR draft",
  "Reviewed project — no risks identified",
];

// ---------- SF-Symbols-ish icons ----------
const Icon = {
  ChevronRight: (p) => (
    <svg width="9" height="14" viewBox="0 0 9 14" fill="none" {...p}>
      <path d="M1 1L7 7L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ChevronDown: (p) => (
    <svg width="14" height="9" viewBox="0 0 14 9" fill="none" {...p}>
      <path d="M1 1L7 7L13 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Check: (p) => (
    <svg width="13" height="10" viewBox="0 0 13 10" fill="none" {...p}>
      <path d="M1 5L4.5 8.5L12 1" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Plus: (p) => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" {...p}>
      <path d="M7.5 1V14M1 7.5H14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  ),
  PlusCircle: (p) => (
    <svg width="21" height="21" viewBox="0 0 21 21" fill="none" {...p}>
      <circle cx="10.5" cy="10.5" r="9.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 6V15M6 10.5H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  Trash: (p) => (
    <svg width="15" height="16" viewBox="0 0 15 16" fill="none" {...p}>
      <path
        d="M1.5 4H13.5M5.5 4V2.2C5.5 1.5 6 1 6.7 1H8.3C9 1 9.5 1.5 9.5 2.2V4M11.7 4L11.2 13.5C11.15 14.35 10.45 15 9.6 15H5.4C4.55 15 3.85 14.35 3.8 13.5L3.3 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Flame: (p) => (
    <svg width="13" height="15" viewBox="0 0 13 15" fill="none" {...p}>
      <path
        d="M6.5 1C6.5 3 3.5 4 3.5 7.2C3.5 9.7 5.2 11.5 6.7 11.5C6.1 10.5 5.9 9.5 6.5 8.5C7.1 9 8 9.4 8.3 10.3C8.9 9.8 9.5 8.9 9.5 7.5C9.5 5.5 7.5 5.5 6.5 1Z"
        fill="currentColor"
      />
    </svg>
  ),
  Circle: (p) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="10.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  CircleCheck: (p) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path d="M7 12.3L10.3 15.6L17 8.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  XCircle: (p) => (
    <svg width="19" height="19" viewBox="0 0 19 19" fill="none" {...p}>
      <circle cx="9.5" cy="9.5" r="9" fill="#D1D1D6" />
      <path d="M6.5 6.5L12.5 12.5M12.5 6.5L6.5 12.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  Calendar: (p) => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" {...p}>
      <rect x="1" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1 5.5H14M4 1V3.2M11 1V3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  Warning: (p) => (
    <svg width="15" height="14" viewBox="0 0 15 14" fill="none" {...p}>
      <path d="M7.5 1.2L14 12.5H1L7.5 1.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7.5 5.2V8.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="7.5" cy="10.4" r="0.9" fill="currentColor" />
    </svg>
  ),
  Pencil: (p) => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" {...p}>
      <path d="M8.7 1.3L11.7 4.3L4.2 11.8H1.2V8.8L8.7 1.3Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
  Archive: (p) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="1" y="1" width="14" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 5V13.3C2 14.2 2.7 14.9 3.6 14.9H12.4C13.3 14.9 14 14.2 14 13.3V5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.3 8.4H9.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  Search: (p) => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" {...p}>
      <circle cx="6.3" cy="6.3" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 10L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{ ...styles.toggleTrack, background: checked ? COLORS.green : COLORS.fillStrong }}
    >
      <span style={{ ...styles.toggleThumb, transform: checked ? "translateX(16px)" : "translateX(0px)" }} />
    </button>
  );
}

const DEFAULT_UI = {
  select: "",
  custom: "",
  markComplete: false,
  newTask: "",
  newTaskDue: "",
  showDuePicker: false,
  showTasks: false,
  showHistory: false,
  editingName: false,
  nameDraft: "",
  editingTaskId: null,
  taskEditDraft: "",
  backfillOpen: false,
  backfillDate: "",
  backfillSelect: "",
  backfillCustom: "",
  backfillMarkComplete: false,
};

export default function DailyLedger() {
  const [data, setData] = useState(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState(todayISO());
  const [error, setError] = useState(null);

  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [showWeekly, setShowWeekly] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | attention | pending | done | archived

  const [showSkipPanel, setShowSkipPanel] = useState(false);
  const [skipDate, setSkipDate] = useState(todayISO());
  const [skipReason, setSkipReason] = useState("PTO"); // PTO | Holiday | Other
  const [skipCustomReason, setSkipCustomReason] = useState("");

  const [ui, setUi] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) setData(JSON.parse(res.value));
      } catch (e) {
        // no data yet
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const t = todayISO();
      setToday((prev) => (prev !== t ? t : prev));
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // Storage writes are network calls, so two fired close together could in
  // principle resolve out of order and let an older save silently overwrite a
  // newer one at the storage layer even though local state stayed correct.
  // Chaining every write onto this queue guarantees they land in the order
  // they were made.
  const writeQueueRef = useRef(Promise.resolve());

  const persist = useCallback((updater) => {
    setData((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      writeQueueRef.current = writeQueueRef.current
        .then(() => storage.set(STORAGE_KEY, JSON.stringify(next)))
        .then((result) => setError(result ? null : "Save didn't go through. Try again."))
        .catch(() => setError("Save failed. Your last change may not have persisted."));
      return next;
    });
  }, []);

  const setProjUi = (pid, patch) => setUi((prev) => ({ ...prev, [pid]: { ...(prev[pid] || DEFAULT_UI), ...patch } }));
  const getProjUi = (pid) => ui[pid] || DEFAULT_UI;

  // ---------- project CRUD ----------
  const addProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    persist((prev) => ({
      ...prev,
      projects: [...prev.projects, { id, name, createdAt: today, archived: false, tasks: [] }],
    }));
    setNewProjectName("");
    setAddingProject(false);
  };

  const removeProject = (pid) => {
    persist((prev) => ({
      projects: prev.projects.filter((p) => p.id !== pid),
      entries: Object.fromEntries(Object.entries(prev.entries).filter(([k]) => k !== pid)),
    }));
  };

  const toggleArchived = (pid) => {
    persist((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === pid ? { ...p, archived: !p.archived } : p)),
    }));
  };

  const renameProject = (pid, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    persist((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === pid ? { ...p, name: trimmed } : p)),
    }));
  };

  const moveProject = (pid, direction) => {
    persist((prev) => {
      const idx = prev.projects.findIndex((p) => p.id === pid);
      if (idx === -1) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.projects.length) return prev;
      const nextProjects = [...prev.projects];
      [nextProjects[idx], nextProjects[newIdx]] = [nextProjects[newIdx], nextProjects[idx]];
      return { ...prev, projects: nextProjects };
    });
  };

  // ---------- task CRUD ----------
  const addTask = (pid) => {
    const s = getProjUi(pid);
    const text = s.newTask.trim();
    if (!text) return;
    const tid = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    persist((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === pid
          ? { ...p, tasks: [...p.tasks, { id: tid, text, done: false, createdAt: today, dueDate: s.newTaskDue || null }] }
          : p
      ),
    }));
    setProjUi(pid, { newTask: "", newTaskDue: "", showDuePicker: false });
  };

  const toggleTaskDone = (pid, tid) => {
    persist((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === pid ? { ...p, tasks: p.tasks.map((t) => (t.id === tid ? { ...t, done: !t.done } : t)) } : p
      ),
    }));
  };

  const deleteTask = (pid, tid) => {
    persist((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === pid ? { ...p, tasks: p.tasks.filter((t) => t.id !== tid) } : p)),
    }));
    setUi((prevUi) => {
      const cur = prevUi[pid];
      if (!cur) return prevUi;
      const patch = {};
      if (cur.select === tid) patch.select = "";
      if (cur.backfillSelect === tid) patch.backfillSelect = "";
      if (cur.editingTaskId === tid) patch.editingTaskId = null;
      if (Object.keys(patch).length === 0) return prevUi;
      return { ...prevUi, [pid]: { ...cur, ...patch } };
    });
  };

  const renameTask = (pid, tid, newText) => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    persist((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === pid ? { ...p, tasks: p.tasks.map((t) => (t.id === tid ? { ...t, text: trimmed } : t)) } : p
      ),
    }));
  };

  // ---------- logging (shared by "today" and backfill) ----------
  const logForDate = (pid, targetDate, selection, customText, markComplete) => {
    if (!selection) return;
    if (selection === OTHER && !customText.trim()) return;

    persist((prev) => {
      const proj = prev.projects.find((p) => p.id === pid);
      if (!proj) return prev;

      let entryText = "";
      let taskId = null;
      if (selection === OTHER) {
        entryText = customText.trim();
      } else {
        const task = proj.tasks.find((t) => t.id === selection);
        if (!task) return prev;
        entryText = task.text;
        taskId = task.id;
      }

      const projEntries = { ...(prev.entries[pid] || {}), [targetDate]: { taskId, text: entryText } };

      let projects = prev.projects;
      if (taskId && markComplete) {
        projects = prev.projects.map((p) =>
          p.id === pid ? { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, done: true } : t)) } : p
        );
      }

      return { projects, entries: { ...prev.entries, [pid]: projEntries } };
    });
  };

  const commitLog = (pid) => {
    const s = getProjUi(pid);
    logForDate(pid, today, s.select, s.custom, s.markComplete);
    setProjUi(pid, { select: "", custom: "", markComplete: false });
  };

  const commitBackfill = (pid) => {
    const s = getProjUi(pid);
    const targetDate = s.backfillDate || addDays(today, -1);
    if (!targetDate || targetDate >= today) return;
    logForDate(pid, targetDate, s.backfillSelect, s.backfillCustom, s.backfillMarkComplete);
    setProjUi(pid, { backfillSelect: "", backfillCustom: "", backfillMarkComplete: false, backfillOpen: false, backfillDate: "" });
  };

  const openBackfillFor = (pid, iso) => {
    setProjUi(pid, { backfillOpen: true, backfillDate: iso });
  };

  const clearTodayLog = (pid) => {
    persist((prev) => {
      const projEntries = { ...(prev.entries[pid] || {}) };
      delete projEntries[today];
      return { ...prev, entries: { ...prev.entries, [pid]: projEntries } };
    });
  };

  // Fills entries[date] for every active (non-archived) project that doesn't
  // already have a real entry that day — used for PTO/holidays so streaks
  // don't break just because there was nothing to log. Never overwrites an
  // existing entry, so partial days (you worked one project anyway) are safe.
  const skipDay = (dateISO, reasonLabel) => {
    persist((prev) => {
      const nextEntries = { ...prev.entries };
      prev.projects.forEach((p) => {
        if (p.archived) return;
        const existing = nextEntries[p.id] || {};
        if (existing[dateISO]) return;
        nextEntries[p.id] = { ...existing, [dateISO]: { taskId: null, skip: true, text: `Skipped — ${reasonLabel}` } };
      });
      return { ...prev, entries: nextEntries };
    });
  };

  // ---------- derived data ----------
  const weekStart = mondayOf(today);
  const weekWeekdaysSoFar = useMemo(() => {
    const out = [];
    let cursor = weekStart;
    for (let i = 0; i < 5; i++) {
      if (cursor > today) break;
      out.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return out;
  }, [weekStart, today]);

  const stripDates = useMemo(() => recentWeekdays(today, 10), [today]);

  const projectsWithMeta = useMemo(() => {
    return data.projects.map((p) => {
      const entries = data.entries[p.id] || {};
      const todaysEntry = entries[today];
      const doneToday = !!todaysEntry;
      const streak = computeStreak(entries, today);
      const openTasks = p.tasks.filter((t) => !t.done);
      const doneTasks = p.tasks.filter((t) => t.done);

      const lastEntry = lastEntryDate(entries);
      const baseline = lastEntry || p.createdAt || today;
      const missedWeekdays = weekdaysSince(baseline, today);
      const neverLogged = !lastEntry;
      const needsAttention = !p.archived && missedWeekdays >= MISS_THRESHOLD;

      const weekTouches = weekWeekdaysSoFar.filter((d) => !!entries[d]).length;

      return {
        ...p,
        entries,
        todaysEntry,
        doneToday,
        streak,
        strip: stripDates,
        openTasks,
        doneTasks,
        lastEntry,
        missedWeekdays,
        neverLogged,
        needsAttention,
        weekTouches,
      };
    });
  }, [data, today, weekWeekdaysSoFar, stripDates]);

  const activeProjects = useMemo(() => projectsWithMeta.filter((p) => !p.archived), [projectsWithMeta]);
  const archivedProjects = useMemo(() => projectsWithMeta.filter((p) => p.archived), [projectsWithMeta]);

  const doneCount = activeProjects.filter((p) => p.doneToday).length;
  const allDone = activeProjects.length > 0 && doneCount === activeProjects.length;
  const weekend = isWeekend(today);
  const attentionList = activeProjects.filter((p) => p.needsAttention);
  const totalWeekActions = activeProjects.reduce((sum, p) => sum + p.weekTouches, 0);
  const projectsTouchedThisWeek = activeProjects.filter((p) => p.weekTouches > 0).length;

  const filterCounts = {
    all: activeProjects.length,
    attention: attentionList.length,
    pending: activeProjects.filter((p) => !p.doneToday).length,
    done: doneCount,
    archived: archivedProjects.length,
  };

  const visibleProjects = useMemo(() => {
    let list;
    if (statusFilter === "archived") list = archivedProjects;
    else if (statusFilter === "attention") list = activeProjects.filter((p) => p.needsAttention);
    else if (statusFilter === "pending") list = activeProjects.filter((p) => !p.doneToday);
    else if (statusFilter === "done") list = activeProjects.filter((p) => p.doneToday);
    else list = activeProjects;

    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return list;
  }, [statusFilter, searchQuery, activeProjects, archivedProjects]);

  const backfillMinDate = addDays(today, -BACKFILL_WINDOW_DAYS);
  const backfillMaxDate = addDays(today, -1);

  if (!loaded) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingText}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.navHeader}>
          <div style={styles.navTitleRow}>
            <div style={styles.navTitle}>Ledger</div>
            {projectsWithMeta.length > 1 && (
              <button style={styles.navTrailingBtn} onClick={() => setReorderMode(!reorderMode)}>
                {reorderMode ? "Done" : "Reorder"}
              </button>
            )}
          </div>
          <div style={styles.navSubtitleRow}>
            <span style={styles.navSubtitle}>{dateLabelFull(today)}</span>
            {weekend && <span style={styles.weekendPill}>Weekend</span>}
          </div>
        </div>

        {!reorderMode && (
          <div style={styles.statusRow}>
            <div style={styles.progressCapsule}>
              <span style={styles.progressCapsuleStrong}>{doneCount}</span>
              <span style={styles.progressCapsuleDim}>/{activeProjects.length} today</span>
            </div>
            {allDone && activeProjects.length > 0 && !weekend && (
              <div style={styles.completeCapsule}>
                <Icon.CircleCheck style={{ color: COLORS.green, flexShrink: 0 }} width={15} height={15} />
                All set
              </div>
            )}
            <button style={styles.skipTriggerBtn} onClick={() => setShowSkipPanel(!showSkipPanel)}>
              Skip a day
            </button>
          </div>
        )}

        {!reorderMode && showSkipPanel && (
          <div style={styles.cardStack}>
            <div style={styles.card}>
              <div style={styles.skipPanelTitle}>Skip a day (PTO / holiday)</div>
              <div style={styles.emptyHint}>
                Fills every active project that doesn't already have an entry that day, so streaks don't break.
                Projects you already logged that day are left alone.
              </div>
              <input
                type="date"
                style={{ ...styles.dateInput, marginTop: 10 }}
                max={today}
                value={skipDate}
                onChange={(e) => setSkipDate(e.target.value)}
              />
              <div style={styles.skipReasonRow}>
                {["PTO", "Holiday", "Other"].map((r) => (
                  <button
                    key={r}
                    onClick={() => setSkipReason(r)}
                    style={{ ...styles.filterPill, ...(skipReason === r ? styles.filterPillActive : {}) }}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {skipReason === "Other" && (
                <input
                  style={styles.textField}
                  placeholder="Reason"
                  value={skipCustomReason}
                  onChange={(e) => setSkipCustomReason(e.target.value)}
                />
              )}
              <div style={styles.logActionsRow}>
                <span style={styles.emptyHint}>
                  {activeProjects.filter((p) => !p.entries[skipDate]).length} of {activeProjects.length} projects
                  affected
                </span>
                <button
                  style={{ ...styles.filledBtn, marginLeft: "auto" }}
                  disabled={skipReason === "Other" && !skipCustomReason.trim()}
                  onClick={() => {
                    skipDay(skipDate, skipReason === "Other" ? skipCustomReason.trim() : skipReason);
                    setShowSkipPanel(false);
                    setSkipCustomReason("");
                  }}
                >
                  Skip This Day
                </button>
              </div>
            </div>
          </div>
        )}

        {weekend && !reorderMode && (
          <div style={styles.calloutOrange}>Streaks only run Mon–Fri. Nothing breaks if you skip today.</div>
        )}
        {error && <div style={styles.calloutRed}>{error}</div>}

        {attentionList.length > 0 && !reorderMode && (
          <div style={styles.calloutAttention}>
            <div style={styles.calloutAttentionHeader}>
              <Icon.Warning style={{ color: COLORS.red, flexShrink: 0 }} />
              Needs attention
            </div>
            <div style={styles.calloutAttentionBody}>
              {attentionList
                .map((p) => `${p.name} — ${p.neverLogged ? "never logged" : `${p.missedWeekdays}d since last action`}`)
                .join(" · ")}
            </div>
          </div>
        )}

        {!reorderMode && (
          <div style={styles.cardStack}>
            <div style={styles.card}>
              <button style={styles.disclosureRow} onClick={() => setShowWeekly(!showWeekly)}>
                <span style={styles.disclosureLabel}>This Week</span>
                <span style={styles.disclosureRight}>
                  <span style={styles.disclosureCount}>
                    {projectsTouchedThisWeek}/{activeProjects.length} touched
                  </span>
                  <Icon.ChevronRight
                    style={{ color: COLORS.tertiaryLabel, transform: showWeekly ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
                  />
                </span>
              </button>
              {showWeekly && (
                <div style={styles.expandPanel}>
                  <div style={styles.weeklySummaryLine}>
                    {totalWeekActions} action{totalWeekActions === 1 ? "" : "s"} logged since Monday, across{" "}
                    {weekWeekdaysSoFar.length} weekday{weekWeekdaysSoFar.length === 1 ? "" : "s"} so far.
                  </div>
                  {activeProjects.map((p) => (
                    <div key={p.id} style={styles.weeklyRow}>
                      <span style={styles.weeklyName}>{p.name}</span>
                      <span style={styles.weeklyDots}>
                        {weekWeekdaysSoFar.map((d) => (
                          <span
                            key={d}
                            title={`${dowLabel(d)} ${dateLabel(d)}${p.entries[d] ? ": " + p.entries[d].text : ": no entry"}`}
                            style={{
                              ...styles.dot,
                              background: p.entries[d] ? (p.entries[d].skip ? COLORS.orange : COLORS.blue) : COLORS.fillStrong,
                            }}
                          />
                        ))}
                      </span>
                      <span style={styles.weeklyCount}>
                        {p.weekTouches}/{weekWeekdaysSoFar.length}
                      </span>
                    </div>
                  ))}
                  {activeProjects.length === 0 && <div style={styles.emptyHint}>Nothing to roll up yet.</div>}
                </div>
              )}
            </div>
          </div>
        )}

        {!reorderMode && (
          <div style={styles.searchFilterBlock}>
            <div style={styles.searchWrap}>
              <Icon.Search style={{ color: COLORS.tertiaryLabel, flexShrink: 0 }} />
              <input
                style={styles.searchInput}
                placeholder="Search projects"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button style={styles.iconBtnReset} onClick={() => setSearchQuery("")}>
                  <Icon.XCircle width={16} height={16} />
                </button>
              )}
            </div>
            <div style={styles.filterRow}>
              {[
                ["all", `All (${filterCounts.all})`],
                ["attention", `Attention (${filterCounts.attention})`],
                ["pending", `Pending (${filterCounts.pending})`],
                ["done", `Done (${filterCounts.done})`],
                ["archived", `Archived (${filterCounts.archived})`],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  style={{ ...styles.filterPill, ...(statusFilter === key ? styles.filterPillActive : {}) }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {reorderMode ? (
          <div style={styles.cardStack}>
            <div style={styles.card}>
              <div style={styles.reorderHint}>Use the arrows to change daily-list order.</div>
              {projectsWithMeta.map((p, idx) => (
                <div key={p.id} style={styles.reorderRow}>
                  <span style={{ ...styles.reorderName, ...(p.archived ? { color: COLORS.tertiaryLabel } : {}) }}>
                    {p.name}
                    {p.archived && <span style={styles.reorderArchivedTag}>archived</span>}
                  </span>
                  <div style={styles.reorderArrows}>
                    <button
                      style={{ ...styles.iconBtnReset, ...(idx === 0 ? styles.iconBtnDisabled : {}) }}
                      disabled={idx === 0}
                      onClick={() => moveProject(p.id, -1)}
                    >
                      <Icon.ChevronDown style={{ color: COLORS.blue, transform: "rotate(180deg)" }} />
                    </button>
                    <button
                      style={{ ...styles.iconBtnReset, ...(idx === projectsWithMeta.length - 1 ? styles.iconBtnDisabled : {}) }}
                      disabled={idx === projectsWithMeta.length - 1}
                      onClick={() => moveProject(p.id, 1)}
                    >
                      <Icon.ChevronDown style={{ color: COLORS.blue }} />
                    </button>
                  </div>
                </div>
              ))}
              {projectsWithMeta.length === 0 && <div style={styles.emptyHint}>No projects to reorder yet.</div>}
            </div>
          </div>
        ) : (
          <div style={styles.cardStack}>
            {visibleProjects.map((p) => {
              const s = getProjUi(p.id);

              if (p.archived) {
                return (
                  <div key={p.id} style={styles.card}>
                    <div style={styles.cardRow}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={styles.projectNameRow}>
                          <span style={{ ...styles.projectName, color: COLORS.secondaryLabel }}>{p.name}</span>
                          <span style={styles.archivedBadge}>Archived</span>
                        </div>
                        <div style={styles.emptyHint}>
                          {p.lastEntry ? `Last action logged ${dateLabel(p.lastEntry)}.` : "No actions were ever logged."}
                        </div>
                      </div>
                      <button style={styles.textLinkBtn} onClick={() => toggleArchived(p.id)}>
                        Unarchive
                      </button>
                      <button
                        style={styles.iconBtnReset}
                        onClick={() => {
                          if (window.confirm(`Permanently delete "${p.name}"? This removes its history and tasks.`)) {
                            removeProject(p.id);
                          }
                        }}
                        title="Delete permanently"
                      >
                        <Icon.XCircle />
                      </button>
                    </div>

                    <div style={styles.divider} />
                    <button style={styles.disclosureRow} onClick={() => setProjUi(p.id, { showHistory: !s.showHistory })}>
                      <span style={styles.disclosureLabel}>History</span>
                      <Icon.ChevronRight
                        style={{ color: COLORS.tertiaryLabel, transform: s.showHistory ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
                      />
                    </button>
                    {s.showHistory && (
                      <div style={styles.expandPanel}>
                        {Object.keys(p.entries)
                          .sort((a, b) => (a < b ? 1 : -1))
                          .slice(0, 30)
                          .map((d) => (
                            <div key={d} style={styles.historyRow}>
                              <span style={styles.historyDate}>{dateLabel(d)}</span>
                              <span style={{ ...styles.historyNote, ...(p.entries[d].skip ? { color: COLORS.orange } : {}) }}>
                                {p.entries[d].text}
                              </span>
                            </div>
                          ))}
                        {Object.keys(p.entries).length === 0 && <div style={styles.emptyHint}>No entries logged.</div>}
                      </div>
                    )}
                  </div>
                );
              }

              const selectionStillValid =
                s.select === OTHER || s.select === "" || p.openTasks.some((t) => t.id === s.select);
              const effectiveSelect = selectionStillValid ? s.select : "";
              const logDisabled = !effectiveSelect || (effectiveSelect === OTHER && !s.custom.trim());

              const backfillSelectionValid =
                s.backfillSelect === OTHER || s.backfillSelect === "" || p.openTasks.some((t) => t.id === s.backfillSelect);
              const effectiveBackfillSelect = backfillSelectionValid ? s.backfillSelect : "";
              const backfillDate = s.backfillDate || backfillMaxDate;
              const backfillHasExisting = !!p.entries[backfillDate];
              const backfillDisabled =
                !effectiveBackfillSelect || (effectiveBackfillSelect === OTHER && !s.backfillCustom.trim());

              return (
                <div key={p.id} style={{ ...styles.card, ...(p.needsAttention ? styles.cardAttention : {}) }}>
                  <div style={styles.cardRow}>
                    <button
                      onClick={() => {
                        if (p.doneToday) clearTodayLog(p.id);
                      }}
                      style={styles.iconBtnReset}
                      title={p.doneToday ? "Logged today — tap to clear" : "Not logged yet today"}
                    >
                      {p.doneToday ? (
                        <Icon.CircleCheck style={{ color: COLORS.green }} />
                      ) : (
                        <Icon.Circle style={{ color: COLORS.fillStrong }} />
                      )}
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.projectNameRow}>
                        {s.editingName ? (
                          <input
                            autoFocus
                            style={styles.nameEditInput}
                            value={s.nameDraft}
                            onChange={(e) => setProjUi(p.id, { nameDraft: e.target.value })}
                            onBlur={() => {
                              renameProject(p.id, s.nameDraft);
                              setProjUi(p.id, { editingName: false });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.target.blur();
                              if (e.key === "Escape") setProjUi(p.id, { editingName: false });
                            }}
                          />
                        ) : (
                          <>
                            <span style={styles.projectName}>{p.name}</span>
                            <button
                              style={styles.iconBtnReset}
                              onClick={() => setProjUi(p.id, { editingName: true, nameDraft: p.name })}
                              title="Rename project"
                            >
                              <Icon.Pencil style={{ color: COLORS.tertiaryLabel }} />
                            </button>
                          </>
                        )}
                        {p.needsAttention && (
                          <span style={styles.attentionBadge}>
                            {p.neverLogged ? "never logged" : `${p.missedWeekdays}d stale`}
                          </span>
                        )}
                      </div>
                      <div style={styles.dotStrip}>
                        {p.strip.map((iso) => {
                          const entry = p.entries[iso];
                          const hit = !!entry;
                          const isToday = iso === today;
                          const clickable = !hit && iso < today;
                          return (
                            <span
                              key={iso}
                              role={clickable ? "button" : undefined}
                              onClick={clickable ? () => openBackfillFor(p.id, iso) : undefined}
                              title={`${dowLabel(iso)} ${dateLabel(iso)}${hit ? ": " + entry.text : clickable ? ": no entry — tap to backfill" : ": no entry"}`}
                              style={{
                                ...styles.dot,
                                background: hit ? (entry.skip ? COLORS.orange : COLORS.blue) : COLORS.fillStrong,
                                boxShadow: isToday ? `0 0 0 2px ${COLORS.label}` : "none",
                                cursor: clickable ? "pointer" : "default",
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {p.streak > 0 && (
                      <div style={styles.streakPill}>
                        <Icon.Flame style={{ color: COLORS.orange }} />
                        {p.streak}
                      </div>
                    )}

                    <button style={styles.iconBtnReset} onClick={() => toggleArchived(p.id)} title="Archive project">
                      <Icon.Archive style={{ color: COLORS.tertiaryLabel }} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete "${p.name}"? This deletes its history and tasks permanently. Consider archiving instead.`)) {
                          removeProject(p.id);
                        }
                      }}
                      style={styles.iconBtnReset}
                      title="Delete project"
                    >
                      <Icon.XCircle />
                    </button>
                  </div>

                  <div style={styles.divider} />
                  {p.doneToday ? (
                    <div style={styles.loggedRow}>
                      <div style={styles.loggedIconWrap}>
                        <Icon.Check style={{ color: p.todaysEntry.skip ? COLORS.orange : COLORS.green }} />
                      </div>
                      <span style={styles.loggedText}>{p.todaysEntry.text}</span>
                      <button style={styles.textLinkBtn} onClick={() => clearTodayLog(p.id)}>
                        Clear
                      </button>
                    </div>
                  ) : (
                    <div style={styles.logPanel}>
                      <div style={styles.pickerWrap}>
                        <select
                          value={effectiveSelect}
                          onChange={(e) => setProjUi(p.id, { select: e.target.value, markComplete: false })}
                          style={styles.picker}
                        >
                          <option value="">Choose a task…</option>
                          {p.openTasks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.text}
                              {t.dueDate ? ` (due ${dateLabel(t.dueDate)})` : ""}
                            </option>
                          ))}
                          <option value={OTHER}>Something else…</option>
                        </select>
                        <Icon.ChevronDown style={{ color: COLORS.secondaryLabel, pointerEvents: "none" }} />
                      </div>

                      {effectiveSelect === OTHER && (
                        <>
                          <input
                            style={styles.textField}
                            placeholder="What did you do instead?"
                            value={s.custom}
                            onChange={(e) => setProjUi(p.id, { custom: e.target.value })}
                            onKeyDown={(e) => e.key === "Enter" && !logDisabled && commitLog(p.id)}
                            autoFocus
                          />
                          <div style={styles.chipRow}>
                            {DEFAULT_OTHER_TASKS.map((suggestion) => (
                              <button key={suggestion} style={styles.chip} onClick={() => setProjUi(p.id, { custom: suggestion })}>
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      <div style={styles.logActionsRow}>
                        {effectiveSelect && effectiveSelect !== OTHER && (
                          <div style={styles.toggleRow}>
                            <Toggle checked={!!s.markComplete} onChange={(v) => setProjUi(p.id, { markComplete: v })} />
                            <span style={styles.toggleLabel}>Mark task complete too</span>
                          </div>
                        )}
                        <button
                          style={{ ...styles.filledBtn, ...(logDisabled ? styles.filledBtnDisabled : {}), marginLeft: "auto" }}
                          disabled={logDisabled}
                          onClick={() => commitLog(p.id)}
                        >
                          Log Action
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={styles.divider} />
                  <button style={styles.disclosureRow} onClick={() => setProjUi(p.id, { showTasks: !s.showTasks })}>
                    <span style={styles.disclosureLabel}>Tasks</span>
                    <span style={styles.disclosureRight}>
                      <span style={styles.disclosureCount}>{p.openTasks.length}</span>
                      <Icon.ChevronRight
                        style={{ color: COLORS.tertiaryLabel, transform: s.showTasks ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
                      />
                    </span>
                  </button>
                  {s.showTasks && (
                    <div style={styles.expandPanel}>
                      {p.openTasks.length === 0 && p.doneTasks.length === 0 && (
                        <div style={styles.emptyHint}>No tasks yet. Add the next concrete step below.</div>
                      )}
                      {p.openTasks.map((t) => {
                        const age = t.createdAt ? calendarDaysBetween(t.createdAt, today) : 0;
                        const overdue = t.dueDate && t.dueDate < today;
                        const stale = !overdue && age >= STALE_TASK_DAYS;
                        const isEditing = s.editingTaskId === t.id;
                        return (
                          <div key={t.id} style={styles.taskRow}>
                            <button style={styles.iconBtnReset} onClick={() => toggleTaskDone(p.id, t.id)}>
                              <Icon.Circle style={{ color: COLORS.fillStrong }} />
                            </button>
                            {isEditing ? (
                              <input
                                autoFocus
                                style={styles.taskEditInput}
                                value={s.taskEditDraft}
                                onChange={(e) => setProjUi(p.id, { taskEditDraft: e.target.value })}
                                onBlur={() => {
                                  renameTask(p.id, t.id, s.taskEditDraft);
                                  setProjUi(p.id, { editingTaskId: null });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.target.blur();
                                  if (e.key === "Escape") setProjUi(p.id, { editingTaskId: null });
                                }}
                              />
                            ) : (
                              <span style={styles.taskText}>{t.text}</span>
                            )}
                            {t.dueDate && (
                              <span style={{ ...styles.taskBadge, ...(overdue ? styles.taskBadgeOverdue : styles.taskBadgeDue) }}>
                                {overdue ? "overdue" : dateLabel(t.dueDate)}
                              </span>
                            )}
                            {!t.dueDate && stale && <span style={styles.taskBadgeStale}>{age}d old</span>}
                            {!isEditing && (
                              <button
                                style={styles.iconBtnReset}
                                onClick={() => setProjUi(p.id, { editingTaskId: t.id, taskEditDraft: t.text })}
                                title="Rename task"
                              >
                                <Icon.Pencil style={{ color: COLORS.tertiaryLabel }} />
                              </button>
                            )}
                            <button style={styles.iconBtnReset} onClick={() => deleteTask(p.id, t.id)}>
                              <Icon.Trash style={{ color: COLORS.tertiaryLabel }} />
                            </button>
                          </div>
                        );
                      })}
                      {p.doneTasks.length > 0 &&
                        p.doneTasks.map((t) => (
                          <div key={t.id} style={{ ...styles.taskRow, opacity: 0.55 }}>
                            <button style={styles.iconBtnReset} onClick={() => toggleTaskDone(p.id, t.id)}>
                              <Icon.CircleCheck style={{ color: COLORS.secondaryLabel }} />
                            </button>
                            <span style={{ ...styles.taskText, textDecoration: "line-through" }}>{t.text}</span>
                            <button style={styles.iconBtnReset} onClick={() => deleteTask(p.id, t.id)}>
                              <Icon.Trash style={{ color: COLORS.tertiaryLabel }} />
                            </button>
                          </div>
                        ))}
                      <div style={styles.addTaskBlock}>
                        <div style={styles.addTaskRow}>
                          <Icon.Plus style={{ color: COLORS.blue, flexShrink: 0 }} />
                          <input
                            style={styles.addTaskInput}
                            placeholder="Add a task"
                            value={s.newTask}
                            onChange={(e) => setProjUi(p.id, { newTask: e.target.value })}
                            onKeyDown={(e) => e.key === "Enter" && !s.showDuePicker && addTask(p.id)}
                          />
                          <button
                            style={styles.dueToggleBtn}
                            onClick={() => setProjUi(p.id, { showDuePicker: !s.showDuePicker })}
                            title="Set a due date"
                          >
                            <Icon.Calendar style={{ color: s.newTaskDue ? COLORS.blue : COLORS.tertiaryLabel }} />
                          </button>
                          <button style={styles.textLinkBtn} onClick={() => addTask(p.id)}>
                            Add
                          </button>
                        </div>
                        {s.showDuePicker && (
                          <input
                            type="date"
                            style={styles.dateInput}
                            value={s.newTaskDue}
                            onChange={(e) => setProjUi(p.id, { newTaskDue: e.target.value })}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  <div style={styles.divider} />
                  <button style={styles.disclosureRow} onClick={() => setProjUi(p.id, { showHistory: !s.showHistory })}>
                    <span style={styles.disclosureLabel}>History</span>
                    <Icon.ChevronRight
                      style={{ color: COLORS.tertiaryLabel, transform: s.showHistory ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
                    />
                  </button>
                  {s.showHistory && (
                    <div style={styles.expandPanel}>
                      {Object.keys(p.entries)
                        .sort((a, b) => (a < b ? 1 : -1))
                        .slice(0, 30)
                        .map((d) => (
                          <div key={d} style={styles.historyRow}>
                            <span style={styles.historyDate}>{dateLabel(d)}</span>
                            <span style={{ ...styles.historyNote, ...(p.entries[d].skip ? { color: COLORS.orange } : {}) }}>
                              {p.entries[d].text}
                            </span>
                          </div>
                        ))}
                      {Object.keys(p.entries).length === 0 && <div style={styles.emptyHint}>No entries logged yet.</div>}
                    </div>
                  )}

                  <div style={styles.divider} />
                  <button
                    style={styles.disclosureRow}
                    onClick={() => setProjUi(p.id, { backfillOpen: !s.backfillOpen, backfillDate: s.backfillDate || backfillMaxDate })}
                  >
                    <span style={styles.disclosureLabel}>Backfill a day</span>
                    <Icon.ChevronRight
                      style={{ color: COLORS.tertiaryLabel, transform: s.backfillOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
                    />
                  </button>
                  {s.backfillOpen && (
                    <div style={styles.expandPanel}>
                      <input
                        type="date"
                        style={styles.dateInput}
                        min={backfillMinDate}
                        max={backfillMaxDate}
                        value={backfillDate}
                        onChange={(e) => setProjUi(p.id, { backfillDate: e.target.value })}
                      />
                      {backfillHasExisting && (
                        <div style={styles.backfillWarning}>
                          {dateLabel(backfillDate)} already has an entry: "{p.entries[backfillDate].text}". Logging
                          again will replace it.
                        </div>
                      )}
                      <div style={styles.pickerWrap}>
                        <select
                          value={effectiveBackfillSelect}
                          onChange={(e) => setProjUi(p.id, { backfillSelect: e.target.value, backfillMarkComplete: false })}
                          style={styles.picker}
                        >
                          <option value="">Choose a task…</option>
                          {p.openTasks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.text}
                            </option>
                          ))}
                          <option value={OTHER}>Something else…</option>
                        </select>
                        <Icon.ChevronDown style={{ color: COLORS.secondaryLabel, pointerEvents: "none" }} />
                      </div>
                      {effectiveBackfillSelect === OTHER && (
                        <>
                          <input
                            style={styles.textField}
                            placeholder="What did you do that day?"
                            value={s.backfillCustom}
                            onChange={(e) => setProjUi(p.id, { backfillCustom: e.target.value })}
                          />
                          <div style={styles.chipRow}>
                            {DEFAULT_OTHER_TASKS.map((suggestion) => (
                              <button
                                key={suggestion}
                                style={styles.chip}
                                onClick={() => setProjUi(p.id, { backfillCustom: suggestion })}
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      <div style={styles.logActionsRow}>
                        {effectiveBackfillSelect && effectiveBackfillSelect !== OTHER && (
                          <div style={styles.toggleRow}>
                            <Toggle
                              checked={!!s.backfillMarkComplete}
                              onChange={(v) => setProjUi(p.id, { backfillMarkComplete: v })}
                            />
                            <span style={styles.toggleLabel}>Mark task complete too</span>
                          </div>
                        )}
                        <button
                          style={{ ...styles.filledBtn, ...(backfillDisabled ? styles.filledBtnDisabled : {}), marginLeft: "auto" }}
                          disabled={backfillDisabled}
                          onClick={() => commitBackfill(p.id)}
                        >
                          Log for {dateLabel(backfillDate)}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {visibleProjects.length === 0 && projectsWithMeta.length > 0 && (
              <div style={styles.card}>
                <div style={{ ...styles.emptyHint, padding: "4px 2px" }}>
                  No projects match {searchQuery ? `"${searchQuery}"` : "this filter"}.
                </div>
              </div>
            )}
            {projectsWithMeta.length === 0 && (
              <div style={styles.card}>
                <div style={{ ...styles.emptyHint, padding: "4px 2px" }}>
                  No projects yet. Add your active projects below, give each a task backlog, then log one action a
                  day against every one.
                </div>
              </div>
            )}
          </div>
        )}

        {!reorderMode && (
          <div style={styles.cardStack}>
            <div style={styles.card}>
              {addingProject ? (
                <div style={styles.addTaskRow}>
                  <Icon.PlusCircle style={{ color: COLORS.blue, flexShrink: 0 }} />
                  <input
                    autoFocus
                    style={styles.addTaskInput}
                    placeholder="Project name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addProject();
                      if (e.key === "Escape") {
                        setAddingProject(false);
                        setNewProjectName("");
                      }
                    }}
                  />
                  <button style={styles.textLinkBtn} onClick={addProject}>
                    Add
                  </button>
                  <button
                    style={{ ...styles.textLinkBtn, color: COLORS.secondaryLabel }}
                    onClick={() => {
                      setAddingProject(false);
                      setNewProjectName("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button style={styles.addProjectRow} onClick={() => setAddingProject(true)}>
                  <Icon.PlusCircle style={{ color: COLORS.blue }} />
                  <span style={{ color: COLORS.blue, fontWeight: 590 }}>Add Project</span>
                </button>
              )}
            </div>
          </div>
        )}

        <div style={styles.footnote}>
          Streaks count Mon–Fri only. "Needs attention" flags any active project with no logged action in{" "}
          {MISS_THRESHOLD}+ weekdays. Tasks flag as stale after {STALE_TASK_DAYS} days untouched, or "overdue" past
          their due date. Archived projects are hidden from the daily list and from streak/attention tracking, but
          keep their history. Tap an empty past dot to backfill a missed day. "Skip a day" fills in a PTO/holiday
          entry (shown in orange) for every project that doesn't already have one, so streaks don't break. Data is
          stored privately to your account.
        </div>
      </div>
    </div>
  );
}

const COLORS = {
  bg: "#F2F2F7",
  card: "#FFFFFF",
  label: "#1C1C1E",
  secondaryLabel: "#6E6E73",
  tertiaryLabel: "#AEAEB2",
  separator: "rgba(60,60,67,0.13)",
  fill: "#F2F2F6",
  fillStrong: "#D1D1D6",
  blue: "#007AFF",
  green: "#34C759",
  orange: "#FF9500",
  red: "#FF3B30",
};

const SYSTEM_FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO_FONT = "'SF Mono', 'SFMono-Regular', Menlo, Consolas, monospace";

const styles = {
  page: { minHeight: "100vh", background: COLORS.bg, color: COLORS.label, fontFamily: SYSTEM_FONT, padding: "20px 14px 60px", boxSizing: "border-box", WebkitFontSmoothing: "antialiased" },
  loadingText: { fontSize: 15, color: COLORS.secondaryLabel, padding: 40, textAlign: "center" },
  container: { maxWidth: 560, margin: "0 auto" },

  navHeader: { padding: "6px 6px 14px" },
  navTitleRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  navTitle: { fontSize: 34, fontWeight: 750, letterSpacing: "-0.02em", lineHeight: 1.1 },
  navTrailingBtn: { background: "none", border: "none", color: COLORS.blue, fontSize: 15.5, fontWeight: 500, cursor: "pointer", padding: 0 },
  navSubtitleRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 4 },
  navSubtitle: { fontSize: 15, color: COLORS.secondaryLabel },
  weekendPill: { fontSize: 11, fontWeight: 600, color: COLORS.orange, background: "rgba(255,149,0,0.14)", padding: "2px 8px", borderRadius: 20 },

  statusRow: { display: "flex", alignItems: "center", gap: 8, padding: "0 6px 16px", flexWrap: "wrap" },
  skipTriggerBtn: { background: "none", border: "none", color: COLORS.blue, fontSize: 13, fontWeight: 500, cursor: "pointer", padding: 0, marginLeft: "auto" },
  skipPanelTitle: { fontSize: 15, fontWeight: 600, marginBottom: 4 },
  skipReasonRow: { display: "flex", gap: 6, marginTop: 10, marginBottom: 4 },
  progressCapsule: { background: COLORS.card, borderRadius: 20, padding: "6px 14px", fontSize: 14, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  progressCapsuleStrong: { fontWeight: 700, fontFamily: MONO_FONT },
  progressCapsuleDim: { color: COLORS.secondaryLabel, fontFamily: MONO_FONT },
  completeCapsule: { display: "flex", alignItems: "center", gap: 5, background: "rgba(52,199,89,0.12)", color: "#1D8A3D", borderRadius: 20, padding: "6px 12px", fontSize: 13, fontWeight: 600 },

  calloutOrange: { background: "rgba(255,149,0,0.12)", color: "#8A5A00", borderRadius: 12, padding: "10px 14px", fontSize: 13.5, margin: "0 6px 14px" },
  calloutRed: { background: "rgba(255,59,48,0.1)", color: "#B0281D", borderRadius: 12, padding: "10px 14px", fontSize: 13.5, margin: "0 6px 14px" },
  calloutAttention: { background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.25)", borderRadius: 12, padding: "10px 14px", margin: "0 6px 16px" },
  calloutAttentionHeader: { display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 700, color: COLORS.red, marginBottom: 3 },
  calloutAttentionBody: { fontSize: 13, color: "#8A241C", lineHeight: 1.5 },

  searchFilterBlock: { padding: "0 6px 14px", display: "flex", flexDirection: "column", gap: 10 },
  searchWrap: { display: "flex", alignItems: "center", gap: 8, background: COLORS.card, borderRadius: 10, padding: "9px 12px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  searchInput: { flex: 1, border: "none", background: "none", fontSize: 15, fontFamily: SYSTEM_FONT, outline: "none", color: COLORS.label },
  filterRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  filterPill: { background: COLORS.card, border: "none", borderRadius: 20, padding: "6px 12px", fontSize: 12.5, fontWeight: 500, color: COLORS.secondaryLabel, cursor: "pointer" },
  filterPillActive: { background: COLORS.blue, color: "#fff", fontWeight: 600 },

  cardStack: { display: "flex", flexDirection: "column", gap: 18, marginBottom: 6 },
  card: { background: COLORS.card, borderRadius: 14, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  cardAttention: { boxShadow: `0 0 0 1.5px ${COLORS.red}, 0 1px 3px rgba(0,0,0,0.05)` },
  cardRow: { display: "flex", alignItems: "flex-start", gap: 10 },
  iconBtnReset: { background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 },
  iconBtnDisabled: { opacity: 0.3, cursor: "not-allowed" },
  projectNameRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6, marginTop: 1, flexWrap: "wrap" },
  projectName: { fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" },
  nameEditInput: { fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", border: "none", borderBottom: `1.5px solid ${COLORS.blue}`, background: "none", outline: "none", fontFamily: SYSTEM_FONT, padding: "0 0 2px", minWidth: 120 },
  attentionBadge: { fontSize: 10.5, fontWeight: 700, color: "#fff", background: COLORS.red, borderRadius: 20, padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.02em" },
  archivedBadge: { fontSize: 10.5, fontWeight: 700, color: COLORS.secondaryLabel, background: COLORS.fill, borderRadius: 20, padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.02em" },
  dotStrip: { display: "flex", gap: 4 },
  dot: { width: 7, height: 7, borderRadius: "50%", display: "inline-block" },
  streakPill: { display: "flex", alignItems: "center", gap: 3, fontFamily: MONO_FONT, fontSize: 13, fontWeight: 700, color: COLORS.label, background: COLORS.fill, borderRadius: 20, padding: "4px 9px", flexShrink: 0 },

  divider: { height: 1, background: COLORS.separator, margin: "12px -16px" },

  loggedRow: { display: "flex", alignItems: "center", gap: 10 },
  loggedIconWrap: { flexShrink: 0 },
  loggedText: { flex: 1, fontSize: 15, color: COLORS.label },
  textLinkBtn: { background: "none", border: "none", color: COLORS.blue, fontSize: 14, fontWeight: 500, cursor: "pointer", padding: 0, flexShrink: 0 },

  logPanel: { display: "flex", flexDirection: "column", gap: 10 },
  pickerWrap: { position: "relative", display: "flex", alignItems: "center" },
  picker: { width: "100%", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", background: COLORS.fill, border: "none", borderRadius: 10, padding: "10px 32px 10px 12px", fontSize: 15, fontFamily: SYSTEM_FONT, color: COLORS.label, boxSizing: "border-box" },
  textField: { width: "100%", background: COLORS.fill, border: "none", borderRadius: 10, padding: "10px 12px", fontSize: 15, fontFamily: SYSTEM_FONT, boxSizing: "border-box", outline: "none" },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: -2 },
  chip: { background: COLORS.fill, border: "none", borderRadius: 20, padding: "5px 10px", fontSize: 12, color: COLORS.secondaryLabel, cursor: "pointer", textAlign: "left" },
  logActionsRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  toggleRow: { display: "flex", alignItems: "center", gap: 8 },
  toggleLabel: { fontSize: 13, color: COLORS.secondaryLabel },
  toggleTrack: { width: 36, height: 21, borderRadius: 11, border: "none", position: "relative", cursor: "pointer", padding: 2, boxSizing: "border-box", transition: "background 0.15s" },
  toggleThumb: { display: "block", width: 17, height: 17, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "transform 0.15s" },

  filledBtn: { background: COLORS.blue, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  filledBtnDisabled: { background: COLORS.fillStrong, color: COLORS.secondaryLabel, cursor: "not-allowed" },

  disclosureRow: { width: "100%", background: "none", border: "none", padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: SYSTEM_FONT },
  disclosureLabel: { fontSize: 15, color: COLORS.label, fontWeight: 500 },
  disclosureRight: { display: "flex", alignItems: "center", gap: 6 },
  disclosureCount: { fontSize: 13, color: COLORS.secondaryLabel, fontFamily: MONO_FONT },

  expandPanel: { paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 },
  emptyHint: { fontSize: 13.5, color: COLORS.secondaryLabel, lineHeight: 1.5 },
  taskRow: { display: "flex", alignItems: "center", gap: 8 },
  taskText: { flex: 1, fontSize: 15, color: COLORS.label },
  taskEditInput: { flex: 1, fontSize: 15, border: "none", borderBottom: `1.5px solid ${COLORS.blue}`, background: "none", outline: "none", fontFamily: SYSTEM_FONT, color: COLORS.label, padding: "0 0 2px" },
  taskBadge: { fontSize: 10.5, fontWeight: 600, borderRadius: 20, padding: "2px 7px", flexShrink: 0 },
  taskBadgeDue: { background: COLORS.fill, color: COLORS.secondaryLabel },
  taskBadgeOverdue: { background: "rgba(255,59,48,0.12)", color: COLORS.red },
  taskBadgeStale: { fontSize: 10.5, fontWeight: 600, borderRadius: 20, padding: "2px 7px", background: "rgba(255,149,0,0.12)", color: "#8A5A00", flexShrink: 0 },
  addTaskBlock: { display: "flex", flexDirection: "column", gap: 6 },
  addTaskRow: { display: "flex", alignItems: "center", gap: 10 },
  addTaskInput: { flex: 1, border: "none", background: "none", fontSize: 15, fontFamily: SYSTEM_FONT, outline: "none", color: COLORS.label, padding: "4px 0" },
  dueToggleBtn: { background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 },
  dateInput: { border: "none", background: COLORS.fill, borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: SYSTEM_FONT, color: COLORS.label, alignSelf: "flex-start" },
  backfillWarning: { fontSize: 12.5, color: "#8A5A00", background: "rgba(255,149,0,0.1)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.4 },

  weeklySummaryLine: { fontSize: 13, color: COLORS.secondaryLabel, marginBottom: 2 },
  weeklyRow: { display: "flex", alignItems: "center", gap: 10 },
  weeklyName: { flex: 1, fontSize: 14.5, color: COLORS.label, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  weeklyDots: { display: "flex", gap: 4, flexShrink: 0 },
  weeklyCount: { fontFamily: MONO_FONT, fontSize: 12.5, color: COLORS.secondaryLabel, flexShrink: 0, minWidth: 32, textAlign: "right" },

  historyRow: { display: "flex", gap: 12, fontSize: 13.5 },
  historyDate: { fontFamily: MONO_FONT, color: COLORS.secondaryLabel, minWidth: 54, flexShrink: 0 },
  historyNote: { color: COLORS.label },

  addProjectRow: { width: "100%", background: "none", border: "none", display: "flex", alignItems: "center", gap: 10, padding: "2px 0", cursor: "pointer", fontSize: 16, fontFamily: SYSTEM_FONT },

  reorderHint: { fontSize: 13, color: COLORS.secondaryLabel, marginBottom: 10 },
  reorderRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${COLORS.separator}` },
  reorderName: { flex: 1, fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  reorderArchivedTag: { fontSize: 10.5, color: COLORS.tertiaryLabel, marginLeft: 6, fontWeight: 400 },
  reorderArrows: { display: "flex", gap: 12, flexShrink: 0 },

  footnote: { fontSize: 12, color: COLORS.tertiaryLabel, lineHeight: 1.5, padding: "10px 6px 0" },
};
