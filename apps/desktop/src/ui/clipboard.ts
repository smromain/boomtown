/**
 * Put text on the clipboard, by whichever route this shell allows.
 *
 * `navigator.clipboard` is the right API and the one that works in the browser
 * build, but it is not guaranteed: it is missing outside a secure context, and
 * it rejects when the document is not focused or the shell declines the
 * permission. The packaged app loads the renderer from `file://`, which is the
 * kind of origin those rules are written about, so the modern call cannot be
 * the only route to the one thing in this app a player has to be able to copy.
 *
 * The fallback is the old selection trick — a textarea, selected, and
 * `execCommand('copy')` — which is deprecated and still works everywhere. It
 * needs a real element, so it is skipped when there is no document at all.
 *
 * Returns whether the text actually went anywhere: a copy button that says
 * "Copied" when nothing was copied is worse than one that says nothing.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied, or no secure context. Try the old way before giving up.
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const field = document.createElement('textarea');
  field.value = text;
  // Off-screen rather than hidden: `display: none` cannot be selected, and an
  // unselectable textarea copies nothing.
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.top = '-1000px';
  field.style.opacity = '0';
  document.body.appendChild(field);
  try {
    field.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
