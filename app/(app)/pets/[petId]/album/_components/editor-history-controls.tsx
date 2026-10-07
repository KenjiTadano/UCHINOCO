"use client";

import { useEffect, useRef } from "react";
import { Redo2, Undo2 } from "lucide-react";

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  disabled: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

/**
 * Text fields keep the browser's own undo.
 * Cmd/Ctrl+Z outside an input moves the editor history.
 */
export function EditorHistoryControls({ canUndo, canRedo, disabled, onUndo, onRedo }: Props) {
  const undoRef = useRef(onUndo);
  const redoRef = useRef(onRedo);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    undoRef.current = onUndo;
    redoRef.current = onRedo;
    disabledRef.current = disabled;
  }, [onUndo, onRedo, disabled]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (disabledRef.current) return;
      const meta = event.metaKey || event.ctrlKey;
      if (!meta || event.altKey || event.key.toLowerCase() !== "z") return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        const rangeInput = target instanceof HTMLInputElement && target.type === "range";
        if ((tag === "INPUT" && !rangeInput) || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      event.preventDefault();
      if (event.shiftKey) redoRef.current();
      else undoRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="editor-history" data-testid="editor-history">
      <button type="button" className="editor-history-button ds-focus" aria-label="元に戻す" data-testid="editor-undo" disabled={disabled || !canUndo} onClick={onUndo}>
        <Undo2 size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <button type="button" className="editor-history-button ds-focus" aria-label="やり直す" data-testid="editor-redo" disabled={disabled || !canRedo} onClick={onRedo}>
        <Redo2 size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
}
