import { useState, useEffect, useRef } from "react";

/**
 * Custom hook to limit update frequency
 * @param value Value to throttle
 * @param limit Time in ms between updates
 * @returns Throttled value
 */
export const useThrottle = <T>(value: T, limit: number) => {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastRan = useRef<number>(Date.now());

  useEffect(() => {
    const now = Date.now();
    if (now >= lastRan.current + limit) {
      lastRan.current = now;
      setThrottledValue(value);
    } else {
      const timerId = setTimeout(
        () => {
          lastRan.current = now;
          setThrottledValue(value);
        },
        limit - (now - lastRan.current),
      );

      return () => clearTimeout(timerId);
    }
  }, [value, limit]);

  return throttledValue;
};
