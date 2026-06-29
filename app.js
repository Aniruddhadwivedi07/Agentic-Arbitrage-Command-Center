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

  const initialLogs = [
    {
      time: '14:28:14',
      agent: 'AGENT_01',
      action: 'status',
      actionLabel: 'STATUS',
      message: 'System initialized. Monitoring <hl>BTC/USDT</hl> funding rates across <num>12</num> venues.'
    },
    {
      time: '14:29:02',
      agent: 'AGENT_01',
      action: 'scan',
      actionLabel: 'SCAN',
      message: 'Scanning funding rate differentials... <num>7,411</num> opportunities analyzed in last 24h.'
    },
    {
      time: '14:30:15',
      agent: 'AGENT_01',
      action: 'scan',
      actionLabel: 'SCAN',
      message: 'BTC/USDT rate check — Binance: <num>0.028%</num>, Bybit: <num>0.009%</num>. Spread: <num>0.019%</num>. Below threshold.'
    },
    {
      time: '14:31:22',
      agent: 'AGENT_01',
      action: 'scan',
      actionLabel: 'SCAN',
      message: 'ETH/USDT rate check — Binance: <num>0.022%</num>, OKX: <num>0.018%</num>. Spread: <num>0.004%</num>. Insufficient.'
    },
    {
      time: '14:32:01',
      agent: 'AGENT_01',
      action: 'scan',
      actionLabel: 'SCAN',
      message: 'BTC/USDT Funding Rate disparity detected. Binance: <num>0.031%</num>, Bybit: <num>0.008%</num> (Spread: <hl>0.023%</hl>). Threshold (<num>0.015%</num>) Met.'
    },
    {
      time: '14:32:03',
      agent: 'AGENT_01',
      action: 'analyze',
      actionLabel: 'ANALYZING',
      message: 'Market depth verified, volatility nominal, execution risk &lt; <num>10%</num>. Optimal conditions confirmed.'
    },
    {
      time: '14:32:05',
      agent: 'AGENT_01',
      action: 'orchestrate',
      actionLabel: 'ORCHESTRATION',
      message: 'Initiating <num>3 BTC</num> arbitrage cycle. Strategy: <hl>Long Bybit (Receiver)</hl>, <hl>Short Binance (Payer)</hl>.'
    },
    {
      time: '14:32:07',
      agent: 'AGENT_01',
      action: 'execute',
      actionLabel: 'EXECUTING',
      message: 'Placing orders. <num>3 BTC</num> Long @ Bybit (<num>68201.5</num>), <num>3 BTC</num> Short @ Binance (<num>68205.2</num>).'
    },
    {
      time: '14:32:08',
      agent: 'AGENT_01',
      action: 'confirm',
      actionLabel: 'CONFIRMATION',
      message: 'Positions active. <hl>3 BTC Cycle Initiated</hl>. Monitoring delta exposure.'
    },
    {
      time: '14:32:12',
      agent: 'AGENT_01',
      action: 'status',
      actionLabel: 'STATUS',
      message: 'Delta neutral. Net exposure: <num>0.0002 BTC</num>. Monitoring position health.'
    },
    {
      time: '14:35:44',
      agent: 'AGENT_01',
      action: 'status',
      actionLabel: 'STATUS',
      message: 'Position health check: P&L <hl>+$12.40</hl>, Funding accrual <hl>+$8.20</hl>. Delta within bounds.'
    },
    {
      time: '14:40:18',
      agent: 'AGENT_01',
      action: 'scan',
      actionLabel: 'SCAN',
      message: 'Continuous scan active. Next funding in <num>3h 19m</num>. Rate convergence: <num>0.018%</num>.'
    },
  ];

  // Additional log templates for live simulation
  const liveLogTemplates = [
    {
      action: 'scan',
      actionLabel: 'SCAN',
      messages: [
        'BTC/USDT rate check — Binance: <num>{rate1}%</num>, Bybit: <num>{rate2}%</num>. Spread: <num>{spread}%</num>. {verdict}',
        'Cross-venue scan complete. <num>{venues}</num> venues checked. No actionable spread detected.',
        'ETH/USDT Binance: <num>{rate1}%</num>, OKX: <num>{rate2}%</num>. Spread: <num>{spread}%</num>. Monitoring.',
        'SOL/USDT rate differential: <num>{spread}%</num>. Below threshold. Skipping.',
        'Funding countdown: <num>{timer}</num> until next settlement. Current spread: <num>{spread}%</num>.',
      ]
    },
    {
      action: 'status',
      actionLabel: 'STATUS',
      messages: [
        'Position health: P&L <hl>+${pnl}</hl>, Funding accrual <hl>+${funding}</hl>. All systems nominal.',
        'Delta exposure: <num>{delta} BTC</num>. Within risk parameters. No rebalance needed.',
        'Heartbeat OK. Latency — Binance: <num>{lat1}ms</num>, Bybit: <num>{lat2}ms</num>. Connections stable.',
        'Risk monitor: Portfolio VaR <num>{var}%</num>. Max drawdown today: <num>{dd}%</num>.',
        'Memory usage nominal. <num>{opps}</num> opportunities processed this cycle.',
      ]
    },
    {
      action: 'analyze',
      actionLabel: 'ANALYZING',
      messages: [
        'Order book depth analysis: Binance bid stack <num>{depth1} BTC</num>, Bybit ask stack <num>{depth2} BTC</num>.',
        'Volatility regime: <hl>{regime}</hl>. Adjusting position size parameters.',
        'Fee optimization: Maker fee <num>{fee}%</num>. Estimated execution cost: <num>${cost}</num>.',
        'Correlation check: BTC-ETH <num>{corr}</num>. Cross-asset risk: nominal.',
      ]
    },
    {
      action: 'warning',
      actionLabel: 'WARNING',
      messages: [
        'Latency spike detected on Bybit WebSocket: <num>{lat}ms</num>. Monitoring.',
        'Funding spread narrowing. Current: <num>{spread}%</num>. Close to threshold.',
        'Rate limit approaching on Binance API. <num>{remaining}</num> requests remaining.',
      ]
    },
  ];

  function formatLogEntry(log) {
    let msg = log.message;
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

  function renderInitialLogs() {
    let html = '';
    for (const log of initialLogs) {
      html += formatLogEntry(log);
    }
    html += '<span class="log-cursor"></span>';
    logsContainer.innerHTML = html;
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }

  function generateLiveLog() {
    const template = liveLogTemplates[Math.floor(Math.random() * liveLogTemplates.length)];
    const msgTemplate = template.messages[Math.floor(Math.random() * template.messages.length)];

    const now = new Date();
    const time = now.toISOString().substr(11, 8);

    // Fill in template values
    let message = msgTemplate
      .replace('{rate1}', (Math.random() * 0.03 + 0.01).toFixed(3))
      .replace('{rate2}', (Math.random() * 0.02 + 0.005).toFixed(3))
      .replace('{spread}', (Math.random() * 0.025 + 0.002).toFixed(3))
      .replace('{verdict}', Math.random() > 0.7 ? '<hl>Approaching threshold</hl>.' : 'Below threshold.')
      .replace('{venues}', Math.floor(Math.random() * 4 + 8))
      .replace('{timer}', `${Math.floor(Math.random() * 4)}h ${Math.floor(Math.random() * 59)}m`)
      .replace('{pnl}', (Math.random() * 40 + 10).toFixed(2))
      .replace('{funding}', (Math.random() * 20 + 5).toFixed(2))
      .replace('{delta}', (Math.random() * 0.001).toFixed(4))
      .replace('{lat1}', Math.floor(Math.random() * 20 + 8))
      .replace('{lat2}', Math.floor(Math.random() * 30 + 12))
      .replace('{var}', (Math.random() * 2 + 0.5).toFixed(2))
      .replace('{dd}', (Math.random() * 0.5 + 0.1).toFixed(2))
      .replace('{opps}', Math.floor(Math.random() * 200 + 50))
      .replace('{depth1}', (Math.random() * 50 + 20).toFixed(1))
      .replace('{depth2}', (Math.random() * 40 + 15).toFixed(1))
      .replace('{regime}', ['Low Volatility', 'Normal', 'Elevated', 'Trending'][Math.floor(Math.random() * 4)])
      .replace('{fee}', (Math.random() * 0.02 + 0.01).toFixed(3))
      .replace('{cost}', (Math.random() * 5 + 1).toFixed(2))
      .replace('{corr}', (Math.random() * 0.3 + 0.6).toFixed(3))
      .replace('{lat}', Math.floor(Math.random() * 200 + 150))
      .replace('{remaining}', Math.floor(Math.random() * 500 + 200));

    return {
      time: time,
      agent: 'AGENT_01',
      action: template.action,
      actionLabel: template.actionLabel,
      message: message
    };
  }

  function addLiveLog() {
    const log = generateLiveLog();
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

  renderInitialLogs();
  // Add new log every 4-8 seconds
  setInterval(addLiveLog, 4000 + Math.random() * 4000);
  setTimeout(addLiveLog, 2000);

  // ═══════════════════════════════════════
  // ACTIVE POSITIONS TABLE
  // ═══════════════════════════════════════
  const positionsBody = document.getElementById('positionsBody');

  const positions = [
    {
      asset: 'BTC/USDT',
      pair: 'Bin — Byb',
      strategy: 'Funding Rate',
      sideLong: 'Long Bybit',
      sideShort: 'Short Binance',
      size: '3.00 BTC',
      entryBybit: 68201.50,
      entryBinance: 68205.20,
      markPrice: 68198.80,
      netPnl: 34.12,
      netPnlPct: 0.11,
      fundingPnl: 18.90,
      durationHours: 3,
      durationMins: 41,
    },
    {
      asset: 'ETH/USDT',
      pair: 'Bin — OKX',
      strategy: 'Funding Rate',
      sideLong: 'Long OKX',
      sideShort: 'Short Binance',
      size: '22.50 ETH',
      entryBybit: 3842.15,
      entryBinance: 3843.80,
      markPrice: 3841.50,
      netPnl: 18.75,
      netPnlPct: 0.08,
      fundingPnl: 12.40,
      durationHours: 1,
      durationMins: 18,
    },
    {
      asset: 'SOL/USDT',
      pair: 'Byb — OKX',
      strategy: 'Funding Rate',
      sideLong: 'Long OKX',
      sideShort: 'Short Bybit',
      size: '145.00 SOL',
      entryBybit: 142.88,
      entryBinance: 143.02,
      markPrice: 142.95,
      netPnl: -8.22,
      netPnlPct: -0.04,
      fundingPnl: 6.15,
      durationHours: 0,
      durationMins: 52,
    },
  ];

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
          <td>${pos.entryBybit.toFixed(2)} / ${pos.entryBinance.toFixed(2)}</td>
          <td>${pos.markPrice.toFixed(2)}</td>
          <td>
            <span class="pnl-badge ${pnlClass}">
              ${pnlSign}${pos.netPnl.toFixed(2)} USDT (${pctSign}${pos.netPnlPct.toFixed(2)}%)
            </span>
          </td>
          <td class="td-positive">+${pos.fundingPnl.toFixed(2)} USDT</td>
          <td class="td-duration">${pos.durationHours}h ${pos.durationMins}m</td>
          <td>
            <button class="btn-close-position" data-asset="${pos.asset}">Close Position</button>
          </td>
        </tr>
      `;
    }
    positionsBody.innerHTML = html;
  }

  renderPositions();

  // ═══════════════════════════════════════
  // LIVE DATA SIMULATION
  // ═══════════════════════════════════════
  let btcBasePrice = 68205.21;
  let walletBalance = 84310.88;

  function updateLiveData() {
    // Simulate BTC price movement
    const priceChange = (Math.random() - 0.48) * 15; // slight upward bias
    btcBasePrice += priceChange;
    const pctChange = ((btcBasePrice - 67256) / 67256 * 100); // from a "yesterday" reference

    const priceEl = document.getElementById('btcPrice');
    const changeEl = document.getElementById('btcChange');

    priceEl.textContent = '$' + btcBasePrice.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    changeEl.textContent = (pctChange >= 0 ? '+' : '') + pctChange.toFixed(2) + '%';
    changeEl.className = 'ticker-change ' + (pctChange >= 0 ? 'positive' : 'negative');

    // Update wallet balance slightly
    walletBalance += (Math.random() - 0.4) * 2;
    document.getElementById('walletBalance').textContent = '$' +
      walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USDT';

    // Update opportunities scanned
    const scannedEl = document.getElementById('oppsScanned');
    const current = parseInt(scannedEl.textContent.replace(/,/g, ''));
    scannedEl.textContent = (current + Math.floor(Math.random() * 5 + 1)).toLocaleString();

    // Update positions P&L
    for (const pos of positions) {
      pos.netPnl += (Math.random() - 0.45) * 1.5;
      pos.netPnlPct = pos.netPnl / (pos.strategy === 'Funding Rate' ? 30000 : 10000) * 100;
      pos.fundingPnl += Math.random() * 0.15;
      pos.markPrice += (Math.random() - 0.5) * 3;
      pos.durationMins += 1;
      if (pos.durationMins >= 60) {
        pos.durationMins = 0;
        pos.durationHours += 1;
      }
    }
    renderPositions();

    // Update daily P&L
    const dailyPnlEl = document.getElementById('dailyPnl');
    const totalProfitEl = document.getElementById('totalProfit');
    const totalPnl = positions.reduce((s, p) => s + p.netPnl, 0);
    const baseDailyPnl = 214.50 + totalPnl * 0.1;
    dailyPnlEl.textContent = '+$' + baseDailyPnl.toFixed(2);

    const baseTotalProfit = 4310.88 + totalPnl * 0.05;
    totalProfitEl.textContent = '$' + baseTotalProfit.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // Update every 2 seconds
  setInterval(updateLiveData, 2000);

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
