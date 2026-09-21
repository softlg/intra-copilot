param(
  [Parameter(Mandatory = $true)]
  [string]$PayloadBase64
)

$ErrorActionPreference = "Stop"
$message = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PayloadBase64)) | ConvertFrom-Json
$rect = $message.rect
$x = [int][Math]::Round([double]$rect.screenX)
$y = [int][Math]::Round([double]$rect.screenY)
$action = [string]$message.action
$arguments = $message.arguments

if (-not ("IntraCopilotInput" -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class IntraCopilotInput {
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public int type; public InputUnion U; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint MOUSEEVENTF_WHEEL = 0x0800;
  public const uint KEYEVENTF_KEYUP = 0x0002;
  public const uint KEYEVENTF_UNICODE = 0x0004;
}
"@
}

function Move-And-Click {
  [IntraCopilotInput]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 80
  $inputs = @(
    New-Object IntraCopilotInput+INPUT -Property @{
      type = 0
      U = New-Object IntraCopilotInput+InputUnion -Property @{
        mi = New-Object IntraCopilotInput+MOUSEINPUT -Property @{
          dwFlags = [IntraCopilotInput]::MOUSEEVENTF_LEFTDOWN
        }
      }
    },
    New-Object IntraCopilotInput+INPUT -Property @{
      type = 0
      U = New-Object IntraCopilotInput+InputUnion -Property @{
        mi = New-Object IntraCopilotInput+MOUSEINPUT -Property @{
          dwFlags = [IntraCopilotInput]::MOUSEEVENTF_LEFTUP
        }
      }
    }
  )
  [IntraCopilotInput]::SendInput($inputs.Length, $inputs, [Runtime.InteropServices.Marshal]::SizeOf([type][IntraCopilotInput+INPUT])) | Out-Null
}

function Send-Key([int]$vk, [bool]$ctrl = $false, [bool]$shift = $false) {
  $down = 0
  if ($ctrl) {
    $down = $down -bor 0x0002
    [IntraCopilotInput]::SendInput(1, @(New-Object IntraCopilotInput+INPUT -Property @{ type = 1; U = New-Object IntraCopilotInput+InputUnion -Property @{ ki = New-Object IntraCopilotInput+KEYBDINPUT -Property @{ wVk = 0x11 } } }), [Runtime.InteropServices.Marshal]::SizeOf([type][IntraCopilotInput+INPUT])) | Out-Null
  }
  if ($shift) {
    [IntraCopilotInput]::SendInput(1, @(New-Object IntraCopilotInput+INPUT -Property @{ type = 1; U = New-Object IntraCopilotInput+InputUnion -Property @{ ki = New-Object IntraCopilotInput+KEYBDINPUT -Property @{ wVk = 0x10 } } }), [Runtime.InteropServices.Marshal]::SizeOf([type][IntraCopilotInput+INPUT])) | Out-Null
  }
  $inputs = @(
    New-Object IntraCopilotInput+INPUT -Property @{ type = 1; U = New-Object IntraCopilotInput+InputUnion -Property @{ ki = New-Object IntraCopilotInput+KEYBDINPUT -Property @{ wVk = $vk } } },
    New-Object IntraCopilotInput+INPUT -Property @{ type = 1; U = New-Object IntraCopilotInput+InputUnion -Property @{ ki = New-Object IntraCopilotInput+KEYBDINPUT -Property @{ wVk = $vk; dwFlags = [IntraCopilotInput]::KEYEVENTF_KEYUP } } }
  )
  [IntraCopilotInput]::SendInput($inputs.Length, $inputs, [Runtime.InteropServices.Marshal]::SizeOf([type][IntraCopilotInput+INPUT])) | Out-Null
  if ($shift) {
    [IntraCopilotInput]::SendInput(1, @(New-Object IntraCopilotInput+INPUT -Property @{ type = 1; U = New-Object IntraCopilotInput+InputUnion -Property @{ ki = New-Object IntraCopilotInput+KEYBDINPUT -Property @{ wVk = 0x10; dwFlags = [IntraCopilotInput]::KEYEVENTF_KEYUP } } }), [Runtime.InteropServices.Marshal]::SizeOf([type][IntraCopilotInput+INPUT])) | Out-Null
  }
  if ($ctrl) {
    [IntraCopilotInput]::SendInput(1, @(New-Object IntraCopilotInput+INPUT -Property @{ type = 1; U = New-Object IntraCopilotInput+InputUnion -Property @{ ki = New-Object IntraCopilotInput+KEYBDINPUT -Property @{ wVk = 0x11; dwFlags = [IntraCopilotInput]::KEYEVENTF_KEYUP } } }), [Runtime.InteropServices.Marshal]::SizeOf([type][IntraCopilotInput+INPUT])) | Out-Null
  }
}

function Send-UnicodeText([string]$text) {
  foreach ($character in $text.ToCharArray()) {
    $code = [int][char]$character
    $inputs = @(
      New-Object IntraCopilotInput+INPUT -Property @{ type = 1; U = New-Object IntraCopilotInput+InputUnion -Property @{ ki = New-Object IntraCopilotInput+KEYBDINPUT -Property @{ wScan = $code; dwFlags = [IntraCopilotInput]::KEYEVENTF_UNICODE } } },
      New-Object IntraCopilotInput+INPUT -Property @{ type = 1; U = New-Object IntraCopilotInput+InputUnion -Property @{ ki = New-Object IntraCopilotInput+KEYBDINPUT -Property @{ wScan = $code; dwFlags = ([IntraCopilotInput]::KEYEVENTF_UNICODE -bor [IntraCopilotInput]::KEYEVENTF_KEYUP) } } }
    )
    [IntraCopilotInput]::SendInput($inputs.Length, $inputs, [Runtime.InteropServices.Marshal]::SizeOf([type][IntraCopilotInput+INPUT])) | Out-Null
  }
}

function Clear-FocusedInput {
  Send-Key 65 $true
  Send-Key 8
}

switch ($action) {
  "CLICK" { Move-And-Click }
  "FOCUS" { Move-And-Click }
  "HOVER" { [IntraCopilotInput]::SetCursorPos($x, $y) | Out-Null }
  "CHECK" { Move-And-Click }
  "UNCHECK" { Move-And-Click }
  "CLEAR" { Move-And-Click; Clear-FocusedInput }
  "TYPE" { Move-And-Click; Clear-FocusedInput; Send-UnicodeText ([string]$arguments.value) }
  "FILL" { Move-And-Click; Clear-FocusedInput; Send-UnicodeText ([string]$arguments.value) }
  "SET_EDITOR" { Move-And-Click; Clear-FocusedInput; Send-UnicodeText ([string]$arguments.code) }
  "PRESS_KEY" {
    $key = [string]$arguments.key
    $keyMap = @{ "ENTER" = 13; "TAB" = 9; "ESC" = 27; "ESCAPE" = 27; "SPACE" = 32; "BACKSPACE" = 8; "DELETE" = 46; "ARROWUP" = 38; "ARROWDOWN" = 40; "ARROWLEFT" = 37; "ARROWRIGHT" = 39 }
    $normalized = $key.ToUpperInvariant()
    if (-not $keyMap.ContainsKey($normalized)) { throw "Unsupported key: $key" }
    Send-Key $keyMap[$normalized] ($key -match "Ctrl|Control") ($key -match "Shift")
  }
  "SCROLL" {
    $delta = [int]([double]$arguments.deltaY)
    $inputs = @(New-Object IntraCopilotInput+INPUT -Property @{
      type = 0
      U = New-Object IntraCopilotInput+InputUnion -Property @{
        mi = New-Object IntraCopilotInput+MOUSEINPUT -Property @{
          mouseData = [uint32](-$delta)
          dwFlags = [IntraCopilotInput]::MOUSEEVENTF_WHEEL
        }
      }
    })
    [IntraCopilotInput]::SendInput($inputs.Length, $inputs, [Runtime.InteropServices.Marshal]::SizeOf([type][IntraCopilotInput+INPUT])) | Out-Null
  }
  default { throw "Unsupported native action: $action" }
}
