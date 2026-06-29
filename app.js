/* ============================================================
   AGENTIC ARBITRAGE COMMAND CENTER — Application Logic
   Live data simulation, agent logs, positions, and interactivity
   ============================================================ */

(function () {
  'use strict';

  // ═══════════════════════════════════════
  // CHART INITIALIZATION
  // ═══════════════════════════════════════
  const chart = new FundingRateChart('fundingChart');
  chart.start();

  // ═══════════════════════════════════════
  // AGENT ORCHESTRATOR LOGS
  // ═══════════════════════════════════════
  const logsContainer = document.getElementById('logsContainer');

  const initialLogs = []; // Intentionally left empty as we use SYNC_HISTORY now.
  
  function formatLogEntry(log) {
    let msg = log.message || '';
    // Replace <hl> tags with highlight spans
    msg = msg.replace(/<hl>(.*?)<\/hl>/g, '<span class="log-highlight">$1</span>');
    msg = msg.replace(/<num>(.*?)<\/num>/g, '<span class="log-number">$1</span>');

    return `<div class="log-entry">` +
      `<span class="log-timestamp">[${log.time} UTC]</span> ` +
      `<span class="log-agent">[${log.agent}]</span> ` +
      `<span class="log-action ${log.action}">${log.actionLabel}:</span> ` +
      `<span class="log-message">${msg}</span>` +
      `</div>`;
  }

  // ═══════════════════════════════════════
  // WEBSOCKET CONNECTION TO PYTHON ENGINE
  // ═══════════════════════════════════════
  const ws = new WebSocket('ws://localhost:8080');

  let pendingExecution = {};

  ws.onopen = () => {
    addLiveLog({
      time: new Date().toISOString().substr(11, 8),
      agent: 'SYSTEM',
      action: 'status',
      actionLabel: 'CONNECTED',
      message: 'WebSocket bridge established. Listening to Python engine telemetry.'
    });
  };

  ws.onclose = () => {
    addLiveLog({
      time: new Date().toISOString().substr(11, 8),
      agent: 'SYSTEM',
      action: 'warning',
      actionLabel: 'DISCONNECTED',
      message: 'WebSocket bridge closed. Engine offline.'
    });
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      
      if (msg.type === 'SYNC_HISTORY') {
        logsContainer.innerHTML = '';
        positionsBody.innerHTML = '';
        positions = msg.positions || [];
        
        (msg.logs || []).forEach(logData => {
          processLiveMessage(logData, true);
        });
        
        // Re-add cursor after bulk insert
        const cursorSpan = document.createElement('span');
        cursorSpan.className = 'log-cursor';
        logsContainer.appendChild(cursorSpan);
        logsContainer.scrollTop = logsContainer.scrollHeight;
        
        renderPositions();
      } else if (msg.type === 'LIVE_STREAM') {
        processLiveMessage(msg.data, false);
      } else {
        processLiveMessage(msg, false); // Fallback
      }
    } catch (e) {
      console.error("Error processing WS message:", e);
    }
  };

  function processLiveMessage(data, isSync) {
    // 1. Append Log
    const actionMap = {
      'SCAN': 'scan',
      'ANALYZE': 'analyze',
      'EXECUTE': 'execute',
      'STATUS': 'status',
      'WARNING': 'warning'
    };
    
    const actionClass = actionMap[data.level] || 'status';
    const logEntry = {
      time: data.timestamp ? data.timestamp.substr(11, 8) : new Date().toISOString().substr(11, 8),
      agent: data.agent || 'AGENT_01',
      action: actionClass,
      actionLabel: data.level || 'INFO',
      message: data.message
    };
    
    if (isSync) {
      const div = document.createElement('div');
      div.innerHTML = formatLogEntry(logEntry);
      logsContainer.appendChild(div.firstElementChild);
    } else {
      addLiveLog(logEntry);
    }

    // 2. Global Stats Update (from STATUS)
    if (data.level === 'STATUS' && data.metrics) {
      if (data.metrics.total_scans !== undefined) {
        document.getElementById('oppsScanned').textContent = data.metrics.total_scans.toLocaleString();
      }
      if (data.metrics.total_executions !== undefined) {
        document.getElementById('executions').textContent = data.metrics.total_executions.toLocaleString();
      }
      if (data.metrics.session_pnl !== undefined) {
        const pnl = data.metrics.session_pnl;
        const pnlEl = document.getElementById('dailyPnl');
        pnlEl.textContent = (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2);
        pnlEl.className = 'stat-card-value ' + (pnl >= 0 ? 'positive' : 'negative');
      }
    }

    // Update Ticker with live spread from SCAN
    if (data.level === 'SCAN' && data.metrics && data.metrics.spread_pct !== undefined) {
      const spreadPct = data.metrics.spread_pct;
      const changeEl = document.getElementById('btcChange');
      changeEl.textContent = 'Spread: ' + spreadPct.toFixed(4) + '%';
      changeEl.className = 'ticker-change ' + (spreadPct > 0.015 ? 'positive' : '');
    }

    // 3. Dynamic Positions Table Update (from EXECUTE)
    if (!isSync && data.level === 'EXECUTE' && data.metrics) {
      const m = data.metrics;
      
      // Step 1: Orchestration Phase
      if (m.buy_exchange && m.sell_exchange) {
        pendingExecution.buy_exchange = m.buy_exchange;
        pendingExecution.sell_exchange = m.sell_exchange;
        pendingExecution.size = m.size;
      }
      
      // Step 2: Execution Phase (Fills)
      if (m.buy_price && m.sell_price) {
        pendingExecution.buy_price = m.buy_price;
        pendingExecution.sell_price = m.sell_price;
      }
      
      // Step 3: Confirmation Phase (Cycle created)
      if (m.cycle_id !== undefined && m.pnl === 0.0) {
        pendingExecution.cycle_id = m.cycle_id;
        pendingExecution.opened_at = new Date();
        positions.push({
          id: pendingExecution.cycle_id,
          asset: 'ETH/USDT', // Based on script arg
          pair: `${pendingExecution.buy_exchange.substring(0,3)} — ${pendingExecution.sell_exchange.substring(0,3)}`,
          strategy: 'Funding Rate',
          sideLong: `Long ${pendingExecution.buy_exchange}`,
          sideShort: `Short ${pendingExecution.sell_exchange}`,
          size: `${pendingExecution.size} ETH`,
          entryBuy: pendingExecution.buy_price || 0,
          entrySell: pendingExecution.sell_price || 0,
          markPrice: pendingExecution.buy_price || 0,
          netPnl: 0,
          netPnlPct: 0,
          fundingPnl: 0,
          openedAt: Date.now()
        });
        pendingExecution = {}; // reset
        renderPositions();
      }
      
      // Step 4: Liquidation / Closing Phase
      if (m.cycle_id !== undefined && m.pnl !== undefined && m.cumulative_pnl !== undefined) {
        // Remove the position
        positions = positions.filter(p => p.id !== m.cycle_id);
        renderPositions();
      }
    }
  }

  function addLiveLog(log) {
    const cursor = logsContainer.querySelector('.log-cursor');
    if (cursor) cursor.remove();

    const div = document.createElement('div');
    div.innerHTML = formatLogEntry(log);
    logsContainer.appendChild(div.firstElementChild);

    // Add cursor back
    const cursorSpan = document.createElement('span');
    cursorSpan.className = 'log-cursor';
    logsContainer.appendChild(cursorSpan);

    // Keep log buffer manageable
    const entries = logsContainer.querySelectorAll('.log-entry');
    if (entries.length > 50) {
      entries[0].remove();
    }

    logsContainer.scrollTop = logsContainer.scrollHeight;
  }

  // ═══════════════════════════════════════
  // ACTIVE POSITIONS TABLE
  // ═══════════════════════════════════════
  const positionsBody = document.getElementById('positionsBody');

  let positions = [];

  function renderPositions() {
    let html = '';
    for (const pos of positions) {
      const pnlClass = pos.netPnl >= 0 ? 'positive' : 'negative';
      const pnlSign = pos.netPnl >= 0 ? '+' : '';
      const pctSign = pos.netPnlPct >= 0 ? '+' : '';

      html += `
        <tr>
          <td class="td-asset">${pos.asset}</td>
          <td class="td-pair">${pos.pair}</td>
          <td>${pos.strategy}</td>
          <td>
            <span class="td-side-long">${pos.sideLong}</span> /
            <span class="td-side-short">${pos.sideShort}</span>
          </td>
          <td>${pos.size}</td>
          <td>${pos.entryBuy.toFixed(2)} / ${pos.entrySell.toFixed(2)}</td>
          <td>${pos.markPrice.toFixed(2)}</td>
          <td>
            <span class="pnl-badge ${pnlClass}">
              ${pnlSign}${pos.netPnl.toFixed(2)} USDT (${pctSign}${pos.netPnlPct.toFixed(2)}%)
            </span>
          </td>
          <td class="td-positive">+${pos.fundingPnl.toFixed(2)} USDT</td>
          <td class="td-duration">${Math.floor((Date.now() - pos.openedAt) / 3600000)}h ${Math.floor(((Date.now() - pos.openedAt) % 3600000) / 60000)}m</td>
          <td>
            <button class="btn-close-position" data-asset="${pos.asset}">Close Position</button>
          </td>
        </tr>
      `;
    }
    positionsBody.innerHTML = html;
  }

  renderPositions();

  // Update durations every minute
  setInterval(() => {
    if (positions.length > 0) renderPositions();
  }, 60000);

  // ═══════════════════════════════════════
  // SIDEBAR NAVIGATION
  // ═══════════════════════════════════════
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // ═══════════════════════════════════════
  // CLOSE POSITION BUTTONS
  // ═══════════════════════════════════════
  positionsBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-close-position')) {
      const asset = e.target.getAttribute('data-asset');
      e.target.textContent = 'Closing...';
      e.target.disabled = true;
      e.target.style.opacity = '0.5';

      // Simulate close animation
      setTimeout(() => {
        const row = e.target.closest('tr');
        row.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        row.style.opacity = '0';
        row.style.transform = 'translateX(30px)';
        setTimeout(() => {
          // Add a log entry about the close
          const log = {
            time: new Date().toISOString().substr(11, 8),
            agent: 'AGENT_01',
            action: 'execute',
            actionLabel: 'CLOSE',
            message: `Position closed: <hl>${asset}</hl>. Realized P&L captured.`
          };
          const cursor = logsContainer.querySelector('.log-cursor');
          if (cursor) cursor.remove();
          const div = document.createElement('div');
          div.innerHTML = formatLogEntry(log);
          logsContainer.appendChild(div.firstElementChild);
          const cursorSpan = document.createElement('span');
          cursorSpan.className = 'log-cursor';
          logsContainer.appendChild(cursorSpan);
          logsContainer.scrollTop = logsContainer.scrollHeight;

          row.remove();
        }, 500);
      }, 1200);
    }
  });

  // ═══════════════════════════════════════
  // KEYBOARD SHORTCUT HINT
  // ═══════════════════════════════════════
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Could toggle a settings panel
    }
  });

  console.log(
    '%c⚡ AGENTIC ARBITRAGE COMMAND CENTER — Online',
    'color: #00e5ff; font-size: 14px; font-weight: bold; text-shadow: 0 0 10px rgba(0, 229, 255, 0.5);'
  );
  console.log(
    '%cDelta-Neutral Funding Rate Strategy Active. Monitoring cross-venue spreads.',
    'color: #94a3b8; font-size: 11px;'
  );

})();
