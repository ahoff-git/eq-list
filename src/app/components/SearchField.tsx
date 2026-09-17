"use client";
import { TextField } from "./ui";

/**
 * SearchField.tsx — the plain text box every "type to narrow this list" filter uses. Extracted from
 * the Achievements tab's own per-row criteria filter, which was this exact markup with its own
 * `useState` beside it; now shared with the fuzzy filters `useFuzzyFilter` drives on the
 * Achievements and Faction tabs, so a third one is a prop, not a fourth copy of the input.
 */
export default function SearchField({
  value,
  onChange,
  placeholder = "Search…",
  className = "field",
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "placeholder" | "className">) {
  return <TextField {...rest} className={className} placeholder={placeholder} value={value} onChange={onChange} />;
}
