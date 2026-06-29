"""
state_machine.py — Agent State Machine
Strict FSM that governs every lifecycle transition of the arbitrage agent.

States
──────
  IDLE         → Engine created but not yet started.
  SCANNING     → Actively polling / streaming order books.
  AMBUSH       → Spread is nearing the trigger threshold.
  EXECUTING    → Dual-market orders are in flight.
  ACTIVE_CYCLE → Both legs are filled; monitoring P&L and delta.
  LIQUIDATING  → Emergency or planned close of all positions.

Only the transitions encoded in _TRANSITIONS are legal.  Anything else
raises a ``StateTransitionError``.
"""

from __future__ import annotations

from enum import Enum, auto
from typing import Callable


class AgentState(Enum):
    IDLE = auto()
    SCANNING = auto()
    AMBUSH = auto()
    EXECUTING = auto()
    ACTIVE_CYCLE = auto()
    LIQUIDATING = auto()


class StateTransitionError(Exception):
    """Raised when an illegal state transition is attempted."""


# ── Legal transition graph ──────────────────────────────────────────────
_TRANSITIONS: dict[AgentState, set[AgentState]] = {
    AgentState.IDLE:         {AgentState.SCANNING, AgentState.LIQUIDATING},
    AgentState.SCANNING:     {AgentState.AMBUSH, AgentState.LIQUIDATING},
    AgentState.AMBUSH:       {AgentState.SCANNING, AgentState.EXECUTING, AgentState.LIQUIDATING},
    AgentState.EXECUTING:    {AgentState.ACTIVE_CYCLE, AgentState.SCANNING, AgentState.LIQUIDATING},
    AgentState.ACTIVE_CYCLE: {AgentState.LIQUIDATING, AgentState.SCANNING},
    AgentState.LIQUIDATING:  {AgentState.SCANNING, AgentState.IDLE},
}


class AgentStateMachine:
    """
    Thread-safe (single-writer via asyncio) Finite State Machine.

    Optional *on_transition* callback receives ``(old_state, new_state)``
    whenever a legal transition succeeds.
    """

    def __init__(
        self,
        initial: AgentState = AgentState.IDLE,
        on_transition: Callable[[AgentState, AgentState], None] | None = None,
    ) -> None:
        self._state = initial
        self._on_transition = on_transition

    # ── Properties ──────────────────────────────────────────────────────

    @property
    def state(self) -> AgentState:
        return self._state

    @property
    def is_active(self) -> bool:
        """True while the agent has open risk (executing or holding)."""
        return self._state in (AgentState.EXECUTING, AgentState.ACTIVE_CYCLE)

    @property
    def is_liquidating(self) -> bool:
        return self._state is AgentState.LIQUIDATING

    # ── Transition ──────────────────────────────────────────────────────

    def transition(self, target: AgentState) -> None:
        """
        Move to *target* if the transition is legal, else raise.

        Fires the ``on_transition`` callback after the state is updated.
        """
        if target not in _TRANSITIONS.get(self._state, set()):
            raise StateTransitionError(
                f"Illegal transition: {self._state.name} → {target.name}"
            )
        old = self._state
        self._state = target
        if self._on_transition:
            self._on_transition(old, target)

    def force_liquidate(self) -> None:
        """
        Emergency override — jump to LIQUIDATING from *any* state.

        This is the kill-switch path; it bypasses the normal guard.
        """
        old = self._state
        self._state = AgentState.LIQUIDATING
        if self._on_transition:
            self._on_transition(old, AgentState.LIQUIDATING)

    def can_transition(self, target: AgentState) -> bool:
        return target in _TRANSITIONS.get(self._state, set())
