"use client";
import { crashBoundary } from "@/app/components/CrashBoundary";

/** Catches render crashes in the app window (and the map window, which nests under it). */
export default crashBoundary("the app window");
