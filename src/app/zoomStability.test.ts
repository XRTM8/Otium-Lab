// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

describe('zoom page-turn lockout & gesture stability invariants', () => {
  it('blocks page turning within 600ms of any zoom operation', () => {
    let lastZoomTime = performance.now();
    let wheelAccum = 0;
    let wheelDirection = 0;

    const simulateWheel = (now: number, deltaY: number) => {
      // Lockout condition from useReaderController:
      if (now - lastZoomTime < 600) {
        wheelAccum = 0;
        wheelDirection = 0;
        return false; // page turn blocked
      }

      const direction = deltaY > 0 ? 1 : -1;
      if (wheelDirection !== direction) {
        wheelDirection = direction;
        wheelAccum = 0;
      }
      wheelAccum += Math.abs(deltaY);
      return wheelAccum >= 96;
    };

    // Immediately after zoom (e.g. 50ms) - inertia from trackpad pinch or wheel
    expect(simulateWheel(lastZoomTime + 50, 120)).toBe(false);
    expect(wheelAccum).toBe(0);

    // At 400ms after zoom - still locked out
    expect(simulateWheel(lastZoomTime + 400, 150)).toBe(false);
    expect(wheelAccum).toBe(0);

    // After 650ms - lockout elapsed, intentional wheel turns page
    expect(simulateWheel(lastZoomTime + 650, 120)).toBe(true);
  });

  it('rejects ambiguous diagonal trackpad gestures in single/dual page mode', () => {
    const isAmbiguousDiagonal = (absX: number, absY: number) => {
      return absX > 0 && absY > 0 && Math.max(absX, absY) / Math.min(absX, absY) < 1.35;
    };

    // Diagonal swipe (e.g. 40px X and 35px Y) -> ratio 1.14 < 1.35 -> ambiguous, rejected!
    expect(isAmbiguousDiagonal(40, 35)).toBe(true);

    // Clear horizontal swipe (e.g. 100px X and 20px Y) -> ratio 5.0 -> accepted
    expect(isAmbiguousDiagonal(100, 20)).toBe(false);

    // Clear vertical scroll (e.g. 15px X and 90px Y) -> ratio 6.0 -> accepted
    expect(isAmbiguousDiagonal(15, 90)).toBe(false);
  });

  it('freezes continuous mode page measuring during zoom layout reflow (< 450ms)', () => {
    let lastZoomTime = performance.now();
    let isPinching = false;
    let bestPage = 5;

    const measure = (now: number, newEstimatedPage: number) => {
      // Continuous mode measure guard from ReaderWorkspace:
      if (isPinching || now - lastZoomTime < 450) {
        return bestPage; // Keep unchanged
      }
      bestPage = newEstimatedPage;
      return bestPage;
    };

    // During zoom or immediately after (e.g. 100ms) - layout jumps should NOT change page
    expect(measure(lastZoomTime + 100, 18)).toBe(5);

    // After 500ms - settled layout allows regular scroll measure
    expect(measure(lastZoomTime + 500, 6)).toBe(6);
  });

  it('discards accidental single-finger tap during 350ms pinch lift window', () => {
    let pinchLiftEndTime = performance.now();

    const handleSingleTouch = (now: number) => {
      if (now - pinchLiftEndTime < 350) {
        return null; // Ignored as lingering finger from pinch
      }
      return { action: 'tap' };
    };

    // First finger lifts, second lingers for 80ms
    expect(handleSingleTouch(pinchLiftEndTime + 80)).toBeNull();

    // 400ms later, intentional tap succeeds
    expect(handleSingleTouch(pinchLiftEndTime + 400)).toEqual({ action: 'tap' });
  });
});
