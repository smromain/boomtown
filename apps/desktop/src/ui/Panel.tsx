import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import styles from './Panel.module.css';

type Elevation = 1 | 2 | 3;
type Frame = 'top-rule' | 'rule' | 'none';

/**
 * The crafted-surface primitive (U6): elevation shadow + framing from the
 * visual-language tokens in `global.css`, so every panel-like surface reads
 * from the same system instead of restyling `background`/`border` ad hoc.
 * Corp cards keep their own bespoke cap-band markup (the cap colour is
 * per-industry and dynamic) — this is for the generic surfaces: Shareholders,
 * Story, dialogs, Reference panels, action cards.
 */
export function Panel({
  as,
  elevation = 1,
  frame = 'rule',
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  elevation?: Elevation;
  frame?: Frame;
  className?: string | undefined;
  children?: ReactNode;
} & ComponentPropsWithoutRef<'div'>) {
  const Tag = as ?? 'div';
  const cls = className ? `${styles.panel} ${className}` : styles.panel;
  return (
    <Tag className={cls} data-elevation={elevation} data-frame={frame === 'none' ? undefined : frame} {...rest}>
      {children}
    </Tag>
  );
}
