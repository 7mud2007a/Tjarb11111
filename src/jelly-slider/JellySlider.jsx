'use client';

import { useEffect, useRef, useState } from 'react';
import { createJellySlider } from './createJellySlider.js';

/**
 * Jelly slider: a squishy, translucent 3D slider (three.js).
 *
 * Props
 *  value / defaultValue  0-100. Pass `value` to control it, or `defaultValue` to let it manage itself.
 *  onChange(value)       fires while dragging (integers).
 *  onChangeEnd(value)    fires on release.
 *  snapBackTo            number | null. If set, the handle springs back to this value on release.
 *  theme                 optional colours, see DEFAULT_THEME in createJellySlider.js
 *  fontFamily            CSS font stack for the % readout (load the font yourself)
 *  label                 accessible name
 *  className / style     applied to the outer box; it needs a width, height follows 1:1 unless you set one
 */
export default function JellySlider({
  value,
  defaultValue = 48,
  onChange,
  onChangeEnd,
  snapBackTo = null,
  theme,
  fontFamily,
  label = 'Value',
  className,
  style,
}) {
  const hostRef = useRef(null);
  const apiRef = useRef(null);
  const callbacks = useRef({});
  callbacks.current = { onChange, onChangeEnd };

  const initial = useRef(value ?? defaultValue);
  const [shown, setShown] = useState(initial.current);
  const [unsupported, setUnsupported] = useState(false);

  // Create the scene once.
  useEffect(() => {
    let api;
    try {
      api = createJellySlider(hostRef.current, {
        value: initial.current,
        theme,
        fontFamily,
        snapBackTo,
        onChange: (v) => {
          setShown(v);
          callbacks.current.onChange?.(v);
        },
        onChangeEnd: (v) => callbacks.current.onChangeEnd?.(v),
      });
    } catch (err) {
      console.warn('JellySlider: WebGL unavailable, using a plain slider.', err);
      setUnsupported(true);
      return undefined;
    }
    apiRef.current = api;
    return () => {
      api.dispose();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow controlled value changes.
  useEffect(() => {
    if (value === undefined) return;
    setShown(value);
    apiRef.current?.setValue(value);
  }, [value]);

  const themeKey = JSON.stringify(theme ?? null);
  useEffect(() => {
    apiRef.current?.setTheme(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey]);

  useEffect(() => {
    apiRef.current?.setOptions({ snapBackTo, fontFamily });
  }, [snapBackTo, fontFamily]);

  const onKeyDown = (e) => {
    const api = apiRef.current;
    if (!api) return;
    const big = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        api.nudge(big);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        api.nudge(-big);
        break;
      case 'PageUp':
        api.nudge(10);
        break;
      case 'PageDown':
        api.nudge(-10);
        break;
      case 'Home':
        api.setValue(0, { notify: true });
        break;
      case 'End':
        api.setValue(100, { notify: true });
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  if (unsupported) {
    return (
      <input
        type="range"
        min={0}
        max={100}
        value={value ?? shown}
        aria-label={label}
        className={className}
        style={{ width: '100%', ...style }}
        onChange={(e) => {
          const v = Number(e.target.value);
          setShown(v);
          onChange?.(v);
        }}
        onPointerUp={() => onChangeEnd?.(value ?? shown)}
      />
    );
  }

  return (
    <div
      ref={hostRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      onKeyDown={onKeyDown}
      className={className}
      style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', outlineOffset: 4, ...style }}
    />
  );
}
