# ASTRA MT5 Ω — 3 EA research builds (2026-11-12)

This folder is ISOLATED. Production trading systems, portfolio sites and default branch have NOT been modified.

## Provenance

The three strategies were recovered from connected user-authorized Gmail:
- "invention trading gold goat mt5 verifié deepseek", 2025-09-24 → AstraGoldScalperSMC.mq5
- "invention trading atr divergence rsi gold goat vwap", 2025-09-24 → AstraGoldATRRSIVWAP.mq5
- "Invention trading ict smc", 2025-08-14 → AstraGoldICTSMC.mq5

**RECONSTRUCTIONS, not byte-identical transcriptions.** They retain broad signal families while repairing observable programming/logic failures: MT4 arrays in MQL5, uncontrolled pyramiding, invalid lookahead/structure detection, lot sizing and daily equity gates. The prior proxy simulation cannot validate these new codes.

## Proof policy

- Commit three EAs to an isolated branch: PASS when GitHub confirms and GET verifies.
- Static checks: PARTIAL, not MetaEditor compilation.
- Native MetaEditor64 compilation: UNVERIFIED without actual log and .ex5 artifact.
- MT5 Strategy Tester with broker real ticks: UNVERIFIED without actual HTML report.
- Real broker profit, commissions and maximal equity drawdown: UNVERIFIED until audit.
- Real-money trading: NOT AUTHORIZED.

## Native MetaEditor compilation

The separate Windows workflow .github/workflows/astra-mt5-compile.yml
installs official MetaTrader 5 in silent portable mode (automatic install
supported by MetaQuotes), launches terminal once to unpack the standard library,
compiles all three sources, and uploads the real compiler logs and binaries.
This is only a compilation check; it cannot certify profitability.

## Broker-specific historical testing

On an authorized Windows demo VM with MT5 already authenticated against a demo
broker, open PowerShell in the astra-mt5 directory and execute:

    .\scripts\Run-Native-MT5-Backtests.ps1 -Mt5Directory 'C:\MT5-DEMO' -Symbol XAUUSD

The script recompiles each EA, launches all three sequential tests using
Model=4 (broker real ticks), and saves HTML reports and SHA-256 manifest.
This is a reproducible runner, NOT proof a test has been run.
No passwords or login secrets are placed in the repository.

Rank only on the same broker server/account category, symbol contract,
date range, leverage, spread, commission, swap, execution model, and tick
history. Report net profit in USD, profit factor, maximal EQUITY drawdown,
number of trades, % winners, trading costs, and out-of-sample performance.
A 0-trade run is not profitable.

## Previous historical proxy != this native test

Public data had 17,371 M5 XAUUSD candles, 2026-02-25 to 2026-05-26,
from github.com/Sai310421/xauusd-data, blob
c9174d1e8eaa1389049bd359050c4d50de48a14c.
It had no actual broker spreads and never executed original MQL5.
Never mix its figures into the native-broker ranking.
