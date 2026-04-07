/**
 * Ghost Lens Animated Overlay Renderer
 * Creates beautiful SVG annotations with sequential animations
 */

export class AnimatedHelpOverlay {
  constructor(helpItems, options = {}) {
    this.helpItems = helpItems || [];
    this.options = {
      svgZIndex: 10000,
      textZIndex: 10001,
      animationDuration: 400, // ms per item
      delayBetweenItems: 300, // ms
      arrowColor: 'rgba(0, 200, 255, 0.6)',
      textColor: '#a8f0ff',
      ...options,
    };
    this.svgLayer = null;
    this.textElements = [];
  }

  /**
   * Render the animated overlay
   */
  render() {
    this._createSVGLayer();
    this._createTextElements();
    this._startSequentialAnimation();
  }

  /**
   * Create SVG layer for arrows and lines
   */
  _createSVGLayer() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', window.innerWidth);
    svg.setAttribute('height', window.innerHeight);
    svg.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: ${this.options.svgZIndex};
    `;
    svg.id = 'ghost-lens-svg-overlay';

    // Add defs for arrow markers
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3, 0 6');
    polygon.setAttribute('fill', this.options.arrowColor);

    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);

    document.body.appendChild(svg);
    this.svgLayer = svg;
  }

  /**
   * Create text overlay elements
   */
  _createTextElements() {
    this.helpItems.forEach((item, idx) => {
      if (!item.position) return; // Skip items without positions

      const container = document.createElement('div');
      container.className = 'ghost-lens-help-card';
      container.style.cssText = `
        position: fixed;
        max-width: 280px;
        padding: 12px 16px;
        background: rgba(0, 18, 30, 0.95);
        border: 1px solid rgba(0, 200, 255, 0.4);
        border-radius: 8px;
        color: ${this.options.textColor};
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 12px;
        line-height: 1.6;
        letter-spacing: 0.02em;
        box-shadow: 0 0 20px rgba(0,200,255,0.1), 0 4px 20px rgba(0,0,0,0.5);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        z-index: ${this.options.textZIndex};
        opacity: 0;
        pointer-events: none;
      `;

      const title = document.createElement('div');
      title.style.cssText = `
        font-weight: 700;
        color: #00c8ff;
        margin-bottom: 6px;
        font-size: 13px;
        text-shadow: 0 0 10px rgba(0,200,255,0.4);
      `;
      title.textContent = item.label || `Step ${idx + 1}`;

      const desc = document.createElement('div');
      desc.style.cssText = `
        font-size: 11px;
        color: rgba(168, 240, 255, 0.8);
        line-height: 1.5;
      `;
      desc.textContent = item.help || '';

      container.appendChild(title);
      container.appendChild(desc);
      document.body.appendChild(container);

      this.textElements.push({
        container,
        item,
        index: idx,
      });
    });
  }

  /**
   * Start sequential animation (top to bottom)
   */
  _startSequentialAnimation() {
    // Sort by Y position (top to bottom)
    const sortedByY = this.textElements.sort((a, b) => {
      return (a.item.position?.y || 0) - (b.item.position?.y || 0);
    });

    sortedByY.forEach((textEl, seqIdx) => {
      const delay =
        seqIdx * (this.options.animationDuration + this.options.delayBetweenItems);

      setTimeout(() => {
        this._animateItem(textEl);
      }, delay);
    });
  }

  /**
   * Animate a single help item
   */
  _animateItem(textEl) {
    const { container, item } = textEl;
    const pos = item.position;

    // Position the help card
    let cardX = pos.centerX - 140; // Center horizontally
    let cardY = pos.centerY - 100; // Above element

    // Keep in viewport
    cardX = Math.max(8, Math.min(cardX, window.innerWidth - 288));
    cardY = Math.max(8, Math.min(cardY, window.innerHeight - 150));

    container.style.left = `${cardX}px`;
    container.style.top = `${cardY}px`;

    // Draw arrow from card to element
    this._drawArrow(
      cardX + 140, // Card center
      cardY + 60,
      pos.centerX,
      pos.centerY
    );

    // Fade in with animation
    container.style.animation = `ghost-help-fade-in ${this.options.animationDuration}ms ease-out forwards`;
    container.style.transform = 'translateY(8px)';

    // Inject animation keyframes if not exists
    this._ensureAnimationKeyframes();
  }

  /**
   * Draw SVG arrow from card to element
   */
  _drawArrow(fromX, fromY, toX, toY) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', fromX);
    line.setAttribute('y1', fromY);
    line.setAttribute('x2', toX);
    line.setAttribute('y2', toY);
    line.setAttribute('stroke', this.options.arrowColor);
    line.setAttribute('stroke-width', '2');
    line.setAttribute('marker-end', 'url(#arrowhead)');
    line.style.opacity = '0';
    line.style.animation = `ghost-arrow-draw 600ms ease-out forwards`;

    this.svgLayer.appendChild(line);
  }

  /**
   * Inject CSS keyframes for animations
   */
  _ensureAnimationKeyframes() {
    if (document.getElementById('ghost-lens-help-keyframes')) return;

    const style = document.createElement('style');
    style.id = 'ghost-lens-help-keyframes';
    style.textContent = `
      @keyframes ghost-help-fade-in {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @keyframes ghost-arrow-draw {
        from {
          opacity: 0;
          stroke-dasharray: 1000;
          stroke-dashoffset: 1000;
        }
        to {
          opacity: 1;
          stroke-dasharray: 1000;
          stroke-dashoffset: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Clean up overlay
   */
  destroy() {
    this.svgLayer?.remove();
    this.textElements.forEach(({ container }) => container?.remove());
    this.textElements = [];
  }
}
