"use client";
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

export interface ReorderOptions {
  /**
   * The keys that sit in the same place as `key`, in the order they are drawn — including `key`. What a row may
   * be dropped on, and who its neighbours are for the keyboard. Empty (or not containing it) means it can't move.
   */
  siblingsOf: (key: string) => readonly string[];
  /** Put `key` just before `targetKey`, or just after it. The caller decides what that does to the data. */
  onMove: (key: string, targetKey: string, after: boolean) => void;
}

/** What a drag handle is given, and what the thing it moves is given — spread onto the elements. */
export interface Reorder {
  /** For the grip: it starts the drag, and the arrow keys move it too (Alt+↑ / Alt+↓). */
  handle: (key: string) => {
    draggable: true;
    "data-reorder-handle": string;
    onDragStart: (e: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  };
  /**
   * For the element that is dropped *on* — usually the whole row or group the grip belongs to. `props` are
   * spread onto it; `mark` is a class to add to its own (while it is being dragged, or a drop would land
   * before or after it) — separate so spreading can't replace the element's other classes.
   */
  target: (key: string) => {
    mark: string;
    props: {
      "data-reorder": string;
      onDragOver: (e: DragEvent<HTMLElement>) => void;
      onDragLeave: (e: DragEvent<HTMLElement>) => void;
      onDrop: (e: DragEvent<HTMLElement>) => void;
    };
  };
}

const MARK = {
  dragging: "reorder-dragging",
  before: "drop-before",
  after: "drop-after",
};

/**
 * Drag-to-reorder for one kind of thing in a list (rows, or groups), with a keyboard way to do the same — native
 * HTML drag-and-drop, which is all a vertical list in one window needs. It owns what is being dragged and where
 * it would land; it knows nothing about what a move *means* (`onMove`) or who may sit beside whom (`siblingsOf`),
 * which is how one hook serves both the rows of a group and the groups of the list.
 *
 * Two instances never see each other's drags: a row dropped over a group is not a group being moved, because
 * the group's hook has nothing in flight.
 */
export function useReorder({ siblingsOf, onMove }: ReorderOptions): Reorder {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ key: string; after: boolean } | null>(null);
  // After a keyboard move the grip's element is re-parented as the list redraws, which drops focus with it;
  // the key to give focus back to is remembered here and used once the new order has rendered.
  const refocus = useRef<string | null>(null);

  useEffect(() => {
    const key = refocus.current;
    if (key === null) return;
    const grip = Array.from(document.querySelectorAll<HTMLElement>("[data-reorder-handle]")).find((el) => el.dataset.reorderHandle === key);
    if (grip) {
      refocus.current = null;
      grip.focus();
    }
  });

  const clear = () => {
    setDragging(null);
    setOver(null);
  };

  /** Whether the drag in flight may land on `key`. */
  const landsOn = (key: string): boolean => dragging !== null && dragging !== key && siblingsOf(dragging).includes(key);

  return {
    handle: (key) => ({
      draggable: true,
      "data-reorder-handle": key,
      onDragStart: (e) => {
        // The grip lives inside the thing it moves (and that may itself sit inside another draggable's group), so the
        // drag is the grip's alone and its picture is the whole row.
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", key);
        const thing = e.currentTarget.closest("[data-reorder]");
        if (thing) e.dataTransfer.setDragImage(thing, 12, 12);
        setDragging(key);
      },
      onDragEnd: clear,
      onKeyDown: (e) => {
        if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        e.preventDefault();
        e.stopPropagation();
        const siblings = siblingsOf(key);
        const down = e.key === "ArrowDown";
        const neighbour = siblings[siblings.indexOf(key) + (down ? 1 : -1)];
        if (siblings.indexOf(key) < 0 || neighbour === undefined) return;
        refocus.current = key;
        onMove(key, neighbour, down);
      },
    }),
    target: (key) => ({
      mark: [dragging === key ? MARK.dragging : "", over?.key === key ? (over.after ? MARK.after : MARK.before) : ""]
        .filter(Boolean)
        .join(" "),
      props: {
        "data-reorder": key,
        onDragOver: (e) => {
          if (!landsOn(key)) return;
          // Without this the browser refuses the drop, and the drag reads as "not allowed" over everything.
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          const box = e.currentTarget.getBoundingClientRect();
          const after = e.clientY > box.top + box.height / 2;
          if (over?.key !== key || over.after !== after) setOver({ key, after });
        },
        onDragLeave: (e) => {
          // Moving between the target's own children also leaves it; only leaving it for good clears the mark.
          if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
          if (over?.key === key) setOver(null);
        },
        onDrop: (e) => {
          if (!landsOn(key) || dragging === null || over?.key !== key) return;
          e.preventDefault();
          e.stopPropagation();
          onMove(dragging, key, over.after);
          clear();
        },
      },
    }),
  };
}
