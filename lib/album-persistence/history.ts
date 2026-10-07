import { EDITOR_HISTORY_LIMIT } from "./config.ts";

export type EditorHistoryScope = "page" | "cover";

export type EditorHistoryField = "layout" | "crop" | "photo" | "title" | "subtitle" | "template" | "color" | "text" | "textStyle" | "decoration" | "element" | "background" | "recommendation";

/** User Override before/after. AI values are never copied into these fields. */
export type EditorHistoryEntry = {
  id: string;
  scope: EditorHistoryScope;
  targetId: string;
  field: EditorHistoryField;
  before: unknown;
  after: unknown;
  createdAt: number;
};

export type OpenHistoryEdit = {
  targetId: string;
  field: EditorHistoryField;
  before: unknown;
  after: unknown;
  gesture: boolean;
  createdAt: number;
};

export type HistorySession = {
  undo: EditorHistoryEntry[];
  redo: EditorHistoryEntry[];
  open: OpenHistoryEdit | null;
};

export type HistoryEdit = {
  targetId: string;
  field: EditorHistoryField;
  before: unknown;
  after: unknown;
};

let historyIds = 0;

function nextHistoryId() {
  historyIds += 1;
  return `history-${historyIds}`;
}

export function createHistorySession(): HistorySession {
  return { undo: [], redo: [], open: null };
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}

function canonicalize(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "number") return String(round(value));
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${key}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }
  return String(value);
}

export function historyValuesEqual(left: unknown, right: unknown) {
  return canonicalize(left) === canonicalize(right);
}

function pushEntry(session: HistorySession, entry: EditorHistoryEntry, limit = EDITOR_HISTORY_LIMIT): HistorySession {
  if (historyValuesEqual(entry.before, entry.after)) return { ...session, open: null };
  const undo = [...session.undo, entry];
  return {
    undo: undo.length > limit ? undo.slice(undo.length - limit) : undo,
    redo: [],
    open: null,
  };
}

export function commitOpen(session: HistorySession, scope: EditorHistoryScope, now = Date.now()): HistorySession {
  const open = session.open;
  if (!open) return session;
  return pushEntry(session, {
    id: nextHistoryId(),
    scope,
    targetId: open.targetId,
    field: open.field,
    before: open.before,
    after: open.after,
    createdAt: open.createdAt || now,
  });
}

export function noteEdit(session: HistorySession, scope: EditorHistoryScope, edit: HistoryEdit, now = Date.now()): HistorySession {
  if (session.open?.gesture && session.open.targetId === edit.targetId && session.open.field === edit.field) {
    return { ...session, open: { ...session.open, after: edit.after } };
  }
  let base = session;
  if (session.open && (session.open.targetId !== edit.targetId || session.open.field !== edit.field)) {
    base = commitOpen(session, scope, now);
  }
  if (base.open && base.open.targetId === edit.targetId && base.open.field === edit.field && !base.open.gesture) {
    const changed = !historyValuesEqual(base.open.before, edit.after);
    return {
      ...base,
      redo: changed ? [] : base.redo,
      open: { ...base.open, after: edit.after },
    };
  }
  const changed = !historyValuesEqual(edit.before, edit.after);
  return {
    ...base,
    redo: changed ? [] : base.redo,
    open: {
      targetId: edit.targetId,
      field: edit.field,
      before: edit.before,
      after: edit.after,
      gesture: false,
      createdAt: now,
    },
  };
}

export function beginGesture(session: HistorySession, scope: EditorHistoryScope, edit: HistoryEdit, now = Date.now()): HistorySession {
  const base = session.open ? commitOpen(session, scope, now) : session;
  return {
    ...base,
    open: {
      targetId: edit.targetId,
      field: edit.field,
      before: edit.before,
      after: edit.after,
      gesture: true,
      createdAt: now,
    },
  };
}

export function updateGesture(session: HistorySession, after: unknown): HistorySession {
  if (!session.open?.gesture) return session;
  const changed = !historyValuesEqual(session.open.before, after);
  return {
    ...session,
    redo: changed ? [] : session.redo,
    open: { ...session.open, after },
  };
}

export function pushEdit(session: HistorySession, scope: EditorHistoryScope, edit: HistoryEdit, now = Date.now(), limit = EDITOR_HISTORY_LIMIT): HistorySession {
  const base = session.open ? commitOpen(session, scope, now) : session;
  return pushEntry(
    base,
    {
      id: nextHistoryId(),
      scope,
      targetId: edit.targetId,
      field: edit.field,
      before: edit.before,
      after: edit.after,
      createdAt: now,
    },
    limit,
  );
}

export function undoHistory(session: HistorySession, scope: EditorHistoryScope, now = Date.now()) {
  const committed = commitOpen(session, scope, now);
  const entry = committed.undo[committed.undo.length - 1];
  if (!entry) return { session: committed, entry: null };
  return {
    session: {
      undo: committed.undo.slice(0, -1),
      redo: [...committed.redo, entry],
      open: null,
    },
    entry,
  };
}

export function redoHistory(session: HistorySession, scope: EditorHistoryScope, now = Date.now()) {
  const committed = commitOpen(session, scope, now);
  const entry = committed.redo[committed.redo.length - 1];
  if (!entry) return { session: committed, entry: null };
  return {
    session: {
      undo: [...committed.undo, entry],
      redo: committed.redo.slice(0, -1),
      open: null,
    },
    entry,
  };
}

export function canUndoHistory(session: HistorySession) {
  if (session.undo.length > 0) return true;
  return session.open != null && !historyValuesEqual(session.open.before, session.open.after);
}

export function canRedoHistory(session: HistorySession) {
  return session.redo.length > 0 && session.open == null;
}
