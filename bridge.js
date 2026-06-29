const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

// 1. Start the WebSocket Server
const wss = new WebSocketServer({ port: 8080 });
console.log('WebSocket server listening on ws://localhost:8080');

let clients = [];

wss.on('connection', (ws) => {
  console.log('Frontend client connected');
  clients.push(ws);

  ws.on('close', () => {
    console.log('Frontend client disconnected');
    clients = clients.filter(client => client !== ws);
  });
});

function broadcast(data) {
  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(data);
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
      // Validate it's JSON before broadcasting
      const parsed = JSON.parse(line);
      broadcast(line);
    } catch (e) {
      // It might be non-JSON logs (like the startup banner on stderr, but we are reading stdout)
      // Actually, banner is on stderr, so stdout should be clean JSON.
      // But just in case, we ignore non-JSON.
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
