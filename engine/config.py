"""
config.py — Engine Configuration
All tuneable parameters for the Agentic Arbitrage Engine.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class EngineConfig:
    """Immutable configuration snapshot passed to every component at startup."""

    # ── Target Instrument ──
    symbol: str = "BTC/USDT"

    # ── Exchange Selection ──
    exchange_a_id: str = "binance"
    exchange_b_id: str = "bybit"

    # ── Sandbox / Demo Mode ──
    #   True  → routes every request to the exchange's testnet endpoint.
    #   ZERO real capital is risked when this flag is enabled.
    use_sandbox: bool = True

    # ── Spread Trigger Thresholds ──
    #   spread_threshold_pct:  minimum absolute spread (in %) that triggers
    #                          a full arbitrage execution cycle.
    #   ambush_threshold_pct:  pre-trigger "stalking" zone — the engine
    #                          transitions from SCANNING → AMBUSH when the
    #                          spread enters this band.
    spread_threshold_pct: float = 0.015
    ambush_threshold_pct: float = 0.010

    # ── Position Sizing ──
    position_size_base: float = 0.01     # units in the base asset (e.g. BTC)
    max_position_value_usd: float = 1000.0
    max_concurrent_cycles: int = 3

    # ── Risk Limits ──
    max_risk_pct: float = 15.0           # max portfolio drawdown before kill
    max_loss_per_cycle_usd: float = 50.0 # per-cycle stop-loss
    take_profit_per_cycle_usd: float = 25.0

    # ── Timing ──
    poll_interval_s: float = 0.5         # REST fallback polling cadence
    heartbeat_interval_s: float = 5.0    # STATUS telemetry cadence
    strategy_eval_interval_s: float = 0.25  # strategy loop tick rate
    ws_reconnect_delay_s: float = 2.0

    # ── Agent Identity ──
    agent_id: str = "AGENT_01"
    agent_label: str = "Delta-Neutral"

    # ── Rate Limiting ──
    enable_rate_limit: bool = True       # honour CCXT token-bucket
    rate_limit_factor: float = 1.0       # multiplier (>1 = more conservative)

    # ── Exchange Credentials ──
    #   For sandbox/demo modes, most exchanges accept empty strings or provide
    #   dedicated testnet keys.  Override via environment or a secrets manager.
    exchange_a_api_key: str = ""
    exchange_a_secret: str = ""
    exchange_b_api_key: str = ""
    exchange_b_secret: str = ""

    # ── Telemetry ──
    telemetry_pretty: bool = False       # pretty-print JSON on stdout
    log_file: str = ""                   # optional file mirror for telemetry
