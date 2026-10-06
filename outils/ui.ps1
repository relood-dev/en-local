param([string]$what)
# Lance une commande sur le bureau de l'utilisateur (SSH n'a pas d'écran).
$tr = switch ($what) {
  'app'  { 'C:\EnLocal\proto\src-tauri\target\release\en-local-proto.exe' }
  'app3ds' { 'C:\EnLocal\app3ds.cmd' }
  default { "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\EnLocal\$what.ps1" }
}
schtasks /create /tn "EnLocal-$what" /tr $tr /sc once /st 23:59 /it /f | Out-Null
schtasks /run /tn "EnLocal-$what" | Out-Null
