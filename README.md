# Agentic Arbitrage Command Center

A professional, sophisticated cryptocurrency trading system consisting of a **dark-mode React-style dashboard frontend** and a **robust asynchronous Python execution engine**. Designed for visualizing and operating an AI-driven, delta-neutral funding rate arbitrage strategy across multiple exchanges.

---

## Project Structure

```
agentic-arbitrage-dashboard/
├── index.html          # Dashboard frontend — main HTML layout
├── styles.css          # Design system — dark theme, glow effects, animations
├── chart.js            # Canvas engine — live funding rate spread chart
├── app.js              # Frontend logic — live simulation, logs, positions
├── engine/             # Python execution engine
│   ├── __init__.py
│   ├── config.py       # Immutable configuration dataclass
│   ├── telemetry.py    # Structured JSON telemetry emitter
│   ├── state_machine.py# Agent FSM (IDLE → SCANNING → AMBUSH → EXECUTING → ACTIVE_CYCLE → LIQUIDATING)
│   ├── engine.py       # Core async engine — 3 concurrent loops + kill switch
│   ├── main.py         # CLI entry point with argparse
│   └── requirements.txt
└── README.md
```

---

## Frontend Dashboard

A dense, high-information trading terminal built with vanilla HTML, CSS, and JavaScript. No frameworks required — just open `index.html` in any modern browser.

### Features

- **Top Header**: Real-time BTC/USDT price ticker, wallet balance, notifications, user profile.
- **Left Sidebar**: Navigation menu with active strategy panel (Delta-Neutral Funding Rate, `MAX RISK: 15%`).
- **Strategy Context Cards**: Active Agents, Opportunities Scanned, Executions, 24h P&L, Total Profit.
- **Live Funding Rate Spread Chart**: Canvas-rendered with glowing cyan (actual) and gold (AI-predicted) lines, arb threshold, volume bars.
- **Agent Orchestrator Logs**: Terminal-style feed with color-coded SCAN → ANALYZE → ORCHESTRATE → EXECUTE entries.
- **Active Positions Table**: Live P&L, funding P&L, duration, and interactive Close Position buttons.
- **Anti-Gravity Effects**: Floating particles, pulsing glow borders, CRT scan lines, gradient edge lighting.

---

## Python Execution Engine

An async arbitrage execution engine built with Python 3.10+ and the `ccxt` library. Connects to two exchanges simultaneously, monitors order books, and drives a full FSM-based strategy lifecycle.

### Architecture

Three concurrent `asyncio` tasks run inside a `TaskGroup`:

| Task | Responsibility |
|------|----------------|
| `watch_market_spread()` | Streams or polls order books from both exchanges; computes cross-venue spread. |
| `evaluate_arbitrage()` | Drives the Agent FSM; triggers simulated dual-market orders when spread exceeds threshold. |
| `emit_status_heartbeat()` | Emits periodic STATUS telemetry (state, spread, P&L, scan count). |

A fourth listener, `stdin_listener()`, watches for `KILL`/`STOP` commands to trigger the programmatic kill switch.

### Agent State Machine

```
IDLE → SCANNING → AMBUSH → EXECUTING → ACTIVE_CYCLE → LIQUIDATING
  ↑                  ↓ (retreat)              ↓ (TP/SL)      ↓
  └─────────────────────────────────────────────────────────── ┘
```

- **IDLE**: Engine created, not yet active.
- **SCANNING**: Monitoring order books for spread opportunities.
- **AMBUSH**: Spread nearing threshold; preparing execution pipeline.
- **EXECUTING**: Dual-market orders in flight.
- **ACTIVE_CYCLE**: Positions open; monitoring P&L, funding accrual, and delta exposure.
- **LIQUIDATING**: Emergency or planned close — counter-trades to achieve delta neutrality.

### Telemetry Schema

Every event is a single JSON line on stdout, parseable by any frontend:

```json
{
  "timestamp": "2025-01-15T14:32:01.123456+00:00",
  "agent": "AGENT_01",
  "level": "SCAN",
  "message": "BTC/USDT spread: BINANCE ask 68205.20, BYBIT bid 68212.10. Spread: $6.90 (0.0101%).",
  "metrics": {
    "spread_usd": 6.9,
    "spread_pct": 0.0101,
    "ask_a": 68205.2,
    "bid_b": 68212.1
  }
}
```

### Safety Controls

- **Sandbox Mode**: Enabled by default (`exchange.set_sandbox_mode(True)`). Zero real capital at risk.
- **Kill Switch**: Send `KILL`, `STOP`, `QUIT`, or `EXIT` on stdin, or `Ctrl-C` / `SIGTERM`. Triggers immediate counter-trade liquidation on all open cycles.
- **Per-Cycle Stop-Loss / Take-Profit**: Configurable USD limits per arbitrage cycle.
- **Max Concurrent Cycles**: Prevents over-exposure.
- **Rate Limiting**: Honors CCXT's built-in token bucket with a configurable multiplier.

### Quick Start

```bash
cd engine
pip install -r requirements.txt

# Run with defaults (BTC/USDT, sandbox mode, Binance ↔ Bybit)
cd ..
python -m engine.main

# Custom configuration
python -m engine.main --symbol ETH/USDT --spread-threshold 0.020 --size 0.05 --pretty

# Pipe telemetry to a frontend bridge
python -m engine.main | node frontend_bridge.js

# Kill switch via stdin
echo "KILL" | python -m engine.main
```

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--symbol` | `BTC/USDT` | Trading pair |
| `--exchange-a` | `binance` | First exchange |
| `--exchange-b` | `bybit` | Second exchange |
| `--no-sandbox` | off | ⚠ Disables sandbox — uses real capital |
| `--spread-threshold` | `0.015` | Minimum spread % to trigger |
| `--size` | `0.01` | Position size in base asset |
| `--max-risk` | `15.0` | Max portfolio risk % |
| `--pretty` | off | Pretty-print JSON telemetry |
| `--log FILE` | none | Mirror telemetry to file |
| `--agent-id` | `AGENT_01` | Agent identifier |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, Vanilla CSS3, Vanilla JavaScript, HTML5 Canvas |
| Backend Engine | Python 3.10+, asyncio, ccxt |
| Design | Dark mode, glassmorphism, neon glow accents, CSS Grid/Flexbox |
| Fonts | Inter, JetBrains Mono, Orbitron (Google Fonts) |
