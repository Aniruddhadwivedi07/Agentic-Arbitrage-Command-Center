/* ============================================================
   FUNDING RATE SPREAD CHART — Canvas Renderer
   Dark futuristic chart with glowing lines and grid
   ============================================================ */

class FundingRateChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.animationFrame = null;
    this.time = 0;

    // Colors
    this.colors = {
      bg: '#0d1420',
      gridLine: 'rgba(255, 255, 255, 0.03)',
      gridLineMajor: 'rgba(255, 255, 255, 0.06)',
      axisLabel: 'rgba(148, 163, 184, 0.7)',
      cyan: '#00e5ff',
      cyanGlow: 'rgba(0, 229, 255, 0.25)',
      gold: '#fbbf24',
      goldGlow: 'rgba(251, 191, 36, 0.2)',
      purple: '#7c3aed',
      purpleGlow: 'rgba(124, 58, 237, 0.15)',
      volumeUp: 'rgba(0, 255, 136, 0.25)',
      volumeDown: 'rgba(255, 59, 92, 0.2)',
      threshold: 'rgba(124, 58, 237, 0.5)',
      crosshair: 'rgba(255, 255, 255, 0.1)',
    };

    // Chart padding
    this.padding = { top: 30, right: 60, bottom: 40, left: 60 };

    // Data
    this.dataPoints = 96; // 24h at 15-min intervals
    this.fundingSpread = [];
    this.aiPredicted = [];
    this.volumes = [];
    this.timestamps = [];
    this.threshold = 0.015;

    this.generateData();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  generateData() {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Generate realistic-looking funding rate spread data
    let spread = 0.005;
    let aiSpread = 0.006;

    for (let i = 0; i < this.dataPoints; i++) {
      const t = new Date(startTime.getTime() + (i * 15 * 60 * 1000));
      this.timestamps.push(t);

      // Simulated volatile spread with some patterns
      const noise = (Math.random() - 0.5) * 0.008;
      const trend = Math.sin(i * 0.08) * 0.01;
      const spike = (i > 55 && i < 65) ? Math.sin((i - 55) * 0.31) * 0.018 : 0;
      const spike2 = (i > 78 && i < 88) ? Math.sin((i - 78) * 0.31) * 0.015 : 0;

      spread = Math.max(-0.01, Math.min(0.04, spread + noise * 0.4 + trend * 0.1 + spike + spike2));
      spread = spread * 0.92 + (0.005 + noise + trend + spike + spike2) * 0.08;

      // AI prediction is smoother, slightly ahead
      const aiNoise = (Math.random() - 0.5) * 0.003;
      aiSpread = aiSpread * 0.85 + spread * 0.12 + (spread + 0.003) * 0.03 + aiNoise;

      this.fundingSpread.push(spread * 100); // Convert to percentage
      this.aiPredicted.push(aiSpread * 100);

      // Volume bars
      this.volumes.push(Math.random() * 80 + 20 + (spike > 0 ? 60 : 0) + (spike2 > 0 ? 40 : 0));
    }
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.scale(this.dpr, this.dpr);
    this.draw();
  }

  get chartLeft() { return this.padding.left; }
  get chartRight() { return this.width - this.padding.right; }
  get chartTop() { return this.padding.top; }
  get chartBottom() { return this.height - this.padding.bottom; }
  get chartWidth() { return this.chartRight - this.chartLeft; }
  get chartHeight() { return this.chartBottom - this.chartTop; }

  dataToX(index) {
    return this.chartLeft + (index / (this.dataPoints - 1)) * this.chartWidth;
  }

  dataToY(value, minVal, maxVal) {
    const range = maxVal - minVal || 1;
    return this.chartBottom - ((value - minVal) / range) * (this.chartHeight * 0.7);
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Background
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle vignette
    const vignette = ctx.createRadialGradient(
      this.width / 2, this.height / 2, this.width * 0.2,
      this.width / 2, this.height / 2, this.width * 0.8
    );
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);

    // Compute data range
    const allValues = [...this.fundingSpread, ...this.aiPredicted];
    const minVal = Math.min(...allValues) - 0.3;
    const maxVal = Math.max(...allValues) + 0.3;

    this.drawGrid(ctx, minVal, maxVal);
    this.drawThresholdLine(ctx, minVal, maxVal);
    this.drawVolumeBars(ctx);
    this.drawLine(ctx, this.aiPredicted, this.colors.gold, this.colors.goldGlow, minVal, maxVal, 1.5);
    this.drawLine(ctx, this.fundingSpread, this.colors.cyan, this.colors.cyanGlow, minVal, maxVal, 2);
    this.drawDataPoints(ctx, minVal, maxVal);
    this.drawAxes(ctx, minVal, maxVal);
  }

  drawGrid(ctx, minVal, maxVal) {
    const gridLinesH = 8;
    const gridLinesV = 12;

    ctx.strokeStyle = this.colors.gridLine;
    ctx.lineWidth = 0.5;

    // Horizontal grid lines
    for (let i = 0; i <= gridLinesH; i++) {
      const y = this.chartTop + (i / gridLinesH) * this.chartHeight;
      ctx.beginPath();
      ctx.strokeStyle = i % 2 === 0 ? this.colors.gridLineMajor : this.colors.gridLine;
      ctx.moveTo(this.chartLeft, y);
      ctx.lineTo(this.chartRight, y);
      ctx.stroke();
    }

    // Vertical grid lines
    for (let i = 0; i <= gridLinesV; i++) {
      const x = this.chartLeft + (i / gridLinesV) * this.chartWidth;
      ctx.beginPath();
      ctx.strokeStyle = i % 3 === 0 ? this.colors.gridLineMajor : this.colors.gridLine;
      ctx.moveTo(x, this.chartTop);
      ctx.lineTo(x, this.chartBottom);
      ctx.stroke();
    }
  }

  drawThresholdLine(ctx, minVal, maxVal) {
    const thresholdY = this.dataToY(this.threshold, minVal, maxVal);

    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = this.colors.threshold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.chartLeft, thresholdY);
    ctx.lineTo(this.chartRight, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Threshold label
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(124, 58, 237, 0.6)';
    ctx.textAlign = 'right';
    ctx.fillText('Threshold 0.015%', this.chartRight - 5, thresholdY - 5);
    ctx.restore();
  }

  drawVolumeBars(ctx) {
    const barWidth = Math.max(2, (this.chartWidth / this.dataPoints) * 0.6);
    const volumeHeight = this.chartHeight * 0.15;
    const volumeBottom = this.chartBottom;

    for (let i = 0; i < this.dataPoints; i++) {
      const x = this.dataToX(i) - barWidth / 2;
      const h = (this.volumes[i] / 160) * volumeHeight;
      const isUp = i > 0 ? this.fundingSpread[i] >= this.fundingSpread[i - 1] : true;

      ctx.fillStyle = isUp ? this.colors.volumeUp : this.colors.volumeDown;
      ctx.fillRect(x, volumeBottom - h, barWidth, h);
    }
  }

  drawLine(ctx, data, color, glowColor, minVal, maxVal, lineWidth) {
    if (data.length < 2) return;

    ctx.save();

    // Glow layer
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = lineWidth + 6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.dataToX(0), this.dataToY(data[0], minVal, maxVal));
    for (let i = 1; i < data.length; i++) {
      const x = this.dataToX(i);
      const y = this.dataToY(data[i], minVal, maxVal);
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Mid glow
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = lineWidth + 3;
    ctx.beginPath();
    ctx.moveTo(this.dataToX(0), this.dataToY(data[0], minVal, maxVal));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(this.dataToX(i), this.dataToY(data[i], minVal, maxVal));
    }
    ctx.stroke();

    // Main line
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(this.dataToX(0), this.dataToY(data[0], minVal, maxVal));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(this.dataToX(i), this.dataToY(data[i], minVal, maxVal));
    }
    ctx.stroke();

    // Gradient fill beneath line
    ctx.beginPath();
    ctx.moveTo(this.dataToX(0), this.dataToY(data[0], minVal, maxVal));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(this.dataToX(i), this.dataToY(data[i], minVal, maxVal));
    }
    ctx.lineTo(this.dataToX(data.length - 1), this.chartBottom);
    ctx.lineTo(this.dataToX(0), this.chartBottom);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, this.chartTop, 0, this.chartBottom);
    const baseColor = color === this.colors.cyan ? '0, 229, 255' : '251, 191, 36';
    gradient.addColorStop(0, `rgba(${baseColor}, 0.08)`);
    gradient.addColorStop(1, `rgba(${baseColor}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.restore();
  }

  drawDataPoints(ctx, minVal, maxVal) {
    // Draw a pulsing dot at the latest data point
    const lastIdx = this.fundingSpread.length - 1;
    const x = this.dataToX(lastIdx);
    const y = this.dataToY(this.fundingSpread[lastIdx], minVal, maxVal);
    const pulseRadius = 4 + Math.sin(this.time * 3) * 1.5;

    // Outer glow
    ctx.beginPath();
    ctx.arc(x, y, pulseRadius + 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 229, 255, 0.1)';
    ctx.fill();

    // Mid glow
    ctx.beginPath();
    ctx.arc(x, y, pulseRadius + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 229, 255, 0.2)';
    ctx.fill();

    // Core dot
    ctx.beginPath();
    ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.cyan;
    ctx.fill();

    // Same for AI prediction
    const yAi = this.dataToY(this.aiPredicted[lastIdx], minVal, maxVal);
    ctx.beginPath();
    ctx.arc(x, yAi, 3, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.gold;
    ctx.fill();
  }

  drawAxes(ctx, minVal, maxVal) {
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = this.colors.axisLabel;

    // Y-axis labels (funding rate %)
    const ySteps = 6;
    const range = maxVal - minVal;
    ctx.textAlign = 'right';
    for (let i = 0; i <= ySteps; i++) {
      const value = maxVal - (i / ySteps) * range;
      const y = this.chartTop + (i / ySteps) * (this.chartHeight * 0.7);
      ctx.fillText(value.toFixed(3) + '%', this.chartLeft - 8, y + 4);
    }

    // X-axis labels (timestamps)
    ctx.textAlign = 'center';
    const labelInterval = Math.floor(this.dataPoints / 6);
    for (let i = 0; i < this.dataPoints; i += labelInterval) {
      const x = this.dataToX(i);
      const time = this.timestamps[i];
      if (time) {
        const hours = time.getHours().toString().padStart(2, '0');
        const mins = time.getMinutes().toString().padStart(2, '0');
        ctx.fillText(`${hours}:${mins}`, x, this.chartBottom + 18);
      }
    }

    // Y-axis title
    ctx.save();
    ctx.translate(14, this.chartTop + this.chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '9px "Inter", sans-serif';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.textAlign = 'center';
    ctx.fillText('% FUNDING RATE', 0, 0);
    ctx.restore();

    // Current value label
    const lastVal = this.fundingSpread[this.fundingSpread.length - 1];
    const lastY = this.dataToY(lastVal, minVal, maxVal);
    ctx.fillStyle = 'rgba(0, 229, 255, 0.9)';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(lastVal.toFixed(3) + '%', this.chartRight + 8, lastY + 4);
  }

  animate() {
    this.time += 0.016; // ~60fps
    this.draw();
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  addDataPoint() {
    // Shift data left and add new point
    const lastSpread = this.fundingSpread[this.fundingSpread.length - 1];
    const lastAi = this.aiPredicted[this.aiPredicted.length - 1];

    const noise = (Math.random() - 0.5) * 0.006;
    const newSpread = Math.max(-0.5, Math.min(3.5, lastSpread + noise));
    const aiNoise = (Math.random() - 0.5) * 0.002;
    const newAi = lastAi * 0.88 + newSpread * 0.1 + (newSpread + 0.2) * 0.02 + aiNoise;
    const newVolume = Math.random() * 80 + 20;

    this.fundingSpread.shift();
    this.fundingSpread.push(newSpread);
    this.aiPredicted.shift();
    this.aiPredicted.push(newAi);
    this.volumes.shift();
    this.volumes.push(newVolume);

    const lastTime = this.timestamps[this.timestamps.length - 1];
    this.timestamps.shift();
    this.timestamps.push(new Date(lastTime.getTime() + 15 * 60 * 1000));
  }

  start() {
    this.animate();
    // Add new data point every 3 seconds for visual effect
    this.dataInterval = setInterval(() => this.addDataPoint(), 3000);
  }

  destroy() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    if (this.dataInterval) clearInterval(this.dataInterval);
  }
}
