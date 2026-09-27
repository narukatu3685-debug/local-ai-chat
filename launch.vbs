Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c """ & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\launch.bat""", 0, false
