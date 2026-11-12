param(
  [Parameter(Mandatory=$true)][string]$Mt5Directory,
  [string]$Symbol="XAUUSD"
)
$ErrorActionPreference="Stop"
$root=Split-Path -Parent $PSScriptRoot
$editor=Join-Path $Mt5Directory "metaeditor64.exe"
$terminal=Join-Path $Mt5Directory "terminal64.exe"
$mql=Join-Path $Mt5Directory "MQL5"
if(-not(Test-Path $editor) -or -not(Test-Path $terminal)){
  throw "MT5/MetaEditor absent. Provide a valid Windows MT5 directory."
}
if(-not(Test-Path (Join-Path $mql "Include\Trade\Trade.mqh"))){
  throw "MT5 standard library absent. Launch terminal64.exe /portable once before running."
}
# This uses the previously authenticated broker/demo session in the isolated MT5 directory.
# Never store any broker password in the .ini or repository.
$include=Join-Path $mql "Include"
$expertDir=Join-Path $mql "Experts\ASTRA"
$reportDir=Join-Path $Mt5Directory "ASTRA_Reports"
New-Item -ItemType Directory -Force -Path $expertDir,$reportDir | Out-Null
Copy-Item (Join-Path $root "MQL5\Include\ASTRA_MT5_Common.mqh") $include -Force
Copy-Item (Join-Path $root "MQL5\Experts\*.mq5") $expertDir -Force
$names=@("AstraGoldScalperSMC","AstraGoldATRRSIVWAP","AstraGoldICTSMC")
$results=@()
foreach($name in $names){
  $src=Join-Path $expertDir ($name+".mq5")
  $ex5=Join-Path $expertDir ($name+".ex5")
  $log=Join-Path $expertDir ($name+".log")
  if(Test-Path $ex5){Remove-Item $ex5 -Force}
  Start-Process -FilePath $editor -ArgumentList ('/portable /compile:"{0}" /log' -f $src) -Wait
  if(-not(Test-Path $ex5)){
     if(Test-Path $log){Get-Content $log | Select-Object -Last 30 | Out-Host}
     throw "Native compiler FAILED: $name; see $log"
  }
  $config=Get-Content (Join-Path $root ("config\"+$name+".ini")) -Raw
  $config=$config -replace '(?m)^Symbol=.*$',("Symbol="+$Symbol)
  $config=$config -replace '(?m)^Report=.*$',("Report=ASTRA_Reports\"+$name)
  $configFile=Join-Path $Mt5Directory ($name+".ini")
  [IO.File]::WriteAllText($configFile,$config,[Text.Encoding]::ASCII)
  # Strictly no buy/sell LIVE: only Strategy Tester via an INI [Tester] section.
  Start-Process -FilePath $terminal -ArgumentList ('/portable /config:"{0}"' -f $configFile) -Wait
  $report=Join-Path $reportDir ($name+".htm")
  if(-not(Test-Path $report)){
     $results+=@{name=$name;status="FAIL_NO_NATIVE_REPORT";report=$report}
     continue
  }
  $bytes=[IO.File]::ReadAllBytes($report)
  if($bytes.Length -lt 1000){
     $results+=@{name=$name;status="FAIL_EMPTY_REPORT";report=$report}
     continue
  }
  $results+=@{
    name=$name;status="REPORT_EXISTS_NEEDS_METRIC_AUDIT";
    report=$report;report_sha256=(Get-FileHash $report -Algorithm SHA256).Hash;
    source_sha256=(Get-FileHash $src -Algorithm SHA256).Hash;
    ex5_sha256=(Get-FileHash $ex5 -Algorithm SHA256).Hash
  }
}
$results | ConvertTo-Json -Depth 5 | Out-File (Join-Path $reportDir "astra-run-manifest.json") -Encoding utf8
$results | Format-Table -AutoSize | Out-Host
if(($results | Where-Object {$_.status -ne "REPORT_EXISTS_NEEDS_METRIC_AUDIT"}).Count -gt 0) {exit 2}
Write-Host "Native reports exist. Profit/drawdown remain UNVERIFIED until parsed and checked."
