<!-- makefun:competition=token-radar-01 -->
<!-- makefun:template=1 -->
# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/benjaminkincses/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/benjaminkincses/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that ranks the pre-token protocols in a sealed DeFi snapshot by implied token value and writes a farm plan for each. Every protocol on the snapshot's watchlist is covered.

The model (radar-2) calculates implied value = TVL × a category multiple (what tokenized peers in the category trade at per dollar of TVL) × a clamped 7-day growth multiplier × a maturity multiplier from listing age × a chain-breadth multiplier. The low/high valuation band is 0.5× and 1.8× the implied value. Wrapped, bridged, staked and versioned duplicates are kept off the board, following the same rule as the snapshot's watchlist.

The build also writes a self-contained dashboard (board, per-protocol detail with the model breakdown and farm plan, and a live-tokens view) plus screenshots and a dossier to the output directory.

## Run it

```sh
node main.ts --input <snapshot.json>
```

Node 22 or newer, standard library only, runs offline. Outputs (board.json, the dashboard, screenshots and a dossier) are written to the directory named by the MAKEFUN_OUTPUT_DIR environment variable, or ./out.

---

<sub>Entered on [make.fun](https://make.fun/?ref=vp72gy3y&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
