"use client";
import { crashBoundary } from "../components/CrashBoundary";

/** The cast-alert overlay is click-through and covers a whole monitor: log, draw nothing. */
export default crashBoundary("the alert overlay", { visible: false });
