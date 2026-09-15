/**
 * Plays one human seat in the real UI, one action at a time.
 *
 * `drive.mjs` watches an all-bot table, which answers questions about timing
 * but never presses anything. Anything involving a *human* seat — hot-seat, and
 * every online question, where two browsers have to take turns — needs
 * something that can actually take a turn. This is that, kept here rather than
 * rewritten per script because every rewrite so far rediscovered the same three
 * traps:
 *
 * 1. **Answer a dialog before escaping it.** The buy prompt is a `role=dialog`
 *    like a beat is. A driver that escapes dialogs first and looks for buttons
 *    second dismisses the very thing it needed to click, and the game sits on
 *    turn one forever looking perfectly healthy.
 * 2. **Decision buttons are not named after the decision.** The founding
 *    prompt's options are corporation names — "Standard Oyl", not "Found
 *    Standard Oyl" — so no sensible regex finds them. Inside a dialog, click
 *    the first *real* action instead of guessing at its label.
 * 3. **Two buttons in a dialog are not decisions.** "Peek at the board" and
 *    "Resume …" navigate within the prompt, so clicking the literal first
 *    button toggles the peek forever. They are skipped by name.
 *
 * And one rule that is not about this app: every page call is raced against a
 * deadline. A driver that hangs inside Playwright looks exactly like a game
 * that stopped, and the two want very different fixes.
 */

/** Race a page call against a deadline; null means it did not answer in time. */
const guard = (promise, ms = 4000) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]).catch(
    () => null,
  );

/** Buttons inside a prompt that move around it rather than answering it. */
const NAVIGATION = /Peek|Resume|Leave|Back/i;

/**
 * Prompts worth answering a particular way rather than by taking the first
 * option — "buy nothing" keeps a scripted game moving without modelling prices,
 * and "hold all" resolves a disposal without modelling a portfolio.
 */
const PREFERRED = [/Buy nothing and end turn/, /^Buy \d+ for/, /Hold all/, /^Confirm/];

/**
 * Take at most one action for this seat.
 *
 * Returns a short description of what it did, or null when there was nothing to
 * do — which usually means this seat is not on the clock, not that anything is
 * wrong.
 */
export async function playSeat(page, { timeout = 4000 } = {}) {
  const dialog = page.getByRole('dialog').first();
  if (await guard(dialog.count(), timeout)) {
    for (const name of PREFERRED) {
      const button = dialog.getByRole('button', { name });
      if (await guard(button.count(), timeout)) {
        await guard(button.first().click({ timeout }), timeout);
        return `answered: ${name}`;
      }
    }
    const buttons = dialog.getByRole('button');
    const count = (await guard(buttons.count(), timeout)) ?? 0;
    for (let i = 0; i < count; i += 1) {
      const button = buttons.nth(i);
      const label = ((await guard(button.innerText(), timeout)) ?? '').trim();
      if (!label || NAVIGATION.test(label)) continue;
      if (!(await guard(button.isEnabled(), timeout))) continue;
      await guard(button.click({ timeout }), timeout);
      return `chose: ${label.split('\n')[0]}`;
    }
    // A dialog with nothing to answer is a beat. Escape skips the rest of it.
    await guard(page.keyboard.press('Escape'), timeout);
    return 'skipped a beat';
  }

  const playable = page.locator('[role=gridcell][aria-label^="Place at "]');
  if (await guard(playable.count(), timeout)) {
    await guard(playable.first().click({ timeout }), timeout);
    return 'placed a tile';
  }

  for (const name of [/End turn/, /Buy stock/]) {
    const button = page.getByRole('button', { name });
    if (await guard(button.count(), timeout)) {
      await guard(button.first().click({ timeout }), timeout);
      return `pressed: ${name}`;
    }
  }
  return null;
}

/** The turn number in the header, or null before a game is under way. */
export async function turnNumber(page, { timeout = 3000 } = {}) {
  const header = (await guard(page.locator('header').first().innerText(), timeout)) ?? '';
  const match = /TURN\s+(\d+)/i.exec(header);
  return match ? Number(match[1]) : null;
}

/** Whether this page is showing the end of the game. */
export async function isGameOver(page, { timeout = 3000 } = {}) {
  if (await guard(page.getByText('Final standings').count(), timeout)) return true;
  return Boolean(await guard(page.getByRole('dialog', { name: /Game over/i }).count(), timeout));
}

/**
 * Drive every seat until the game ends or the clock runs out.
 *
 * Takes all the pages at a table, because a human seat cannot be driven alone:
 * whoever is on the clock has the only actionable screen, and the others simply
 * return null until their turn comes round.
 */
export async function playToEnd(pages, { maxMs = 8 * 60 * 1000, onProgress } = {}) {
  const deadline = Date.now() + maxMs;
  const expired = () => Date.now() >= deadline;
  let actions = 0;
  let highestTurn = 0;
  while (!expired()) {
    for (const page of pages) {
      // Checked per page, not only per round: one seat's calls can take long
      // enough that a deadline tested only at the top of the round overruns it
      // badly -- which is how a "seven minute" run was still going at nineteen.
      if (expired()) break;
      if (await isGameOver(page)) {
        return { finished: true, actions, highestTurn };
      }
      if (await playSeat(page)) actions += 1;
    }
    const turn = (await turnNumber(pages[0])) ?? 0;
    if (turn > highestTurn) {
      highestTurn = turn;
      onProgress?.({ turn: highestTurn, actions });
    }
    await guard(pages[0].waitForTimeout(150), 1000);
  }
  return { finished: false, actions, highestTurn };
}

/**
 * Screenshot that cannot hang the caller. A page mid-animation can leave
 * `screenshot()` waiting indefinitely, and a driver that dies at the moment it
 * records its evidence is worse than one that records a blurry frame.
 */
export async function snapshot(page, path, { timeout = 10000 } = {}) {
  return (await guard(page.screenshot({ path }), timeout)) !== null;
}
