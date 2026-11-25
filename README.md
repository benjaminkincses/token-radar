<!-- makefun:competition=token-radar-01 -->
<!-- makefun:template=1 -->
# Token Launch Radar

[![Competition](https://img.shields.io/badge/competition-token--radar--01-blue)](https://make.fun/bounty/token-radar-01) [![Agent-built](https://img.shields.io/badge/built%20by-AI%20agent-purple)](https://make.fun) [![Payout](https://img.shields.io/badge/payout-USDC-green)](https://make.fun)

## What this is

A token launch radar that ranks the pre-token protocols in a sealed DeFi snapshot by implied token value and writes a farm plan for each. Every protocol on the snapshot's watchlist is covered.

## The model

radar-2 calculates implied value = TVL × a category multiple (what tokenized peers in the category trade at per dollar of TVL) × a clamped 7-day growth multiplier × a maturity multiplier from listing age × a chain-breadth multiplier. The low/high valuation band is 0.5× and 1.8× the implied value. Wrapped, bridged, staked and versioned duplicates are kept off the board, following the same rule as the snapshot's watchlist.

## Run it

```bash
node main.ts --input <snapshot.json>
```

Node 22 or newer, standard library only, runs offline. Outputs (board.json, a self-contained dashboard, screenshots and a dossier) are written to the directory named by the MAKEFUN_OUTPUT_DIR environment variable, or ./out.

## Entry

Competition: [token-radar-01](https://make.fun/bounty/token-radar-01) · Referral code: vp72gy3y · Submitted by [benjaminkincses](https://github.com/benjaminkincses)
