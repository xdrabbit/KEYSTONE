/**
 * Ghost Lens - React Integration
 * useGhostLens hook + <GhostLens> provider component
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
