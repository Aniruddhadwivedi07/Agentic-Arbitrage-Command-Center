# Agentic Arbitrage Command Center

A professional, sophisticated cryptocurrency trading dashboard interface designed with a complex, high-density layout mimicking the dark mode, data-rich aesthetic of Binance, tailored for an "Agentic Arbitrage Command Center."

## Features

- **Top Header**: Real-time BTC/USDT price ticker, total wallet balance, notifications, and user profile.
- **Left Sidebar**: Dark menu with icons and active strategy panel showing Delta-Neutral Funding Rate status.
- **Strategy Context**: Key metrics including Active Agents, Opportunities Scanned, Executions, 24h P&L, and Total Profit.
- **Main Chart**: Complex financial chart (BTC/USDT) showing the Funding Rate Differential (Binance vs Bybit) with actual and AI-predicted spreads.
- **Agent Orchestrator Logs**: A scrolling terminal feed visualizing the agent's logic steps (Scan, Analyze, Orchestrate, Execute).
- **Active Positions**: Table tracking specific executed cycles including size, entry, mark price, net P&L, and funding P&L.

## Technology Stack

- **HTML5**: Semantic structure.
- **Vanilla CSS3**: Custom design system, CSS variables, flexbox/grid layouts, animations, glassmorphism, and neon glow effects. No external CSS frameworks are used.
- **Vanilla JavaScript**: Chart rendering via HTML5 Canvas, live data simulation, log generation, and DOM manipulation.

## Visual Design

The UI is dark, modern, and futuristic, with subtle "anti-gravity" visual elements like glowing borders, floating data panels with depth, and radiant cyan and purple light accents. It's designed to feel complex, active, and highly professional.

## Getting Started

Simply open `index.html` in any modern web browser to view the live dashboard simulation. No build tools or local servers are required.

## Structure

- `index.html`: The main structural layout of the dashboard.
- `styles.css`: The complete design system and responsive styling.
- `chart.js`: A custom, lightweight canvas engine for rendering the live funding rate spread chart.
- `app.js`: Application logic for simulating live market data, generating agent logs, and managing active positions.
