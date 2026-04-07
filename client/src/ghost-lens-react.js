/**
 * Ghost Lens - React Integration
 * useGhostLens hook + <GhostLens> provider component
 * Now with AI-powered help generation!
 */

import { useEffect, useRef, useCallback } from 'react';
import { GhostLensEngine, isGhostLensDisabled } from './ghost-lens-core.js';

/**
 * useGhostLens - React hook
 * 
 * @param {Object} options - GhostLens configuration
 * @param {number} options.idleDelay - ms before lens activates (default 3000)
 * @param {boolean} options.disabled - manually disable the lens
 * @returns {{ activate, deactivate, setIdleDelay }}
 * 
 * @example
 * const { activate } = useGhostLens({ idleDelay: 4000 });
 */
export function useGhostLens(options = {}) {
  const engineRef = useRef(null);

  useEffect(() => {
    if (options.disabled || isGhostLensDisabled()) return;

    engineRef.current = new GhostLensEngine(null, options);

    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activate = useCallback(() => engineRef.current?.activate(), []);
  const deactivate = useCallback(() => engineRef.current?.deactivate(), []);
  const setIdleDelay = useCallback((ms) => engineRef.current?.setIdleDelay(ms), []);

  return { activate, deactivate, setIdleDelay };
}

/**
 * GhostLens - React Provider Component
 * Drop this anywhere in your app (typically near the root)
 * 
 * @example
 * <GhostLens idleDelay={3000}>
 *   <App />
 * </GhostLens>
 */
export function GhostLens({ children, ...options }) {
  useGhostLens(options);
  return children;
}

/**
 * ghost() - utility to add data-ghost attribute cleanly
 * 
 * @example
 * <button {...ghost('Click to save your changes')}>Save</button>
 */
export function ghost(text) {
  return { 'data-ghost': text };
}

/**
 * useGhostLensAI - React hook with AI help generation
 * 
 * @param {Object} options - Configuration
 * @param {boolean} options.useAIHelp - Enable AI help (default true)
 * @param {string} options.claudeApiKey - Claude API key for fallback
 * @param {number} options.idleDelay - ms before activation (default 6000)
 * @param {number} options.heartbeatInterval - Pulse every N ms (default 5000)
 * @param {number} options.maxActiveDuration - Auto-fade after N ms (default 60000)
 * @param {Function} options.onActivate - Callback when active
 * @param {Function} options.onDeactivate - Callback when inactive
 * @returns {{ activate, deactivate }}
 * 
 * @example
 * const { activate } = useGhostLensAI({ useAIHelp: true });
 */
export function useGhostLensAI(options = {}) {
  const engineRef = useRef(null);

  useEffect(() => {
    if (options.disabled || isGhostLensDisabled()) return;

    // AI defaults
    const aiOptions = {
      idleDelay: 6000,
      useAIHelp: true,
      heartbeatInterval: 5000,
      maxActiveDuration: 60000,
      ...options,
    };

    engineRef.current = new GhostLensEngine(null, aiOptions);

    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activate = useCallback(() => engineRef.current?.activate(), []);
  const deactivate = useCallback(() => engineRef.current?.deactivate(), []);

  return { activate, deactivate };
}
