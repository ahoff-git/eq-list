# Simulate Windows ending the session on ONE process, by PID: tell its windows the session is ending
# (WM_ENDSESSION, which Electron turns into `session-end`), then end the process the way the OS would.
#
# Two phases so the caller controls the timing. Compiling the helper takes a second or more, and the
# whole point of the probe is that the stores' debounce timers (0.4 - 2 s) have NOT fired yet when the
# session ends — so everything slow happens first, then this waits on stdin for the caller to say "go".
#
#   1. prints "ready <n>" (n = top-level windows found for the PID), then reads one line from stdin
#   2. sends WM_ENDSESSION to every one of those windows, waits for each to answer, ends the process
#
# It is handed a PID and touches only that PID. It never looks processes up by command line.
param([Parameter(Mandatory = $true)][uint32]$ProcessId)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SessionWin {
  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@

$handles = New-Object System.Collections.Generic.List[IntPtr]
$collect = [SessionWin+EnumProc]{
  param($h, $l)
  $owner = 0
  [void][SessionWin]::GetWindowThreadProcessId($h, [ref]$owner)
  if ($owner -eq $ProcessId) { $handles.Add($h) }
  $true
}
[void][SessionWin]::EnumWindows($collect, [IntPtr]::Zero)

[Console]::Out.WriteLine("ready $($handles.Count)")
[Console]::Out.Flush()
$null = [Console]::In.ReadLine()

$WM_ENDSESSION = 0x16
$ENDSESSION_LOGOFF = [IntPtr]([int64]0x80000000)
$SMTO_ABORTIFHUNG = 2
foreach ($h in $handles) {
  $result = [IntPtr]::Zero
  [void][SessionWin]::SendMessageTimeout($h, $WM_ENDSESSION, [IntPtr]1, $ENDSESSION_LOGOFF, $SMTO_ABORTIFHUNG, 1500, [ref]$result)
}
Stop-Process -Id $ProcessId -Force
[Console]::Out.WriteLine("ended")
