/**
 * constants.ts — small shared constants used by both processes.
 */

/**
 * Global hotkey to show/hide the overlay. Works even when the overlay is
 * click-through or unfocused, so it's always possible to dismiss the float.
 * `accelerator` is the Electron globalShortcut form; `label` is for the UI.
 */
export const OVERLAY_HOTKEY = {
  accelerator: "CommandOrControl+Shift+O",
  label: "Ctrl/Cmd+Shift+O",
} as const;

/** Global hotkey to start a screengrab item lookup (region-select → OCR → wiki). */
export const LOOKUP_HOTKEY = {
  accelerator: "CommandOrControl+Shift+L",
  label: "Ctrl/Cmd+Shift+L",
} as const;
