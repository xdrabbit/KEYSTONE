/**
 * Ghost Lens Core Engine
 * Behavioral idle-detection contextual help overlay
 * Zero dependencies - works with React or vanilla JS
 * 
 * NEW: AI-powered help generation with Ollama/Claude
 */

import { generateHelp, enrichHelpWithPositions } from './ai-help.js';
import { AnimatedHelpOverlay } from './animated-overlay.js';

const GHOST_ATTR = 'data-ghost';
const GHOST_ID_ATTR = 'data-ghost-id';

const defaultOptions = {
  idleDelay: 6000,        // ms before lens activates (6 seconds)
  resetDelay: 300,        // ms after activity before resetting timer
  curtainDuration: 600,   // ms for curtain sweep animation
  curtainColor: 'rgba(0, 200, 255, 0.06)',
  tooltipBg: 'rgba(0, 18, 30, 0.92)',
  tooltipBorder: 'rgba(0, 200, 255, 0.4)',
  tooltipColor: '#a8f0ff',
  accentColor: '#00c8ff',
  zIndex: 9999,
  badgeText: 'GHOST LENS',
  badgeSubtext: 'Augmentation Active',
  heartbeatInterval: 5000,   // heartbeat pulse every 5 seconds
  maxActiveDuration: 60000,  // max 60 seconds before fade
  // AI Help options
  useAIHelp: true,           // Enable AI-powered help generation
  claudeApiKey: null,        // Optional Claude API key for fallback
  useHardcodedFirst: false,  // Try data-ghost attributes first before AI
  onActivate: null,
  onDeactivate: null,
};

export class GhostLensEngine {
  constructor(container, options = {}) {
    this.container = container || document.body;
    this.options = { ...defaultOptions, ...options };
    this.idleTimer = null;
    this.isActive = false;
    this.overlayEl = null;
    this.tooltips = [];
    this.curtainEl = null;
    this.badgeEl = null;
    this.heartbeatTimer = null;
    this.maxDurationTimer = null;
    this.activationTime = null;
    this.animatedOverlay = null;
    this._boundOnActivity = this._onActivity.bind(this);
    this._boundOnDisable = this._onDisable.bind(this);
    this._injectStyles();
    this._startListening();
  }

  _injectStyles() {
    if (document.getElementById('ghost-lens-styles')) return;
    const style = document.createElement('style');
    style.id = 'ghost-lens-styles';
    style.textContent = `
      .ghost-lens-overlay {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: ${this.options.zIndex};
        overflow: hidden;
      }
      .ghost-lens-curtain {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          ${this.options.curtainColor} 40%,
          rgba(0,200,255,0.15) 50%,
          ${this.options.curtainColor} 60%,
          transparent 100%
        );
        transform: translateX(-100%);
        animation: ghost-curtain-sweep ${this.options.curtainDuration}ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }
      @keyframes ghost-curtain-sweep {
        0%   { transform: translateX(-100%); opacity: 1; }
        100% { transform: translateX(100%);  opacity: 0.3; }
      }
      .ghost-lens-tooltip {
        position: fixed;
        max-width: 220px;
        padding: 8px 12px;
        background: ${this.options.tooltipBg};
        border: 1px solid ${this.options.tooltipBorder};
        border-radius: 6px;
        color: ${this.options.tooltipColor};
        font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
        font-size: 11px;
        line-height: 1.5;
        letter-spacing: 0.03em;
        box-shadow: 0 0 20px rgba(0,200,255,0.15), 0 4px 16px rgba(0,0,0,0.6);
        opacity: 0;
        transform: translateY(4px);
        animation: ghost-tooltip-in 250ms ease forwards;
        pointer-events: none;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }
      .ghost-lens-tooltip::before {
        content: '';
        position: absolute;
        top: -1px; left: -1px; right: -1px; bottom: -1px;
        border-radius: 6px;
        background: linear-gradient(135deg, rgba(0,200,255,0.1), transparent);
        pointer-events: none;
      }
      @keyframes ghost-tooltip-in {
        to { opacity: 1; transform: translateY(0); }
      }
      .ghost-lens-badge {
        position: fixed;
        bottom: 20px;
        right: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 14px;
        background: rgba(0, 10, 20, 0.85);
        border: 1px solid rgba(0,200,255,0.3);
        border-radius: 8px;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        box-shadow: 0 0 30px rgba(0,200,255,0.1);
        opacity: 0;
        animation: ghost-badge-in 400ms 200ms ease forwards;
        pointer-events: none;
        z-index: ${this.options.zIndex + 1};
      }
      .ghost-lens-badge-icon {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 1px solid rgba(0,200,255,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }
      .ghost-lens-badge-icon::after {
        content: '';
        position: absolute;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${this.options.accentColor};
        box-shadow: 0 0 8px ${this.options.accentColor};
        animation: ghost-pulse 2s infinite;
      }
      @keyframes ghost-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.6; transform: scale(0.85); }
      }
      @keyframes ghost-heartbeat-pulse {
        0% { 
          box-shadow: 0 0 30px rgba(0,200,255,0.1), 
                      0 0 0 0 rgba(0,200,255,0.4);
        }
        50% { 
          box-shadow: 0 0 30px rgba(0,200,255,0.2), 
                      0 0 0 12px rgba(0,200,255,0);
        }
        100% { 
          box-shadow: 0 0 30px rgba(0,200,255,0.1), 
                      0 0 0 0 rgba(0,200,255,0);
        }
      }
      .ghost-lens-badge.heartbeat {
        animation: ghost-heartbeat-pulse 0.8s ease-out;
      }
      @keyframes ghost-fade-out {
        to { opacity: 0; }
      }
      .ghost-lens-overlay.fade-out {
        animation: ghost-fade-out 500ms ease-out forwards;
      }
      .ghost-lens-badge.fade-out {
        animation: ghost-fade-out 500ms ease-out forwards;
      }
      .ghost-lens-disable.fade-out {
        animation: ghost-fade-out 500ms ease-out forwards;
      }
      .ghost-lens-badge-text {
        display: flex;
        flex-direction: column;
      }
      .ghost-lens-badge-title {
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.15em;
        color: ${this.options.accentColor};
        text-shadow: 0 0 10px rgba(0,200,255,0.5);
      }
      .ghost-lens-badge-sub {
        font-family: 'JetBrains Mono', monospace;
        font-size: 9px;
        letter-spacing: 0.08em;
        color: rgba(168,240,255,0.5);
      }
      @keyframes ghost-badge-in {
        to { opacity: 1; }
      }
      .ghost-lens-disable {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        letter-spacing: 0.1em;
        color: rgba(168,240,255,0.3);
        cursor: pointer;
        pointer-events: all;
        z-index: ${this.options.zIndex + 2};
        transition: color 0.2s;
        text-transform: uppercase;
        opacity: 0;
        animation: ghost-badge-in 400ms 400ms ease forwards;
      }
      .ghost-lens-disable:hover {
        color: rgba(168,240,255,0.7);
      }
      [data-ghost] {
        outline: 1px solid transparent;
        transition: outline-color 0.3s;
      }
      [data-ghost].ghost-lens-highlighted {
        outline: 1px solid rgba(0,200,255,0.25);
        border-radius: 3px;
      }
    `;
    document.head.appendChild(style);
  }

  _startListening() {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => document.addEventListener(e, this._boundOnActivity, { passive: true }));
    this._resetIdleTimer();
  }

  _onActivity() {
    if (this.isActive) {
      this._deactivate();
    }
    this._resetIdleTimer();
  }

  _resetIdleTimer() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this._activate(), this.options.idleDelay);
  }

  _activate() {
    if (this.isActive) return;
    this.isActive = true;
    this.activationTime = Date.now();
    this._renderOverlay();
    this._startHeartbeat();
    this._startMaxDurationTimer();
    this.options.onActivate?.();
  }

  _deactivate() {
    if (!this.isActive) return;
    this.isActive = false;
    clearTimeout(this.heartbeatTimer);
    clearTimeout(this.maxDurationTimer);
    this._clearOverlay();
    this.options.onDeactivate?.();
  }

  _onDisable() {
    this._deactivate();
    this.destroy();
    localStorage.setItem('ghost-lens-disabled', 'true');
  }

  _startHeartbeat() {
    const pulse = () => {
      if (!this.isActive || !this.badgeEl) return;
      // Add heartbeat animation class
      this.badgeEl.classList.remove('heartbeat');
      // Trigger reflow to restart animation
      void this.badgeEl.offsetWidth;
      this.badgeEl.classList.add('heartbeat');
      // Schedule next pulse
      this.heartbeatTimer = setTimeout(pulse, this.options.heartbeatInterval);
    };
    // Start first pulse after a moment
    this.heartbeatTimer = setTimeout(pulse, this.options.heartbeatInterval);
  }

  _startMaxDurationTimer() {
    this.maxDurationTimer = setTimeout(() => {
      if (!this.isActive) return;
      // Fade out and deactivate
      this._fadeOutAndDeactivate();
    }, this.options.maxActiveDuration);
  }

  _fadeOutAndDeactivate() {
    if (!this.isActive) return;
    
    // Add fade-out class to all elements
    if (this.overlayEl) this.overlayEl.classList.add('fade-out');
    if (this.badgeEl) this.badgeEl.classList.add('fade-out');
    if (this.disableBtn) this.disableBtn.classList.add('fade-out');
    this.tooltips.forEach(t => t.classList.add('fade-out'));
    
    // After fade completes, deactivate
    setTimeout(() => {
      this._deactivate();
    }, 500);
  }

  _getGhostElements() {
    return Array.from(document.querySelectorAll(`[${GHOST_ATTR}]`));
  }

  _renderOverlay() {
    this._clearOverlay();

    // Main overlay container
    const overlay = document.createElement('div');
    overlay.className = 'ghost-lens-overlay';
    overlay.id = 'ghost-lens-overlay';

    // Curtain sweep
    const curtain = document.createElement('div');
    curtain.className = 'ghost-lens-curtain';
    overlay.appendChild(curtain);
    this.curtainEl = curtain;

    document.body.appendChild(overlay);
    this.overlayEl = overlay;

    // Badge
    const badge = document.createElement('div');
    badge.className = 'ghost-lens-badge';
    badge.innerHTML = `
      <div class="ghost-lens-badge-icon"></div>
      <div class="ghost-lens-badge-text">
        <span class="ghost-lens-badge-title">${this.options.badgeText}</span>
        <span class="ghost-lens-badge-sub">${this.options.badgeSubtext}</span>
      </div>
    `;
    document.body.appendChild(badge);
    this.badgeEl = badge;

    // Disable button
    const disableBtn = document.createElement('span');
    disableBtn.className = 'ghost-lens-disable';
    disableBtn.textContent = 'Disable Ghost Lens Forever';
    disableBtn.addEventListener('click', this._boundOnDisable);
    document.body.appendChild(disableBtn);
    this.disableBtn = disableBtn;

    // Render tooltips after curtain animation
    setTimeout(() => {
      this._renderTooltips();
    }, this.options.curtainDuration * 0.5);
  }

  _renderTooltips() {
    // Check if we should use AI help first
    if (this.options.useAIHelp) {
      this._renderAIHelp();
      return;
    }

    // Fall back to hardcoded data-ghost attributes
    const elements = this._getGhostElements();
    elements.forEach((el, i) => {
      const text = el.getAttribute(GHOST_ATTR);
      if (!text) return;

      el.classList.add('ghost-lens-highlighted');

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      const tip = document.createElement('div');
      tip.className = 'ghost-lens-tooltip';
      tip.textContent = text;
      tip.style.animationDelay = `${i * 40}ms`;

      // Smart positioning
      let top = rect.bottom + 8;
      let left = rect.left;

      // Flip up if near bottom
      if (top + 80 > window.innerHeight) {
        top = rect.top - 80;
      }
      // Clamp to viewport
      left = Math.max(8, Math.min(left, window.innerWidth - 240));
      top = Math.max(8, top);

      tip.style.top = `${top}px`;
      tip.style.left = `${left}px`;

      document.body.appendChild(tip);
      this.tooltips.push(tip);
    });
  }

  async _renderAIHelp() {
    try {
      console.log('[Ghost Lens] _renderAIHelp() called');
      const helpData = await generateHelp(this.options.claudeApiKey);
      
      if (!helpData) {
        console.warn('[Ghost Lens] AI help generation failed, falling back to hardcoded');
        this._renderTooltips(); // Fallback to hardcoded
        return;
      }

      console.log('[Ghost Lens] AI help generated, enriching...', helpData);
      
      // Enrich with positions
      const enrichedHelp = enrichHelpWithPositions(helpData);
      console.log('[Ghost Lens] Enriched help:', enrichedHelp);
      
      // Create and render animated overlay
      this.animatedOverlay = new AnimatedHelpOverlay(enrichedHelp, {
        svgZIndex: this.options.zIndex + 1,
        textZIndex: this.options.zIndex + 2,
      });
      
      console.log('[Ghost Lens] Rendering animated overlay...');
      this.animatedOverlay.render();
      console.log('[Ghost Lens] Overlay rendered!');
    } catch (err) {
      console.error('[Ghost Lens] AI help error:', err);
      this._renderTooltips(); // Fallback
    }
  }

  _clearOverlay() {
    this.overlayEl?.remove();
    this.badgeEl?.remove();
    this.disableBtn?.remove();
    this.tooltips.forEach(t => t.remove());
    this.animatedOverlay?.destroy();
    this.tooltips = [];
    this.overlayEl = null;
    this.badgeEl = null;
    this.disableBtn = null;
    this.animatedOverlay = null;
    document.querySelectorAll('.ghost-lens-highlighted').forEach(el => {
      el.classList.remove('ghost-lens-highlighted');
    });
  }

  destroy() {
    clearTimeout(this.idleTimer);
    clearTimeout(this.heartbeatTimer);
    clearTimeout(this.maxDurationTimer);
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => document.removeEventListener(e, this._boundOnActivity));
    this._clearOverlay();
  }

  // Public API
  activate() { this._activate(); }
  deactivate() { this._deactivate(); }
  setIdleDelay(ms) { this.options.idleDelay = ms; this._resetIdleTimer(); }
}

// Check if user has permanently disabled
export function isGhostLensDisabled() {
  return localStorage.getItem('ghost-lens-disabled') === 'true';
}
