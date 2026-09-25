import { useEffect, useState } from 'react';
import { RULES, type Command, type Industry, type PendingDecision } from '@boomtown/engine';
import type { ClientView } from '@boomtown/client-core';
import { copy, fill } from '@desktop/copy/copy.js';
import { buyCost, buyTotal, buyableCorporations, canIncrement, type BuyPicks } from '@desktop/panels/buying.js';
import { checkDisposal, maxTrade } from '@desktop/decisions/disposal.js';
import { tallyOf } from '@desktop/game/motion.js';
import { foundingOptions } from '@desktop/reference/priceReference.js';
import { Swatch } from './Swatch.js';

const p = copy.phone;
type Send = (command: Command) => void;

/**
 * The decision screens, one per thing the game can wait on a seat for. Each
 * says what the table's own prompt says — the words come from the same copy
 * file — and adds up with the same arithmetic the desktop uses, so the two
 * cannot tell a player different things.
 */

function Stepper({
  value,
  onLess,
  onMore,
  canLess,
  canMore,
  label,
}: {
  value: number;
  onLess: () => void;
  onMore: () => void;
  canLess: boolean;
  canMore: boolean;
  label: string;
}) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`${label} −`} disabled={!canLess} onClick={onLess}>
        −
      </button>
      <output className="tabnum">{value}</output>
      <button type="button" aria-label={`${label} +`} disabled={!canMore} onClick={onMore}>
        +
      </button>
    </span>
  );
}

// --- 6 · Buy stock ----------------------------------------------------------

export function BuySheet({ view, busy, send }: { view: ClientView; busy: boolean; send: Send }) {
  const b = copy.buy;
  const [picks, setPicks] = useState<BuyPicks>({});
  const turn = `${view.you}:${view.step}:${view.activeSeat}`;
  useEffect(() => setPicks({}), [turn]);

  const corps = buyableCorporations(view);
  const total = buyTotal(picks);
  const cost = buyCost(view, picks);
  const bump = (industry: Industry, delta: number) =>
    setPicks((current) => ({ ...current, [industry]: Math.max(0, (current[industry] ?? 0) + delta) }));

  return (
    <section className="card turn" aria-label={b.label}>
      <h2 className="serif">{b.title}</h2>
      <p className="note tabnum">{fill(b.pickedOf, { n: total, max: RULES.maxStockPurchasesPerTurn })}</p>
      {corps.length === 0 ? (
        <p className="note">{b.nothingFounded}</p>
      ) : (
        <ul className="rows">
          {corps.map((industry) => {
            const corp = view.corporations[industry];
            const qty = picks[industry] ?? 0;
            return (
              <li key={industry} data-picked={qty > 0 || undefined}>
                <Swatch industry={industry} />
                <span className="corp">
                  <span>{corp.displayName}</span>
                  <span className="note tabnum">
                    ${(corp.sharePrice ?? 0).toLocaleString()} · {fill(b.inBankHeld, { inBank: corp.bankShares, held: view.yourHoldings[industry] })}
                  </span>
                </span>
                <Stepper
                  label={fill(b.sharesToBuy, { name: corp.displayName })}
                  value={qty}
                  canLess={qty > 0}
                  canMore={canIncrement(view, picks, industry)}
                  onLess={() => bump(industry, -1)}
                  onMore={() => bump(industry, 1)}
                />
              </li>
            );
          })}
        </ul>
      )}
      <p className="purse tabnum">
        <span>{fill(b.cashInHand, { cash: view.yourCash.toLocaleString() })}</span>
        {cost > 0 && <span>{fill(b.cashLeft, { cash: (view.yourCash - cost).toLocaleString() })}</span>}
      </p>
      {total > 0 && (
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => send({ type: 'buy-shares', seat: view.you, picks })}
        >
          {fill(b.buyTotal, { n: total, cost: cost.toLocaleString() })}
        </button>
      )}
      <button
        type="button"
        className={total > 0 ? 'ghost' : 'primary'}
        disabled={busy}
        onClick={() => send({ type: 'buy-shares', seat: view.you, picks: {} })}
      >
        {b.buyNothing}
      </button>
    </section>
  );
}

// --- 8 · Dispose of defunct stock ---------------------------------------------

type Dispose = Extract<PendingDecision, { type: 'dispose-shares' }>;

export function DisposeSheet({
  view,
  decision,
  busy,
  send,
}: {
  view: ClientView;
  decision: Dispose;
  busy: boolean;
  send: Send;
}) {
  const t = copy.decisions.disposal;
  const shares = decision.shares;
  const survivorBank = view.corporations[decision.survivor].bankShares;
  const price = view.corporations[decision.defunct].sharePrice ?? 0;
  const defunctName = view.corporations[decision.defunct].displayName;
  const survivorName = view.corporations[decision.survivor].displayName;

  // Keep takes whatever sell and trade leave, so the split always adds up.
  const [sell, setSell] = useState(0);
  const [trade, setTrade] = useState(0);
  const key = `${decision.defunct}:${shares}`;
  useEffect(() => {
    setSell(0);
    setTrade(0);
  }, [key]);
  const hold = shares - sell - trade;
  const check = checkDisposal(shares, survivorBank, { hold, sell, trade });

  const split = (next: { sell: number; trade: number }) => {
    setSell(next.sell);
    setTrade(next.trade);
  };

  return (
    <section className="card turn" aria-label={fill(t.title, { name: defunctName })}>
      <h2 className="serif">{fill(t.title, { name: defunctName })}</h2>
      <p className="note">
        {fill(t.seat, {
          name: view.seats[view.you]?.name ?? '',
          shares,
          price: price.toLocaleString(),
          survivor: survivorName,
          bank: survivorBank,
        })}
      </p>
      <div className="chips" role="group" aria-label={t.shortcuts}>
        <button type="button" onClick={() => split({ sell: 0, trade: 0 })}>
          {t.keepAll}
        </button>
        <button type="button" onClick={() => split({ sell: shares, trade: 0 })}>
          {t.sellAll}
        </button>
        <button type="button" onClick={() => {
          const most = maxTrade(shares, survivorBank);
          split({ sell: 0, trade: most });
        }}>
          {t.tradeMax}
        </button>
      </div>
      <ul className="rows">
        <li>
          <span className="corp">
            <span>{t.trade}</span>
            <span className="note tabnum">→ {trade / 2} {survivorName}</span>
          </span>
          <Stepper
            label={t.trade}
            value={trade}
            canLess={trade >= 2}
            canMore={hold >= 2 && (trade + 2) / 2 <= survivorBank}
            onLess={() => setTrade(trade - 2)}
            onMore={() => setTrade(trade + 2)}
          />
        </li>
        <li>
          <span className="corp">
            <span>{t.sell}</span>
            <span className="note tabnum">→ ${(sell * price).toLocaleString()}</span>
          </span>
          <Stepper
            label={t.sell}
            value={sell}
            canLess={sell > 0}
            canMore={hold > 0}
            onLess={() => setSell(sell - 1)}
            onMore={() => setSell(sell + 1)}
          />
        </li>
        <li>
          <span className="corp">
            <span>{t.hold}</span>
            <span className="note">{fill(t.keepWorth, { name: defunctName })}</span>
          </span>
          <output className="tabnum held">{hold}</output>
        </li>
      </ul>
      {!check.valid && check.reason && <p className="error">{check.reason}</p>}
      <button
        type="button"
        className="primary"
        disabled={busy || !check.valid}
        onClick={() => send({ type: 'dispose-shares', seat: view.you, hold, sell, trade })}
      >
        {t.confirm}
      </button>
    </section>
  );
}

// --- 9 · The vote -------------------------------------------------------------

type Vote = Extract<PendingDecision, { type: 'cast-vote' }>;

export function VoteSheet({ view, decision, busy, send }: { view: ClientView; decision: Vote; busy: boolean; send: Send }) {
  const v = copy.decisions.vote;
  const tally = tallyOf(view);
  const weight = view.motion?.weights[decision.seat] ?? 0;
  const mover = view.seats[decision.motionBy]?.name ?? fill(copy.common.playerFallback, { n: decision.motionBy + 1 });
  const cast = (inFavour: boolean) => send({ type: 'cast-vote', seat: decision.seat, inFavour });
  return (
    <section className="card turn" aria-label={v.title}>
      <h2 className="serif">{v.title}</h2>
      <p className="note">{fill(weight === 1 ? v.seatOne : v.seatMany, { name: mover, n: weight })}</p>
      {tally && (
        <p className="note tabnum">
          {tally.yes} {fill(v.tallyLead, { total: tally.total })} {tally.needed} {v.tallyTail}
        </p>
      )}
      <div className="options">
        <button type="button" className="option" disabled={busy} onClick={() => cast(true)}>
          <strong>{v.for}</strong>
          <span>{v.forNote}</span>
        </button>
        <button type="button" className="option" disabled={busy} onClick={() => cast(false)}>
          <strong>{v.against}</strong>
          <span>{v.againstNote}</span>
        </button>
      </div>
    </section>
  );
}

// --- 7 · End of turn ------------------------------------------------------------

export function EndTurnSheet({ view, busy, send }: { view: ClientView; busy: boolean; send: Send }) {
  const e = copy.game.endTurn;
  const can = (type: Command['type']) => view.legalMoves.some((move) => move.type === type);
  const canAnnounce = can('announce-end');
  const canMove = can('move-to-liquidate');
  return (
    <section className="card turn" aria-label={canAnnounce ? e.titleCanEnd : canMove ? e.titleBeforeFinish : e.titleOver}>
      <h2 className="serif">{canAnnounce ? e.titleCanEnd : canMove ? e.titleBeforeFinish : e.titleOver}</h2>
      <p className="note">{canAnnounce ? e.noteCanEnd : canMove ? e.noteCanMove : e.noteOver}</p>
      <div className="options">
        {canAnnounce && (
          <button type="button" className="option" disabled={busy} onClick={() => send({ type: 'announce-end', seat: view.you })}>
            <strong>{e.endGame}</strong>
            <span>{e.endGameNote}</span>
          </button>
        )}
        <button type="button" className="option" disabled={busy} onClick={() => send({ type: 'end-turn', seat: view.you })}>
          <strong>{canAnnounce ? e.keepPlaying : e.endTurn}</strong>
          <span>{canAnnounce ? e.keepPlayingNote : e.endTurnNote}</span>
        </button>
        {canMove && (
          <button type="button" className="option" disabled={busy} onClick={() => send({ type: 'move-to-liquidate', seat: view.you })}>
            <strong>{e.moveToLiquidate}</strong>
            <span>{e.moveToLiquidateNote}</span>
          </button>
        )}
      </div>
    </section>
  );
}

// --- 10 · Found a corporation, and the other pick-one lists ------------------------

export function FoundSheet({ view, busy, send }: { view: ClientView; busy: boolean; send: Send }) {
  const f = copy.decisions.found;
  const moves = view.legalMoves.flatMap((m) => (m.type === 'found-corporation' ? [m] : []));
  const options = foundingOptions(view).filter((option) => moves.some((m) => m.industry === option.industry));
  const group = view.pendingFound?.group.length ?? 2;
  return (
    <section className="card turn" aria-label={f.title}>
      <h2 className="serif">{f.title}</h2>
      <p className="note">{fill(f.seat, { name: view.seats[view.you]?.name ?? '', n: group })}</p>
      <div className="options">
        {options.map((option) => {
          const move = moves.find((m) => m.industry === option.industry)!;
          return (
            <button key={option.industry} type="button" className="option corpOption" disabled={busy} onClick={() => send(move)}>
              <Swatch industry={option.industry} />
              <strong>{option.name}</strong>
              <span className="tabnum">{fill(p.foundTier, { tier: option.tier, price: option.openingPrice.toLocaleString() })}</span>
            </button>
          );
        })}
      </div>
      <p className="note">{p.foundingOnTable}</p>
    </section>
  );
}

export function PickSheet({
  title,
  options,
  view,
  busy,
  onPick,
}: {
  title: string;
  options: readonly Industry[];
  view: ClientView;
  busy: boolean;
  onPick: (industry: Industry) => void;
}) {
  return (
    <section className="card turn" aria-label={title}>
      <h2 className="serif">{title}</h2>
      <p className="note">{p.pickOne}</p>
      <div className="options">
        {options.map((industry) => (
          <button key={industry} type="button" className="option corpOption" disabled={busy} onClick={() => onPick(industry)}>
            <Swatch industry={industry} />
            <strong>{view.corporations[industry].displayName}</strong>
            <span className="tabnum">{fill(copy.game.sizeTiles, { n: view.corporations[industry].size })}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
