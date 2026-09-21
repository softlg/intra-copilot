# Native Input Host

The optional native host implements `SYSTEM_TRUSTED` browser operation. It moves the
real operating-system pointer and sends trusted keyboard input. The extension asks
the user for explicit confirmation when the selected permission mode requires it.

On Windows, install the host for a development extension:

```powershell
.\native-host\install.ps1 -ExtensionId YOUR_EXTENSION_ID
```

The installer writes the host manifest for Chrome and Edge and points the registry
entry at `native-host\host.cmd`. Restart the browser after installation.

macOS deployments need to package `host.js` as an executable or wrap it in the
native host application bundle and place `com.intra_copilot.input.json` under
`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`. The host uses
AppleScript System Events and therefore requires Accessibility permission.

`SYSTEM_TRUSTED` is intentionally opt-in. Most tasks should use `VISIBLE_VIRTUAL`
or `BROWSER_TRUSTED`, which do not move the user's physical mouse.
