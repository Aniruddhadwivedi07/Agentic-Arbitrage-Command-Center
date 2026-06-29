"""
engine.py — Agentic Arbitrage Execution Engine
Core "brain" of the Command Center.

Runs three concurrent asyncio tasks:
  1. watch_market_spread()   – streams / polls order books from both exchanges.
  2. evaluate_arbitrage()    – applies the strategy FSM and triggers simulated trades.
  3. emit_status_heartbeat() – periodic STATUS telemetry for the frontend dashboard.

A fourth helper, _stdin_listener(), monitors stdin for a "KILL" command to
trigger the programmatic kill-switch (immediate liquidation).
"""

from __future__ import annotations

import asyncio
import signal
import sys
import time
from dataclasses import dataclass, field
from typing import Any

import ccxt.async_support as ccxt_async  # type: ignore

from .config import EngineConfig
from .state_machine import AgentState, AgentStateMachine
from .telemetry import TelemetryEmitter


# ═══════════════════════════════════════════════════════════════════════
# Data Structures
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class TickerSnapshot:
    """Top-of-book snapshot for a single exchange."""
    exchange_id: str = ""
    best_bid: float = 0.0
    best_ask: float = 0.0
    bid_volume: float = 0.0
    ask_volume: float = 0.0
    timestamp: float = 0.0       # UNIX epoch seconds


@dataclass
class SpreadResult:
    """Computed directional spreads between two exchanges."""
    spread_a_to_b: float = 0.0   # Exchange_B_Bid − Exchange_A_Ask
    spread_b_to_a: float = 0.0   # Exchange_A_Bid − Exchange_B_Ask
    best_spread: float = 0.0     # max of the two
    buy_exchange: str = ""       # cheaper venue id
    sell_exchange: str = ""      # more expensive venue id
    spread_pct: float = 0.0      # best_spread as % of mid-price


@dataclass
class OpenCycle:
    """Tracks one active arbitrage cycle (pair of opposing positions)."""
    cycle_id: int = 0
    buy_exchange: str = ""
    sell_exchange: str = ""
    buy_price: float = 0.0
    sell_price: float = 0.0
    size: float = 0.0
    entry_spread: float = 0.0
    opened_at: float = 0.0       # UNIX epoch
    net_pnl: float = 0.0
    funding_pnl: float = 0.0


# ═══════════════════════════════════════════════════════════════════════
# Arbitrage Engine
# ═══════════════════════════════════════════════════════════════════════

class ArbitrageEngine:
    """
    Asynchronous arbitrage execution engine.

    Instantiate with an ``EngineConfig``, then call ``await engine.run()``.
    The engine will start the three concurrent loops and block until a
    shutdown signal is received.
    """

    def __init__(self, config: EngineConfig | None = None) -> None:
        self.cfg = config or EngineConfig()
        self.tel = TelemetryEmitter(
            agent_id=self.cfg.agent_id,
            pretty=self.cfg.telemetry_pretty,
            log_file=self.cfg.log_file,
        )

        # ── State Machine ──
        self.fsm = AgentStateMachine(
            initial=AgentState.IDLE,
            on_transition=self._on_state_transition,
        )

        # ── Exchange handles (created in _init_exchanges) ──
        self._ex_a: ccxt_async.Exchange | None = None
        self._ex_b: ccxt_async.Exchange | None = None

        # ── Market data ──
        self._ticker_a = TickerSnapshot()
        self._ticker_b = TickerSnapshot()
        self._spread = SpreadResult()

        # ── Positions & P&L ──
        self._cycles: list[OpenCycle] = []
        self._next_cycle_id = 1
        self._total_pnl: float = 0.0
        self._total_funding_pnl: float = 0.0
        self._scan_count: int = 0
        self._execution_count: int = 0

        # ── Control Flags ──
        self._shutdown = asyncio.Event()

        # Per-exchange transport mode tracking.
        # Starts as "ws" (optimistic); degrades to "rest" on NotSupported.
        self._transport_mode: dict[str, str] = {
            self.cfg.exchange_a_id: "ws",
            self.cfg.exchange_b_id: "ws",
        }
        # Set of exchange IDs whose WS probe has already completed (pass or fail).
        self._ws_probed: set[str] = set()

    # ═══════════════════════════════════════════════════════════════════
    # Lifecycle
    # ═══════════════════════════════════════════════════════════════════

    async def run(self) -> None:
        """Boot the engine and block until shutdown."""
        try:
            await self._init_exchanges()
            self.fsm.transition(AgentState.SCANNING)

            self.tel.status(
                f"Engine online. Monitoring {self.cfg.symbol} across "
                f"{self.cfg.exchange_a_id.upper()} and {self.cfg.exchange_b_id.upper()}. "
                f"Sandbox mode: {'ENABLED' if self.cfg.use_sandbox else 'DISABLED'}.",
                symbol=self.cfg.symbol,
                sandbox=self.cfg.use_sandbox,
            )

            # Install OS signal handlers for graceful shutdown.
            loop = asyncio.get_running_loop()
            for sig in (signal.SIGINT, signal.SIGTERM):
                loop.add_signal_handler(sig, self._signal_handler, sig)

            # Launch the concurrent task group.
            async with asyncio.TaskGroup() as tg:
                tg.create_task(self._watch_market_spread(), name="market_sync")
                tg.create_task(self._evaluate_arbitrage(), name="strategy_engine")
                tg.create_task(self._emit_status_heartbeat(), name="heartbeat")
                tg.create_task(self._stdin_listener(), name="stdin_kill_switch")

        except* Exception as eg:
            for exc in eg.exceptions:
                self.tel.warning(
                    f"Fatal task error: {type(exc).__name__}: {exc}"
                )
        finally:
            await self._shutdown_sequence()

    # ═══════════════════════════════════════════════════════════════════
    # Task 1 — Market Sync  (watch_market_spread)
    #
    # Uses a PER-EXCHANGE adaptive transport model:
    #   • Each exchange starts optimistically in "ws" mode.
    #   • On the first tick, a real watch_order_book() call is attempted.
    #   • If the exchange throws NotSupported (or any fatal, non-transient
    #     error), that *single* exchange is permanently degraded to "rest"
    #     mode while the other may continue streaming over WebSocket.
    #   • Transient network errors (timeouts, disconnects) trigger a
    #     short backoff + retry without degrading the transport mode.
    #   • Both paths produce identical TickerSnapshot / SpreadResult
    #     data, so the downstream FSM is transport-agnostic.
    # ═══════════════════════════════════════════════════════════════════

    # Exception types that signal "this exchange will NEVER support WS".
    # ccxt.NotSupported is the canonical one; we also catch AttributeError
    # for older ccxt builds where the method isn't even defined.
    _WS_FATAL_ERRORS = (
        getattr(ccxt_async, "NotSupported", type(None)),
        AttributeError,
    )

    async def _watch_market_spread(self) -> None:
        """
        Coordinator loop.  Launches two independent per-exchange fetch
        tasks that each auto-negotiate their own transport (WS or REST).
        Both tasks write into their respective TickerSnapshot; a shared
        asyncio.Event is set whenever *either* exchange delivers new data
        so the spread can be recomputed promptly.
        """
        assert self._ex_a is not None and self._ex_b is not None

        # Event pulsed by each fetcher after it updates its TickerSnapshot.
        tick_event = asyncio.Event()

        async with asyncio.TaskGroup() as tg:
            tg.create_task(
                self._fetch_single_exchange(
                    exchange=self._ex_a,
                    exchange_id=self.cfg.exchange_a_id,
                    ticker=self._ticker_a,
                    tick_event=tick_event,
                ),
                name=f"fetch_{self.cfg.exchange_a_id}",
            )
            tg.create_task(
                self._fetch_single_exchange(
                    exchange=self._ex_b,
                    exchange_id=self.cfg.exchange_b_id,
                    ticker=self._ticker_b,
                    tick_event=tick_event,
                ),
                name=f"fetch_{self.cfg.exchange_b_id}",
            )
            tg.create_task(
                self._spread_aggregator(tick_event),
                name="spread_aggregator",
            )

    async def _fetch_single_exchange(
        self,
        exchange: ccxt_async.Exchange,
        exchange_id: str,
        ticker: TickerSnapshot,
        tick_event: asyncio.Event,
    ) -> None:
        """
        Autonomous per-exchange data fetcher.

        1.  If ``_transport_mode[exchange_id]`` is ``"ws"``, attempt a
            real ``watch_order_book()`` call.
        2.  If the very first call raises a *fatal* WS error
            (``NotSupported``, ``AttributeError``), permanently degrade
            that exchange to ``"rest"`` and log a WARNING.
        3.  In ``"rest"`` mode, poll ``fetch_order_book()`` at the
            configured ``poll_interval_s`` cadence with full
            ``asyncio.sleep`` between ticks to avoid rate-limit bans.
        4.  Transient errors (network glitches, timeouts) in either mode
            trigger a brief backoff but do NOT change the transport mode.
        """
        sym = self.cfg.symbol

        while not self._shutdown.is_set():
            mode = self._transport_mode[exchange_id]

            # ── WebSocket path ──────────────────────────────────────
            if mode == "ws":
                try:
                    ob = await exchange.watch_order_book(sym, limit=5)
                    self._update_ticker_from_ob(ob, ticker, exchange_id)
                    tick_event.set()

                    # Mark the probe as successful on first WS tick.
                    if exchange_id not in self._ws_probed:
                        self._ws_probed.add(exchange_id)
                        self.tel.status(
                            f"{exchange_id.upper()}: WebSocket streaming "
                            f"active — watch_order_book() confirmed.",
                            exchange=exchange_id,
                            transport="ws",
                        )
                    continue  # WS is push-based; loop immediately.

                except self._WS_FATAL_ERRORS as exc:
                    # ── Permanent degradation ───────────────────────
                    self._transport_mode[exchange_id] = "rest"
                    self._ws_probed.add(exchange_id)
                    self.tel.warning(
                        f"{exchange_id.upper()}: watch_order_book() is "
                        f"not supported ({type(exc).__name__}: {exc}). "
                        f"Degrading to REST polling at "
                        f"{self.cfg.poll_interval_s}s intervals.",
                        exchange=exchange_id,
                        transport="rest",
                        error=str(exc),
                    )
                    # Fall through to the REST branch below on this
                    # same iteration — no data was lost.

                except Exception as exc:
                    # ── Transient error — backoff + retry ──────────
                    self.tel.warning(
                        f"{exchange_id.upper()}: WebSocket transient "
                        f"error ({type(exc).__name__}: {exc}). "
                        f"Retrying in {self.cfg.ws_reconnect_delay_s}s.",
                        exchange=exchange_id,
                        transport="ws",
                        error=str(exc),
                    )
                    await asyncio.sleep(self.cfg.ws_reconnect_delay_s)
                    continue

            # ── REST polling path ───────────────────────────────────
            # Reached either because mode was already "rest", or because
            # the WS branch just degraded on this iteration.
            try:
                ob = await exchange.fetch_order_book(sym, limit=5)
                self._update_ticker_from_ob(ob, ticker, exchange_id)
                tick_event.set()
            except Exception as exc:
                self.tel.warning(
                    f"{exchange_id.upper()}: REST fetch error "
                    f"({type(exc).__name__}: {exc}).",
                    exchange=exchange_id,
                    transport="rest",
                    error=str(exc),
                )

            # Rate-limit-safe sleep.  Completely non-blocking.
            await asyncio.sleep(self.cfg.poll_interval_s)

    async def _spread_aggregator(self, tick_event: asyncio.Event) -> None:
        """
        Waits for either exchange fetcher to deliver new data (via
        *tick_event*), then recomputes the cross-venue spread.

        Runs as a dedicated task so that spread computation is decoupled
        from the per-exchange fetch cadence.
        """
        while not self._shutdown.is_set():
            # Block until at least one fetcher signals new data.
            try:
                await asyncio.wait_for(tick_event.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                # No data in 5 s — emit a warning but keep waiting.
                if self._scan_count > 0:  # suppress on cold start
                    self.tel.warning(
                        "No market data received in 5 s — exchanges may "
                        "be unreachable.",
                    )
                continue
            finally:
                tick_event.clear()

            self._compute_spread()
            self._scan_count += 1

    # ── Helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _update_ticker_from_ob(
        ob: dict[str, Any],
        ticker: TickerSnapshot,
        exchange_id: str,
    ) -> None:
        """Extract top-of-book from a CCXT order book dict."""
        bids = ob.get("bids", [])
        asks = ob.get("asks", [])
        ticker.exchange_id = exchange_id
        ticker.best_bid = bids[0][0] if bids else 0.0
        ticker.bid_volume = bids[0][1] if bids else 0.0
        ticker.best_ask = asks[0][0] if asks else 0.0
        ticker.ask_volume = asks[0][1] if asks else 0.0
        ticker.timestamp = time.time()

    def _compute_spread(self) -> None:
        """Recompute directional spreads and log a SCAN event."""
        a, b = self._ticker_a, self._ticker_b

        if a.best_ask <= 0 or b.best_ask <= 0:
            return

        s = self._spread
        s.spread_a_to_b = b.best_bid - a.best_ask   # buy A, sell B
        s.spread_b_to_a = a.best_bid - b.best_ask   # buy B, sell A

        if s.spread_a_to_b >= s.spread_b_to_a:
            s.best_spread = s.spread_a_to_b
            s.buy_exchange = self.cfg.exchange_a_id
            s.sell_exchange = self.cfg.exchange_b_id
        else:
            s.best_spread = s.spread_b_to_a
            s.buy_exchange = self.cfg.exchange_b_id
            s.sell_exchange = self.cfg.exchange_a_id

        mid = (a.best_ask + b.best_ask) / 2
        s.spread_pct = (s.best_spread / mid) * 100 if mid > 0 else 0.0

        # Emit a SCAN telemetry event every Nth tick to avoid flooding.
        if self._scan_count % 10 == 0:
            mode_a = self._transport_mode.get(self.cfg.exchange_a_id, "?")
            mode_b = self._transport_mode.get(self.cfg.exchange_b_id, "?")
            self.tel.scan(
                f"{self.cfg.symbol} spread: "
                f"{self.cfg.exchange_a_id.upper()} ask {a.best_ask:.2f} "
                f"[{mode_a.upper()}], "
                f"{self.cfg.exchange_b_id.upper()} bid {b.best_bid:.2f} "
                f"[{mode_b.upper()}]. "
                f"Spread: ${s.best_spread:.2f} ({s.spread_pct:.4f}%). "
                f"Scans: {self._scan_count}.",
                spread_usd=round(s.best_spread, 4),
                spread_pct=round(s.spread_pct, 6),
                ask_a=a.best_ask,
                bid_b=b.best_bid,
                transport_a=mode_a,
                transport_b=mode_b,
            )

    # ═══════════════════════════════════════════════════════════════════
    # Task 2 — Strategy Orchestration Engine  (evaluate_arbitrage)
    # ═══════════════════════════════════════════════════════════════════

    async def _evaluate_arbitrage(self) -> None:
        """
        Runs the FSM evaluation loop.  On every tick it checks the latest
        spread against the configured thresholds and drives state
        transitions: SCANNING → AMBUSH → EXECUTING → ACTIVE_CYCLE.
        """
        while not self._shutdown.is_set():
            try:
                await self._strategy_tick()
            except Exception as exc:
                self.tel.warning(f"Strategy tick error: {exc}")
            await asyncio.sleep(self.cfg.strategy_eval_interval_s)

    async def _strategy_tick(self) -> None:
        """Single evaluation cycle of the strategy FSM."""
        state = self.fsm.state
        spread = self._spread

        # ── SCANNING state ──────────────────────────────────────────
        if state is AgentState.SCANNING:
            if spread.spread_pct >= self.cfg.ambush_threshold_pct:
                self.fsm.transition(AgentState.AMBUSH)
                self.tel.analyze(
                    f"Spread entering ambush zone: {spread.spread_pct:.4f}% "
                    f"(ambush threshold {self.cfg.ambush_threshold_pct}%). "
                    f"Preparing execution pipeline.",
                    spread_pct=round(spread.spread_pct, 6),
                    threshold=self.cfg.ambush_threshold_pct,
                )

        # ── AMBUSH state ────────────────────────────────────────────
        elif state is AgentState.AMBUSH:
            if spread.spread_pct >= self.cfg.spread_threshold_pct:
                # Verify depth — both sides must have sufficient liquidity.
                buy_vol = (
                    self._ticker_a.ask_volume
                    if spread.buy_exchange == self.cfg.exchange_a_id
                    else self._ticker_b.ask_volume
                )
                sell_vol = (
                    self._ticker_b.bid_volume
                    if spread.sell_exchange == self.cfg.exchange_b_id
                    else self._ticker_a.bid_volume
                )
                needed = self.cfg.position_size_base

                if buy_vol >= needed and sell_vol >= needed:
                    self.tel.analyze(
                        f"Spread {spread.spread_pct:.4f}% exceeds threshold "
                        f"({self.cfg.spread_threshold_pct}%). "
                        f"Market depth verified — buy side: {buy_vol:.4f}, "
                        f"sell side: {sell_vol:.4f}. Optimal conditions confirmed.",
                        spread_pct=round(spread.spread_pct, 6),
                        buy_depth=round(buy_vol, 4),
                        sell_depth=round(sell_vol, 4),
                    )
                    await self._execute_arbitrage_cycle()
                else:
                    self.tel.warning(
                        f"Spread triggered but insufficient depth. "
                        f"Buy: {buy_vol:.4f}, Sell: {sell_vol:.4f}, "
                        f"Needed: {needed}.",
                        buy_depth=round(buy_vol, 4),
                        sell_depth=round(sell_vol, 4),
                    )

            elif spread.spread_pct < self.cfg.ambush_threshold_pct:
                # Spread retreated — go back to scanning.
                self.fsm.transition(AgentState.SCANNING)
                self.tel.scan(
                    f"Spread retreated to {spread.spread_pct:.4f}%. "
                    f"Returning to SCANNING.",
                    spread_pct=round(spread.spread_pct, 6),
                )

        # ── ACTIVE_CYCLE state ──────────────────────────────────────
        elif state is AgentState.ACTIVE_CYCLE:
            await self._monitor_active_cycles()

    # ── Execution ───────────────────────────────────────────────────────

    async def _execute_arbitrage_cycle(self) -> None:
        """
        Place a simulated dual-market order:
          • Market BUY on the cheaper exchange.
          • Market SELL on the more expensive exchange.
        """
        if len(self._cycles) >= self.cfg.max_concurrent_cycles:
            self.tel.warning(
                f"Max concurrent cycles ({self.cfg.max_concurrent_cycles}) reached. "
                f"Skipping new execution.",
            )
            return

        self.fsm.transition(AgentState.EXECUTING)
        s = self._spread
        size = self.cfg.position_size_base

        buy_ex = self._get_exchange(s.buy_exchange)
        sell_ex = self._get_exchange(s.sell_exchange)

        buy_price = (
            self._ticker_a.best_ask
            if s.buy_exchange == self.cfg.exchange_a_id
            else self._ticker_b.best_ask
        )
        sell_price = (
            self._ticker_b.best_bid
            if s.sell_exchange == self.cfg.exchange_b_id
            else self._ticker_a.best_bid
        )

        self.tel.execute(
            f"ORCHESTRATION: Initiating {size} {self.cfg.symbol.split('/')[0]} "
            f"arbitrage cycle. Strategy: Long {s.buy_exchange.upper()} "
            f"(Receiver), Short {s.sell_exchange.upper()} (Payer).",
            size=size,
            buy_exchange=s.buy_exchange,
            sell_exchange=s.sell_exchange,
        )

        # ── Simulated order placement ──
        try:
            buy_order, sell_order = await asyncio.gather(
                buy_ex.create_market_buy_order(self.cfg.symbol, size),
                sell_ex.create_market_sell_order(self.cfg.symbol, size),
            )
            fill_buy = float(buy_order.get("average", buy_price))
            fill_sell = float(sell_order.get("average", sell_price))
        except Exception as exc:
            # If real API call fails (sandbox might not support market orders),
            # fall back to simulated fills at current top-of-book prices.
            self.tel.warning(
                f"Exchange API order error ({exc}). "
                f"Using simulated fills at top-of-book.",
                error=str(exc),
            )
            fill_buy = buy_price
            fill_sell = sell_price

        self.tel.execute(
            f"EXECUTING: Placing orders. {size} {self.cfg.symbol.split('/')[0]} "
            f"Long @ {s.buy_exchange.upper()} ({fill_buy:.2f}), "
            f"{size} Short @ {s.sell_exchange.upper()} ({fill_sell:.2f}).",
            buy_price=fill_buy,
            sell_price=fill_sell,
            spread_captured=round(fill_sell - fill_buy, 4),
        )

        cycle = OpenCycle(
            cycle_id=self._next_cycle_id,
            buy_exchange=s.buy_exchange,
            sell_exchange=s.sell_exchange,
            buy_price=fill_buy,
            sell_price=fill_sell,
            size=size,
            entry_spread=fill_sell - fill_buy,
            opened_at=time.time(),
        )
        self._cycles.append(cycle)
        self._next_cycle_id += 1
        self._execution_count += 1

        self.fsm.transition(AgentState.ACTIVE_CYCLE)
        self.tel.execute(
            f"CONFIRMATION: Positions active. {size} "
            f"{self.cfg.symbol.split('/')[0]} Cycle #{cycle.cycle_id} initiated. "
            f"Monitoring delta exposure.",
            cycle_id=cycle.cycle_id,
            pnl=0.0,
        )

    # ── Position Monitoring ─────────────────────────────────────────────

    async def _monitor_active_cycles(self) -> None:
        """Check every open cycle for take-profit / stop-loss."""
        closed_ids: list[int] = []

        for cycle in self._cycles:
            # Current mid-prices (simplified — uses tickers already in memory).
            # In a real implementation this would re-read the mark price.
            buy_mark = (
                self._ticker_a.best_bid
                if cycle.buy_exchange == self.cfg.exchange_a_id
                else self._ticker_b.best_bid
            )
            sell_mark = (
                self._ticker_b.best_ask
                if cycle.sell_exchange == self.cfg.exchange_b_id
                else self._ticker_a.best_ask
            )

            # P&L = (sell_entry − buy_entry) + (buy_mark − sell_mark) [per unit]
            unrealised = (
                (cycle.sell_price - cycle.buy_price)
                + (buy_mark - sell_mark)
            ) * cycle.size
            cycle.net_pnl = unrealised

            # Simulated funding accrual (~0.01% per 8h pro-rated)
            hours_held = (time.time() - cycle.opened_at) / 3600
            cycle.funding_pnl = cycle.size * cycle.buy_price * 0.0001 * (hours_held / 8)

            total = cycle.net_pnl + cycle.funding_pnl

            # Take-profit check
            if total >= self.cfg.take_profit_per_cycle_usd:
                self.tel.execute(
                    f"Cycle #{cycle.cycle_id} take-profit hit: "
                    f"${total:.2f} ≥ ${self.cfg.take_profit_per_cycle_usd:.2f}. "
                    f"Closing.",
                    cycle_id=cycle.cycle_id,
                    pnl=round(total, 4),
                )
                closed_ids.append(cycle.cycle_id)

            # Stop-loss check
            elif total <= -self.cfg.max_loss_per_cycle_usd:
                self.tel.warning(
                    f"Cycle #{cycle.cycle_id} stop-loss hit: "
                    f"${total:.2f} ≤ -${self.cfg.max_loss_per_cycle_usd:.2f}. "
                    f"Liquidating.",
                    cycle_id=cycle.cycle_id,
                    pnl=round(total, 4),
                )
                closed_ids.append(cycle.cycle_id)

        # Close flagged cycles.
        for cid in closed_ids:
            await self._close_cycle(cid)

        # If no more open cycles, go back to scanning.
        if not self._cycles and self.fsm.state is AgentState.ACTIVE_CYCLE:
            self.fsm.transition(AgentState.SCANNING)
            self.tel.status("All cycles closed. Returning to SCANNING.")

    async def _close_cycle(self, cycle_id: int) -> None:
        """Close a single arbitrage cycle by counter-trading both legs."""
        cycle = next((c for c in self._cycles if c.cycle_id == cycle_id), None)
        if not cycle:
            return

        # Counter-trades: sell the long, buy back the short.
        buy_ex = self._get_exchange(cycle.buy_exchange)
        sell_ex = self._get_exchange(cycle.sell_exchange)
        try:
            await asyncio.gather(
                buy_ex.create_market_sell_order(self.cfg.symbol, cycle.size),
                sell_ex.create_market_buy_order(self.cfg.symbol, cycle.size),
            )
        except Exception as exc:
            self.tel.warning(f"Counter-trade API error: {exc}. Simulated close.")

        realised = cycle.net_pnl + cycle.funding_pnl
        self._total_pnl += realised
        self._total_funding_pnl += cycle.funding_pnl
        self._cycles = [c for c in self._cycles if c.cycle_id != cycle_id]

        self.tel.execute(
            f"Cycle #{cycle_id} closed. Realised P&L: ${realised:.2f}. "
            f"Cumulative: ${self._total_pnl:.2f}.",
            cycle_id=cycle_id,
            pnl=round(realised, 4),
            cumulative_pnl=round(self._total_pnl, 4),
        )

    # ═══════════════════════════════════════════════════════════════════
    # Task 3 — Heartbeat / Status Telemetry
    # ═══════════════════════════════════════════════════════════════════

    async def _emit_status_heartbeat(self) -> None:
        """Periodic STATUS telemetry for the frontend dashboard."""
        while not self._shutdown.is_set():
            spread = self._spread
            cycles_pnl = sum(c.net_pnl + c.funding_pnl for c in self._cycles)

            self.tel.status(
                f"State: {self.fsm.state.name}. "
                f"Spread: {spread.spread_pct:.4f}%. "
                f"Open cycles: {len(self._cycles)}. "
                f"Session P&L: ${self._total_pnl + cycles_pnl:.2f}. "
                f"Scans: {self._scan_count}. "
                f"Executions: {self._execution_count}.",
                state=self.fsm.state.name,
                spread_pct=round(spread.spread_pct, 6),
                open_cycles=len(self._cycles),
                session_pnl=round(self._total_pnl + cycles_pnl, 4),
                total_scans=self._scan_count,
                total_executions=self._execution_count,
            )
            await asyncio.sleep(self.cfg.heartbeat_interval_s)

    # ═══════════════════════════════════════════════════════════════════
    # Kill Switch — stdin listener
    # ═══════════════════════════════════════════════════════════════════

    async def _stdin_listener(self) -> None:
        """
        Monitor stdin for a ``KILL`` or ``STOP`` command.
        When received, trigger immediate liquidation.
        """
        loop = asyncio.get_running_loop()
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        try:
            await loop.connect_read_pipe(lambda: protocol, sys.stdin)
        except (OSError, NotImplementedError):
            # stdin might not be a pipe (e.g. running in certain IDEs).
            self.tel.warning(
                "stdin listener unavailable — kill switch via signals only."
            )
            return

        while not self._shutdown.is_set():
            try:
                line = await asyncio.wait_for(reader.readline(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            except Exception:
                break

            if not line:
                break  # EOF

            cmd = line.decode("utf-8", errors="replace").strip().upper()
            if cmd in ("KILL", "STOP", "QUIT", "EXIT"):
                self.tel.warning(
                    f"Kill switch activated via stdin command: '{cmd}'. "
                    f"Initiating emergency liquidation."
                )
                await self._kill_switch()
                break

    # ═══════════════════════════════════════════════════════════════════
    # Safety — Close All Positions
    # ═══════════════════════════════════════════════════════════════════

    async def close_all_positions(self) -> None:
        """
        Public liquidation API.  Executes counter-trades for every open
        cycle to achieve absolute delta-neutrality, then transitions the
        FSM to IDLE.
        """
        if not self._cycles:
            self.tel.status("No open positions to close.")
            return

        self.fsm.force_liquidate()
        self.tel.execute(
            f"LIQUIDATION: Closing {len(self._cycles)} open cycle(s) "
            f"to achieve delta neutrality.",
            open_cycles=len(self._cycles),
        )

        # Close all cycles concurrently.
        ids = [c.cycle_id for c in self._cycles]
        for cid in ids:
            await self._close_cycle(cid)

        self.tel.execute(
            f"LIQUIDATION COMPLETE. All positions flat. "
            f"Final session P&L: ${self._total_pnl:.2f}.",
            pnl=round(self._total_pnl, 4),
        )
        if self.fsm.can_transition(AgentState.IDLE):
            self.fsm.transition(AgentState.IDLE)

    # ═══════════════════════════════════════════════════════════════════
    # Internal Helpers
    # ═══════════════════════════════════════════════════════════════════

    async def _init_exchanges(self) -> None:
        """Create and configure both exchange instances."""
        self._ex_a = self._create_exchange(
            self.cfg.exchange_a_id,
            self.cfg.exchange_a_api_key,
            self.cfg.exchange_a_secret,
        )
        self._ex_b = self._create_exchange(
            self.cfg.exchange_b_id,
            self.cfg.exchange_b_api_key,
            self.cfg.exchange_b_secret,
        )

        self.tel.status(
            f"Exchanges initialized: {self.cfg.exchange_a_id.upper()}, "
            f"{self.cfg.exchange_b_id.upper()}. "
            f"Rate limiting: {'ON' if self.cfg.enable_rate_limit else 'OFF'}.",
        )

    def _create_exchange(
        self,
        exchange_id: str,
        api_key: str,
        secret: str,
    ) -> ccxt_async.Exchange:
        """Factory for a CCXT async exchange instance."""
        exchange_class = getattr(ccxt_async, exchange_id, None)
        if exchange_class is None:
            raise ValueError(f"Unsupported exchange: {exchange_id}")

        ex: ccxt_async.Exchange = exchange_class(
            {
                "apiKey": api_key or None,
                "secret": secret or None,
                "enableRateLimit": self.cfg.enable_rate_limit,
                "options": {
                    "defaultType": "future",  # use perpetual futures
                },
            }
        )

        # Sandbox mode — testnet endpoints.
        if self.cfg.use_sandbox:
            ex.set_sandbox_mode(True)

        # Conservative rate-limiting multiplier.
        if self.cfg.enable_rate_limit and self.cfg.rate_limit_factor != 1.0:
            ex.rateLimit = int(ex.rateLimit * self.cfg.rate_limit_factor)

        return ex

    def _get_exchange(self, exchange_id: str) -> ccxt_async.Exchange:
        """Return the exchange handle matching *exchange_id*."""
        if exchange_id == self.cfg.exchange_a_id:
            assert self._ex_a is not None
            return self._ex_a
        assert self._ex_b is not None
        return self._ex_b

    def _signal_handler(self, sig: signal.Signals) -> None:
        """OS signal callback — triggers the kill switch."""
        self.tel.warning(
            f"Received signal {sig.name}. Initiating shutdown."
        )
        asyncio.ensure_future(self._kill_switch())

    async def _kill_switch(self) -> None:
        """Emergency shutdown path."""
        if self._shutdown.is_set():
            return  # already shutting down
        await self.close_all_positions()
        self._shutdown.set()

    async def _shutdown_sequence(self) -> None:
        """Graceful teardown — close exchange sockets, flush telemetry."""
        self.tel.status("Shutting down engine. Closing exchange connections.")
        try:
            if self._ex_a:
                await self._ex_a.close()
            if self._ex_b:
                await self._ex_b.close()
        except Exception as exc:
            self.tel.warning(f"Error closing exchanges: {exc}")

        self.tel.status(
            f"Engine offline. Final session P&L: ${self._total_pnl:.2f}. "
            f"Total scans: {self._scan_count}. "
            f"Total executions: {self._execution_count}.",
            pnl=round(self._total_pnl, 4),
        )
        self.tel.close()

    def _on_state_transition(
        self, old: AgentState, new: AgentState
    ) -> None:
        """FSM callback — log every state change."""
        self.tel.status(
            f"State transition: {old.name} → {new.name}",
            old_state=old.name,
            new_state=new.name,
        )
