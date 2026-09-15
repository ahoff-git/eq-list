"use client";
import { createTheme } from "@mui/material/styles";

/**
 * A dark theme built off globals.css's own palette, so a DataGrid doesn't look like a different
 * application dropped into this one (ADR 0230). Colors are literal hex rather than `var(--x)`
 * lookups — MUI feeds this theme to components that can render outside the DOM subtree those CSS
 * custom properties are scoped to (portals, popovers), where a `var()` read would silently resolve
 * to nothing rather than fail loudly.
 */
export const muiTheme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#0e1013", paper: "#171a1f" },
    text: { primary: "#e6e8ec", secondary: "#99a1ad" },
    primary: { main: "#f0b429" },
    success: { main: "#46c86b" },
    error: { main: "#e5534b" },
    divider: "#2a2f38",
  },
  typography: {
    fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
    fontSize: 13,
  },
  shape: { borderRadius: 4 },
});
