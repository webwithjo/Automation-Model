Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
WshShell.Run "cmd /c node index.js >> agent.log 2>&1", 0, False
MsgBox "AI Email & Meeting Scheduling Agent is now running in the background!" & vbCrLf & "Logs are saved to agent.log", vbInformation, "Agent Started"
