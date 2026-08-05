"use client";
import "./globals.css";
import { crashBoundary } from "./components/CrashBoundary";

/**
 * The last-resort boundary: a crash in the root layout itself, which replaces the whole
 * document — hence the <html>/<body> and the explicit stylesheet import (the root layout
 * that normally supplies them is what just failed).
 */
const Notice = crashBoundary("the window shell");

export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <Notice {...props} />
      </body>
    </html>
  );
}
