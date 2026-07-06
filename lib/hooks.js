"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a numeric value from its previous value to `value` whenever it
 * changes, using a simple eased requestAnimationFrame loop. Returns the
 * current eased numeric value (rounded to `decimals`) — callers format it
 * however they like (toLocaleString, mm:ss, %, etc). Pure client-side hook,
 * no extra dependencies.
 */
export function useCountUp(value, { duration = 700, decimals = 0 } = {}) {
  const target = typeof value === "number" && !Number.isNaN(value) ? value : 0;
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);

    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = ease(p);
      setDisplay(from + (to - from) * eased);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
        setDisplay(to);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  const factor = Math.pow(10, decimals);
  return Math.round(display * factor) / factor;
}
