"use client";

import { useRef, useState } from "react";
import { EDITOR_HISTORY_COALESCE_MS } from "./config.ts";
import {
  beginGesture,
  canRedoHistory,
  canUndoHistory,
  commitOpen,
  createHistorySession,
  noteEdit,
  pushEdit,
  redoHistory,
  undoHistory,
  updateGesture,
  type EditorHistoryEntry,
  type EditorHistoryScope,
  type HistoryEdit,
} from "./history.ts";

/** Session-only undo stack. Persistence stays in the caller. */
export function useEditorHistory(scope: EditorHistoryScope) {
  const session = useRef(createHistorySession());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [version, setVersion] = useState(0);

  function publish(next: typeof session.current) {
    session.current = next;
    setVersion((current) => current + 1);
  }

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function scheduleCommit() {
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      publish(commitOpen(session.current, scope));
    }, EDITOR_HISTORY_COALESCE_MS);
  }

  void version;

  return {
    push(edit: HistoryEdit) {
      clearTimer();
      publish(pushEdit(session.current, scope, edit));
    },
    note(edit: HistoryEdit) {
      const next = noteEdit(session.current, scope, edit);
      publish(next);
      if (next.open?.gesture) {
        clearTimer();
        return;
      }
      scheduleCommit();
    },
    beginGesture(edit: HistoryEdit) {
      clearTimer();
      publish(beginGesture(session.current, scope, edit));
    },
    updateGesture(after: unknown) {
      publish(updateGesture(session.current, after));
    },
    endGesture() {
      clearTimer();
      publish(commitOpen(session.current, scope));
    },
    undo(): EditorHistoryEntry | null {
      clearTimer();
      const result = undoHistory(session.current, scope);
      publish(result.session);
      return result.entry;
    },
    redo(): EditorHistoryEntry | null {
      clearTimer();
      const result = redoHistory(session.current, scope);
      publish(result.session);
      return result.entry;
    },
    clear() {
      clearTimer();
      publish(createHistorySession());
    },
    get canUndo() {
      return canUndoHistory(session.current);
    },
    get canRedo() {
      return canRedoHistory(session.current);
    },
  };
}
