# Create a "Local AI" shortcut on the desktop (called from setup.bat).
# Paths are resolved from this script's location, so the folder can live anywhere.
$root = $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $desktop 'Local AI.lnk'))
$lnk.TargetPath = 'wscript.exe'
$lnk.Arguments = '"' + (Join-Path $root 'launch.vbs') + '"'
$lnk.WorkingDirectory = $root
$lnk.IconLocation = Join-Path $root 'app_icon.ico'
$lnk.Description = 'Local AI - Premium Chat Client'
$lnk.Save()
Write-Host "Shortcut created: $desktop\Local AI.lnk"
