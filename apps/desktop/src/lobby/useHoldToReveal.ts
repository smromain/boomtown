import { useCallback, useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * A control that reveals something only while it is held (#62).
 *
 * Hold-to-show is the one reveal that cannot be left on by accident, and on a
 * stream that is the failure that matters: a toggle forgotten in the "shown"
 * position leaks the room code for as long as nobody notices. So every way a
 * hold can end ends it — the pointer lifting or leaving, the key coming up,
 * focus moving, and the window losing focus (alt-tab mid-hold would otherwise
 * strand it shown, because the matching pointerup lands in another app).
 *
 * The returned props go on a `<button>`: pointer and keyboard both work, and
 * `aria-pressed` tells assistive tech which state it is in.
 */
export function useHoldToReveal(): {
  readonly held: boolean;
  readonly props: {
    readonly 'aria-pressed': boolean;
    readonly onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
    readonly onPointerUp: () => void;
    readonly onPointerLeave: () => void;
    readonly onPointerCancel: () => void;
    readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
    readonly onKeyUp: () => void;
    readonly onBlur: () => void;
    readonly onContextMenu: (event: { preventDefault: () => void }) => void;
  };
} {
  const [held, setHeld] = useState(false);
  const release = useCallback(() => setHeld(false), []);

  useEffect(() => {
    if (!held) return;
    window.addEventListener('blur', release);
    window.addEventListener('pointerup', release);
    return () => {
      window.removeEventListener('blur', release);
      window.removeEventListener('pointerup', release);
    };
  }, [held, release]);

  return {
    held,
    props: {
      'aria-pressed': held,
      onPointerDown: (event) => {
        if (event.button === 0) setHeld(true);
      },
      onPointerUp: release,
      onPointerLeave: release,
      onPointerCancel: release,
      onKeyDown: (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          // Space would otherwise "click" on key-up, and Enter repeats.
          event.preventDefault();
          setHeld(true);
        }
      },
      onKeyUp: release,
      onBlur: release,
      // A long press on a touch screen opens the context menu, which steals
      // the pointer without a pointerup.
      onContextMenu: (event) => event.preventDefault(),
    },
  };
}
