"""
telemetry.py — Structured Telemetry Emitter
Emits standardised JSON objects to stdout (and optionally a file) so that
a Node.js / React frontend layer can parse them in real time.

Every emitted line conforms to this schema:
{
    "timestamp": "2025-01-15T14:32:01.123Z",
    "agent":     "AGENT_01",
    "level":     "SCAN" | "ANALYZE" | "EXECUTE" | "STATUS" | "WARNING",
    "message":   "Human-readable action description",
    "metrics":   { "spread": 0.023, "pnl": 12.50, ... }
}
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class Level(str, Enum):
    """Telemetry severity / category tags."""
    SCAN = "SCAN"
    ANALYZE = "ANALYZE"
    EXECUTE = "EXECUTE"
    STATUS = "STATUS"
    WARNING = "WARNING"


class TelemetryEmitter:
    """Thread-safe (single-writer) JSON-line emitter."""

    def __init__(
        self,
        agent_id: str = "AGENT_01",
        pretty: bool = False,
        log_file: str = "",
    ) -> None:
        self._agent_id = agent_id
        self._pretty = pretty
        self._log_file = log_file
        self._file_handle = None

        if self._log_file:
            # Open in append mode; caller is responsible for closing.
            self._file_handle = open(self._log_file, "a", encoding="utf-8")

    # ── Public API ──────────────────────────────────────────────────────

    def emit(
        self,
        level: Level,
        message: str,
        metrics: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Build, serialise, and flush a telemetry event."""
        event = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "agent": self._agent_id,
            "level": level.value,
            "message": message,
            "metrics": metrics or {},
        }
        line = json.dumps(event, indent=2 if self._pretty else None)

        # stdout is the primary transport for the frontend pipe.
        sys.stdout.write(line + "\n")
        sys.stdout.flush()

        if self._file_handle:
            self._file_handle.write(line + "\n")
            self._file_handle.flush()

        return event

    # Convenience wrappers

    def scan(self, message: str, **metrics: Any) -> dict[str, Any]:
        return self.emit(Level.SCAN, message, metrics or None)

    def analyze(self, message: str, **metrics: Any) -> dict[str, Any]:
        return self.emit(Level.ANALYZE, message, metrics or None)

    def execute(self, message: str, **metrics: Any) -> dict[str, Any]:
        return self.emit(Level.EXECUTE, message, metrics or None)

    def status(self, message: str, **metrics: Any) -> dict[str, Any]:
        return self.emit(Level.STATUS, message, metrics or None)

    def warning(self, message: str, **metrics: Any) -> dict[str, Any]:
        return self.emit(Level.WARNING, message, metrics or None)

    # ── Lifecycle ───────────────────────────────────────────────────────

    def close(self) -> None:
        if self._file_handle:
            self._file_handle.close()
            self._file_handle = None
