# Oppsett for «Publiser Designporten» på Windows (docs/publisering-lokalt.md).
# Kjøres av Oppsett.bat. Gjør ingenting på serveren.
$ErrorActionPreference = 'Stop'
$rot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $rot
Write-Host "=== Oppsett: Publiser Designporten ===`n"

$mangler = @()
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { $mangler += 'Git.Git' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $mangler += 'OpenJS.NodeJS.LTS' }
if ($mangler.Count) {
  Write-Host "Mangler: $($mangler -join ', ')"
  Write-Host "Installer i PowerShell med:  winget install $($mangler -join ' ')"
  Write-Host "Lukk vinduet etterpå, og kjør Oppsett på nytt."
  exit 1
}
$versjon = [int]((node --version).TrimStart('v').Split('.')[0])
if ($versjon -lt 22) {
  Write-Host "Node $versjon er for gammel; trenger 22 eller nyere. Kjør:  winget upgrade OpenJS.NodeJS.LTS"
  exit 1
}

Write-Host "▶ Installerer pakker (tar et par minutter første gang)"
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Write-Host "npm ci feilet."; exit 1 }

if (-not (Test-Path '.env.publisering')) {
  Copy-Item '.env.publisering.example' '.env.publisering'
  Write-Host "`n▶ Fyll inn brukernavn og passord fra one.com i Notisblokk, lagre og lukk."
  Start-Process notepad.exe '.env.publisering' -Wait
} else {
  Write-Host "`n.env.publisering finnes allerede; den er ikke endret."
}

$skrivebord = [Environment]::GetFolderPath('Desktop')
$snarvei = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $skrivebord 'Publiser Designporten.lnk'))
$snarvei.TargetPath = Join-Path $rot 'verktoy\windows\Publiser Designporten.bat'
$snarvei.WorkingDirectory = "$rot"
$snarvei.IconLocation = "$env:SystemRoot\System32\shell32.dll,238"
$snarvei.Description = 'Test, bygg og last opp designporten.no'
$snarvei.Save()
Write-Host "`n✔ Ferdig. Snarveien «Publiser Designporten» ligger på skrivebordet."
