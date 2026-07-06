"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { updateCanvasPageNotes } from "@/app/(app)/products/[id]/canvas-actions";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SAVE_DEBOUNCE_MS = 600;
/** Matches the server action's zod cap. */
const NOTES_MAX_LENGTH = 2000;

/**
 * Per-page notes, autosaved via `updateCanvasPageNotes` (debounced while
 * typing, flushed on blur/unmount — the pin-framing autosave pattern). The
 * text renders in the "PAGE NOTES" box beneath the slots on EVERY layer-page
 * exported from this canvas page; the label says so because that scope (page,
 * not annotation) is the one thing users must not have to guess.
 *
 * `onSaved` patches the parent's local page state as soon as a save is
 * dispatched (the annotations' optimistic no-refresh pattern) — so a remount
 * (fullscreen toggle swaps the whole tree) seeds from up-to-date props
 * instead of flashing back to the last server round-trip.
 *
 * Mount keyed by page id (see PageEditor) so switching pages resets the draft.
 */
export function PageNotesEditor({
  pageId,
  notes,
  onSaved,
}: {
  pageId: string;
  notes: string | null;
  onSaved: (notes: string) => void;
}) {
  const [draft, setDraft] = useState(notes ?? "");
  const [synced, setSynced] = useState(notes ?? "");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);
  // The last value HANDED to the server action (not the last confirmed one) —
  // a revert typed while a save is in flight must still be sent, or the
  // server keeps the in-flight text the user just backed out of. Null after
  // a failed save: server state unknown, so the next flush re-sends.
  const lastSentRef = useRef<string | null>((notes ?? "").trim());
  const flushRef = useRef<() => void>(() => {});

  // Render-time resync from the prop (our own save's revalidation coming back,
  // or an edit elsewhere) — but never while the draft holds unsaved edits.
  // Trimmed comparison: saves trim, so a trailing space in the draft is not
  // an unsaved edit and must not block resyncing forever.
  const incoming = notes ?? "";
  if (incoming !== synced) {
    if (draft.trim() === synced.trim()) setDraft(incoming);
    setSynced(incoming);
  }

  function persist(next: string) {
    const trimmed = next.trim();
    if (lastSentRef.current !== null && trimmed === lastSentRef.current) return;
    lastSentRef.current = trimmed;
    onSaved(next);
    void updateCanvasPageNotes(pageId, next).catch(() => {
      lastSentRef.current = null;
      // Leave the value queued (unless newer edits superseded it) so the next
      // blur/unmount flush retries instead of silently never persisting.
      if (pendingRef.current === null) pendingRef.current = next;
      toast.error("Could not save the page notes.");
    });
  }

  function flush() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pendingRef.current !== null) {
      const value = pendingRef.current;
      pendingRef.current = null;
      persist(value);
    }
  }

  useEffect(() => {
    flushRef.current = flush;
  });
  // A pending edit must not be lost when the editor unmounts (page switch,
  // fullscreen toggle) — flush it on the way out.
  useEffect(() => {
    return () => flushRef.current();
  }, []);

  function handleChange(value: string) {
    setDraft(value);
    pendingRef.current = value;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      pendingRef.current = null;
      persist(value);
    }, SAVE_DEBOUNCE_MS);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`page-notes-${pageId}`} className="text-xs">
        Page notes — appears on every layer&apos;s PDF page
      </Label>
      <Textarea
        id={`page-notes-${pageId}`}
        value={draft}
        maxLength={NOTES_MAX_LENGTH}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={flush}
        // Escape leaves the FIELD (blur flushes the draft), and claiming the
        // event keeps the fullscreen editor's exit-on-unclaimed-Escape from
        // also firing — first Esc leaves the notes, a second exits the editor.
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        placeholder="e.g. Wash before measuring — all tolerances ±0.5cm unless pinned"
        className="min-h-16"
      />
    </div>
  );
}
