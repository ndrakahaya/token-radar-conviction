# Token Radar — Conviction

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
![Rank](https://make.fun/badge/token-radar-01/ndrakahaya/token-radar-conviction/rank.svg)
![Reward](https://make.fun/badge/token-radar-01/ndrakahaya/token-radar-conviction/reward.svg)

A conviction-weighted research dashboard that ranks early protocol opportunities by implied value, pairing category-level leadership, bounded seven-day TVL growth, launch imminence, and multi-chain breadth. Conviction is a separate 0–100 confidence score that rewards leadership, growth, launch timing, and chain diversity. The board includes watchlist coverage, risk signals, protocol details, farm plans, filtering, sorting, and comparison. Research signals are not financial advice.

## Run

Use Node.js 22 or later and provide a snapshot JSON matching the expected protocol/watchlist input shape:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

The command writes `board.json`, dashboard assets, screenshots, and `dossier.json` into `out/`. To serve the generated dashboard locally, run a static server rooted at `out/` and open `dashboard/index.html`.

## Entry

Visit [token-radar-01 on make.fun](https://make.fun/c/token-radar-01).
