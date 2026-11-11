import React, { useEffect, useState, useRef } from 'react';

interface AnimatedCounterProps {
  value: number | string;
  className?: string;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({ value, className = '' }) => {
  const [state, setState] = useState<{
    current: number | string;
    prev: number | string | null;
    direction: 'up' | 'down';
  }>({ current: value, prev: null, direction: 'up' });
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setState((prevState) => {
      if (value === prevState.current) return prevState;
      const numCurrent =
        typeof prevState.current === 'number'
          ? prevState.current
          : Number.parseInt(String(prevState.current), 10);
      const numNext =
        typeof value === 'number' ? value : Number.parseInt(String(value), 10);
      const direction: 'up' | 'down' =
        !Number.isNaN(numCurrent) && !Number.isNaN(numNext) && numNext < numCurrent
          ? 'down'
          : 'up';
      return { current: value, prev: prevState.current, direction };
    });
  }, [value]);

  useEffect(() => {
    if (state.prev === null) return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setState((s) => (s.prev === null ? s : { ...s, prev: null }));
      timerRef.current = null;
    }, 240);
  }, [state.prev]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const { current, prev, direction } = state;

  return (
    <span className={`inline-block relative overflow-hidden h-[1.3em] leading-[1.3em] align-middle font-mono ${className}`}>
      {prev !== null ? (
        <span
          key={`prev-${prev}`}
          aria-hidden="true"
          className={`block text-center ${direction === 'up' ? 'animate-counter-exit-up' : 'animate-counter-exit-down'}`}
        >
          {prev}
        </span>
      ) : null}
      <span
        key={`curr-${current}`}
        className={`block text-center ${prev !== null ? (direction === 'up' ? 'animate-counter-enter-up' : 'animate-counter-enter-down') : ''}`}
      >
        {current}
      </span>
    </span>
  );
};
