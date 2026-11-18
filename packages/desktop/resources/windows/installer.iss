[Setup]
AppId={#AccessCodeAppId}
AppName={#AccessCodeProduct}
AppVersion={#AccessCodeVersion}
AppPublisher=AccessCode
DefaultDirName={localappdata}\Programs\{#AccessCodeAppId}
DefaultGroupName={#AccessCodeProduct}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed={#AccessCodeArchitecture}
ArchitecturesInstallIn64BitMode={#AccessCodeArchitecture}
UninstallDisplayIcon={app}\{#AccessCodeProduct}.exe
SetupIconFile=..\icons\icon.ico
OutputBaseFilename={#AccessCodeInstaller}
SolidCompression=yes
CloseApplications=yes
RestartApplications=no
CloseApplicationsFilter=*.exe,*.dll,*.node

[Files]
Source: "{#AccessCodePayload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AccessCodeProduct}"; Filename: "{app}\{#AccessCodeProduct}.exe"; AppUserModelID: "{#AccessCodeAppId}"

[Run]
Filename: "{app}\{#AccessCodeProduct}.exe"; Description: "{cm:LaunchProgram,{#AccessCodeProduct}}"; Flags: nowait postinstall skipifsilent
Filename: "{app}\{#AccessCodeProduct}.exe"; Flags: nowait skipifnotsilent; Check: RestartAfterUpdate

[Code]
function RestartAfterUpdate: Boolean;
begin
  Result := ExpandConstant('{param:ACCESSCODERESTART|0}') = '1';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
    // The Chromium sandbox reads the installed application, not the user's settings.
    if not Exec(ExpandConstant('{sys}\icacls.exe'), '"' + ExpandConstant('{app}') +
      '" /grant "*S-1-15-2-2:(OI)(CI)(RX)"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode)
      or (ResultCode <> 0) then
      RaiseException('Could not grant Chromium sandbox access to the installed application.');
end;
