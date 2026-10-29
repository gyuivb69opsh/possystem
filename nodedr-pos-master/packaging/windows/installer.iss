; Inno Setup script - builds Cafe-POS-Setup.exe from the staged folder "stage".
; Per-user install (no admin / UAC prompt). Customer data lives in {app}\backend\data
; and is NEVER overwritten or deleted by upgrades/uninstall.
#define AppName "Cafe POS"
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{B6F0C1E4-7A55-4D52-9C3B-2D0E6C9A71F3}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={localappdata}\{#AppName}
DefaultGroupName={#AppName}
PrivilegesRequired=lowest
OutputDir=..\..\dist
OutputBaseFilename=Cafe-POS-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
UninstallDisplayName={#AppName}

[Files]
Source: "..\..\stage\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion; Excludes: "backend\data\*"

[Dirs]
Name: "{app}\backend\data"

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\start-pos.cmd"; WorkingDir: "{app}"; Flags: runminimized
Name: "{group}\Stop {#AppName}"; Filename: "{app}\stop-pos.cmd"; WorkingDir: "{app}"; Flags: runminimized
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\start-pos.cmd"; WorkingDir: "{app}"; Flags: runminimized

[Run]
Filename: "{app}\start-pos.cmd"; Description: "Start {#AppName} now"; WorkingDir: "{app}"; Flags: postinstall nowait skipifsilent runminimized

[UninstallRun]
Filename: "{app}\stop-pos.cmd"; Flags: runhidden; RunOnceId: "StopPOS"
