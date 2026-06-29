const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

// 1. Start the WebSocket Server
const wss = new WebSocketServer({ port: 8080 });
console.log('WebSocket server listening on ws://localhost:8080');

let clients = [];
const logHistory = [];
let activePositions = [];
let pendingExecution = {};

wss.on('connection', (ws) => {
  console.log('Frontend client connected');
  clients.push(ws);

  // Send historical sync immediately
  const syncPayload = {
    type: 'SYNC_HISTORY',
    logs: logHistory,
    positions: activePositions
  };
  ws.send(JSON.stringify(syncPayload));

  ws.on('close', () => {
    console.log('Frontend client disconnected');
    clients = clients.filter(client => client !== ws);
  });
});

function broadcast(payload) {
  const dataStr = JSON.stringify(payload);
  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(dataStr);
    }
  });
}

// 2. Spawn the Python Engine
console.log('Starting Python Engine...');
const pythonProcess = spawn('python3', ['-m', 'engine.main', '--symbol', 'ETH/USDT']);

let buffer = '';

pythonProcess.stdout.on('data', (data) => {
  buffer += data.toString();
  let lines = buffer.split('\n');
  // Keep the last incomplete line in the buffer
  buffer = lines.pop();

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      
      // 1. Maintain Rolling Log History
      logHistory.push(parsed);
      if (logHistory.length > 100) {
        logHistory.shift();
      }

      // 2. Maintain Active Positions State
      if (parsed.level === 'EXECUTE' && parsed.metrics) {
        const m = parsed.metrics;
        
        if (m.buy_exchange && m.sell_exchange) {
          pendingExecution.buy_exchange = m.buy_exchange;
          pendingExecution.sell_exchange = m.sell_exchange;
          pendingExecution.size = m.size;
        }
        if (m.buy_price && m.sell_price) {
          pendingExecution.buy_price = m.buy_price;
          pendingExecution.sell_price = m.sell_price;
        }
        
        if (m.cycle_id !== undefined && m.pnl === 0.0) {
          pendingExecution.cycle_id = m.cycle_id;
          activePositions.push({
            id: pendingExecution.cycle_id,
            asset: 'ETH/USDT',
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
          pendingExecution = {};
        }
        
        if (m.cycle_id !== undefined && m.pnl !== undefined && m.cumulative_pnl !== undefined) {
          activePositions = activePositions.filter(p => p.id !== m.cycle_id);
        }
      }

      // 3. Broadcast to all clients
      broadcast({ type: 'LIVE_STREAM', data: parsed });

    } catch (e) {
      // Ignore non-JSON output
    }
  }
});

pythonProcess.stderr.on('data', (data) => {
  // Pass stderr to the Node console so we can see the Python banner and errors
  process.stderr.write(data);
});

pythonProcess.on('close', (code) => {
  console.log(`Python engine exited with code ${code}`);
  process.exit(code);
});

// 3. Graceful Shutdown (Kill Switch)
function shutdown() {
  console.log('\nReceived shutdown signal. Sending KILL command to Python engine...');
  if (pythonProcess && !pythonProcess.killed) {
    // Send KILL to python's stdin
    pythonProcess.stdin.write('KILL\n');
    
    // Give it a few seconds to liquidate and exit, then forcefully kill
    setTimeout(() => {
      console.log('Force killing Python process after timeout...');
      pythonProcess.kill('SIGTERM');
      process.exit(0);
    }, 5000);
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
