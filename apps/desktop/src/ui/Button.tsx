import type { ComponentPropsWithoutRef } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'onChrome';

/**
 * The crafted button primitive (U6/KTD2): one place for the button treatment
 * so dialogs, the header and the action bar stop restyling a bare `<button>`
 * each time (R5 — no default web-app chrome).
 */
export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...rest
}: {
  variant?: Variant;
} & ComponentPropsWithoutRef<'button'>) {
  const cls = [styles.button, styles[variant], className].filter(Boolean).join(' ');
  return <button type={type} className={cls} {...rest} />;
}
