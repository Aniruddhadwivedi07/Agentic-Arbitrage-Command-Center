#!/usr/bin/env python3
"""
main.py — Entry Point for the Agentic Arbitrage Engine.

Usage:
    python -m engine.main                        # defaults: BTC/USDT, sandbox ON
    python -m engine.main --symbol ETH/USDT      # trade ETH instead
    python -m engine.main --no-sandbox            # ⚠ real money mode (disabled by default)
    python -m engine.main --pretty                # pretty-print JSON telemetry
    python -m engine.main --log engine.log        # also mirror telemetry to file

The engine streams structured JSON to stdout so a frontend layer
(Node.js / React) can pipe and parse it in real time:

    python -m engine.main | node frontend_bridge.js

Send "KILL", "STOP", "QUIT", or "EXIT" on stdin (or Ctrl-C / SIGTERM)
to trigger the programmatic kill switch:

    echo "KILL" | python -m engine.main
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from .config import EngineConfig
from .engine import ArbitrageEngine


def parse_args() -> EngineConfig:
    """Build an ``EngineConfig`` from command-line flags."""
    p = argparse.ArgumentParser(
        prog="engine",
        description="Agentic Arbitrage Command Center — Python Execution Engine",
    )
    p.add_argument(
        "--symbol", default="BTC/USDT",
        help="Trading pair (default: BTC/USDT).",
    )
    p.add_argument(
        "--exchange-a", default="binance",
        help="First exchange ID (default: binance).",
    )
    p.add_argument(
        "--exchange-b", default="bybit",
        help="Second exchange ID (default: bybit).",
    )
    p.add_argument(
        "--no-sandbox", action="store_true",
        help="Disable sandbox mode. ⚠ USES REAL CAPITAL.",
    )
    p.add_argument(
        "--spread-threshold", type=float, default=0.015,
        help="Minimum spread %% to trigger execution (default: 0.015).",
    )
    p.add_argument(
        "--size", type=float, default=0.01,
        help="Position size in base asset units (default: 0.01).",
    )
    p.add_argument(
        "--max-risk", type=float, default=15.0,
        help="Maximum portfolio risk %% (default: 15).",
    )
    p.add_argument(
        "--pretty", action="store_true",
        help="Pretty-print JSON telemetry on stdout.",
    )
    p.add_argument(
        "--log", default="",
        help="Optional file path to mirror telemetry output.",
    )
    p.add_argument(
        "--agent-id", default="AGENT_01",
        help="Agent identifier for telemetry (default: AGENT_01).",
    )

    args = p.parse_args()

    return EngineConfig(
        symbol=args.symbol,
        exchange_a_id=args.exchange_a,
        exchange_b_id=args.exchange_b,
        use_sandbox=not args.no_sandbox,
        spread_threshold_pct=args.spread_threshold,
        ambush_threshold_pct=args.spread_threshold * 0.67,
        position_size_base=args.size,
        max_risk_pct=args.max_risk,
        telemetry_pretty=args.pretty,
        log_file=args.log,
        agent_id=args.agent_id,
    )


def main() -> None:
    """Synchronous entry point that boots the asyncio event loop."""
    config = parse_args()

    # Banner (to stderr so it doesn't pollute the JSON telemetry stream).
    print(
        "\n"
        "  ⚡  AGENTIC ARBITRAGE COMMAND CENTER\n"
        "  ────────────────────────────────────\n"
        f"  Symbol:      {config.symbol}\n"
        f"  Exchanges:   {config.exchange_a_id.upper()} ↔ {config.exchange_b_id.upper()}\n"
        f"  Sandbox:     {'ON ✓' if config.use_sandbox else '⚠ OFF — REAL MONEY'}\n"
        f"  Threshold:   {config.spread_threshold_pct}%\n"
        f"  Size:        {config.position_size_base} {config.symbol.split('/')[0]}\n"
        f"  Agent:       {config.agent_id}\n"
        "  ────────────────────────────────────\n"
        "  Send KILL / STOP on stdin or Ctrl-C to shutdown.\n",
        file=sys.stderr,
    )

    engine = ArbitrageEngine(config)

    try:
        asyncio.run(engine.run())
    except KeyboardInterrupt:
        # asyncio.run handles cancellation, but we guard just in case.
        print("\nInterrupted.", file=sys.stderr)


if __name__ == "__main__":
    main()
