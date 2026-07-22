"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import SearchPanel from "./components/SearchPanel";
import ListPanel from "./components/ListPanel";
import SettingsPanel from "./components/SettingsPanel";
import SessionPanel from "./components/SessionPanel";
import StatusBar from "./components/StatusBar";
import LandingView from "./components/LandingView";
import { useShoppingList } from "@/lib/hooks";
import { OVERLAY_HOTKEY } from "@/shared/constants";

type Tab = "list" | "search" | "session" | "settings";

/** The control window: manage the shopping list, search the wiki, tweak settings. */
export default function Home() {
  const [tab, setTab] = useState<Tab>("list");
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(null);
  // Undetermined until mounted (keeps SSR/first-client render consistent).
  const [inElectron, setInElectron] = useState<boolean | null>(null);
  const list = useShoppingList();

  useEffect(() => {
    setInElectron(!!api());
  }, []);

  // A screengrab lookup fills the Search box with OCR'd text and jumps here.
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.search.onPrefill((text) => {
      setTab("search");
      setPrefill({ text, n: Date.now() });
    });
  }, []);

  if (inElectron === null) return null; // brief pre-mount frame
  if (!inElectron) return <LandingView />;

  return (
    <div className="app">
      <div className="titlebar">
        <h1>
          <span className="mark">EQ</span> List
        </h1>
        <span className="spacer" />
        <button
          className="btn sm"
          title={`Toggle any time with ${OVERLAY_HOTKEY.label}`}
          onClick={() => api()?.overlay.open()}
        >
          ⧉ Open overlay
        </button>
        <span className="muted small">{OVERLAY_HOTKEY.label} toggles</span>
      </div>

      <div className="tabs">
        <button className={tabCls(tab, "list")} onClick={() => setTab("list")}>
          List{list.entries.length ? ` (${list.entries.length})` : ""}
        </button>
        <button className={tabCls(tab, "search")} onClick={() => setTab("search")}>
          Search
        </button>
        <button className={tabCls(tab, "session")} onClick={() => setTab("session")}>
          Session
        </button>
        <button className={tabCls(tab, "settings")} onClick={() => setTab("settings")}>
          Settings
        </button>
      </div>

      <div className="panel">
        {tab === "list" && <ListPanel />}
        {tab === "search" && <SearchPanel prefill={prefill} />}
        {tab === "session" && <SessionPanel />}
        {tab === "settings" && <SettingsPanel />}
      </div>

      <StatusBar />
    </div>
  );
}

function tabCls(active: Tab, tab: Tab): string {
  return `tab ${active === tab ? "active" : ""}`;
}
