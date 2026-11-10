# Freeze (or thaw) ONE process by PID, so the suite can prove its "is main still answering?" probe really
# goes red when main stops answering. A suspended Electron main process cannot serve the debugging
# port, which is exactly what a hung main looks like from outside.
param([Parameter(Mandatory = $true)][int]$ProcessId, [switch]$Resume)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Freezer {
  [DllImport("ntdll.dll")] public static extern uint NtSuspendProcess(IntPtr handle);
  [DllImport("ntdll.dll")] public static extern uint NtResumeProcess(IntPtr handle);
}
"@

$process = [System.Diagnostics.Process]::GetProcessById($ProcessId)
if ($Resume) { [void][Freezer]::NtResumeProcess($process.Handle) } else { [void][Freezer]::NtSuspendProcess($process.Handle) }
