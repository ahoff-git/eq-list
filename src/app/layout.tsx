import type { Metadata } from "next";
import "./globals.css";

// System font stack (see globals.css) instead of next/font — the renderer is
// bundled into a desktop app and shouldn't depend on fetching web fonts.
export const metadata: Metadata = {
  title: "EQ List",
  description: "Loot shopping-list overlay for EverQuest Legends, sourced from eqlwiki.com.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
