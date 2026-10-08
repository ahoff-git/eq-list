"use client";
import { crashBoundary } from "@/app/components/chrome/CrashBoundary";

/** The cast-alert overlay is click-through and covers a whole monitor: log, draw nothing. */
export default crashBoundary("the alert overlay", { visible: false });
