import { useCallback, useEffect, useRef, useState } from 'react';
import { HOLD_TO_STOP_MS } from './time';

/** Drives the timer button's press physics and its hold-to-stop gesture,
 * shared between the floating widget and the main Timesheet panel so both
 * surfaces behave identically. A short press (release before the hold
 * completes) calls `onShortPress` — its meaning (start/resume/pause) is
 * decided by the caller from the current phase, not by this hook. Releasing
 * or dragging off mid-hold cancels it silently; completing the full
 * `HOLD_TO_STOP_MS` calls `onHoldComplete` instead of `onShortPress`. */
export function useHoldToStop(onShortPress: () => void, onHoldComplete: () => void, holdEnabled: boolean) {
  const [isPressed, setIsPressed] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdingRef = useRef(false);
  const holdStartRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const resetTimeoutRef = useRef<number | null>(null);
  // True once onHoldComplete has fired for the press currently in progress.
  // The physical release (pointerup) that follows a completed hold usually
  // arrives after the caller has already reacted to the stop — e.g. the
  // broadcast round-trip that flips the floating widget's own `holdEnabled`
  // (derived from phase) to false can land before the user actually lifts
  // their finger. Without this guard, that stale-but-now-false holdEnabled
  // makes the trailing pointerup misread as "a plain click while idle" and
  // fire onShortPress — restarting the timer immediately after stopping it.
  const completedRef = useRef(false);

  const cancelHold = useCallback(() => {
    holdingRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    setHoldProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (!holdingRef.current) return;
    const elapsed = Date.now() - holdStartRef.current;
    const progress = Math.min(1, elapsed / HOLD_TO_STOP_MS);
    setHoldProgress(progress);
    if (progress >= 1) {
      holdingRef.current = false;
      completedRef.current = true;
      onHoldComplete();
      // Hold the full fill visible for a beat (the button reads as "stopped")
      // before resetting, instead of snapping straight back to idle — React
      // batches this call's state update together with onHoldComplete's own,
      // so an immediate reset here would never actually paint.
      resetTimeoutRef.current = window.setTimeout(() => setHoldProgress(0), 450);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onHoldComplete]);

  const onPointerDown = useCallback(() => {
    setIsPressed(true);
    completedRef.current = false;
    if (holdEnabled) {
      holdingRef.current = true;
      holdStartRef.current = Date.now();
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [holdEnabled, tick]);

  const onPointerUp = useCallback(() => {
    setIsPressed(false);
    if (completedRef.current) {
      // The hold already completed and fired onHoldComplete earlier in this
      // same press — this release is trailing cleanup, not a new gesture.
      completedRef.current = false;
      return;
    }
    if (holdingRef.current) {
      cancelHold();
      onShortPress();
    } else if (!holdEnabled) {
      onShortPress();
    }
  }, [cancelHold, holdEnabled, onShortPress]);

  const onPointerLeave = useCallback(() => {
    setIsPressed(false);
    if (holdingRef.current) cancelHold();
  }, [cancelHold]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (resetTimeoutRef.current !== null) window.clearTimeout(resetTimeoutRef.current);
    },
    []
  );

  return { isPressed, holdProgress, onPointerDown, onPointerUp, onPointerLeave };
}
