"use client";
import { ThemeProvider } from "@mui/material/styles";
import { muiTheme } from "./muiTheme";

/**
 * Wraps the app in the MUI theme every table's `DataGrid` reads (ADR 0230), so the layout itself
 * doesn't need `"use client"` just to reach for it.
 */
export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return <ThemeProvider theme={muiTheme}>{children}</ThemeProvider>;
}
