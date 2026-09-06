import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MERGE_NAMING,
  POOL,
  accretedFlavour,
  displayName,
  fragment,
  stem,
  type EatenRecord,
} from '@boomtown/engine';

/** Ground truth from `design/build.py` (`cd design && python3 -c ...`). */
const STEMS: Record<string, string> = {
  'Megahit Video': 'Megahitvi',
  'Pan-Atlas': 'Panatl',
  Blackcurrant: 'Blackcurr',
  Enrun: 'Enru',
  'Radio Hut': 'Radioh',
  'Chapter Eleven': 'Chapterele',
  Woolyworth: 'Woolywor',
  'Seers Roebeck': 'Seersroeb',
  Waldenbust: 'Waldenbu',
  'Circuit Village': 'Circuitvil',
  Compuwas: 'Compuw',
  'Fried Electronics': 'Friedelectro',
  'Transworld Air': 'Transworld',
  Braniffle: 'Braniff',
  Concordia: 'Concord',
  Texicorps: 'Texicor',
  'Standard Oyl': 'Standard',
  Wattage: 'Watta',
  Noquia: 'Noqu',
  Palmistry: 'Palmist',
  Netscapade: 'Netscapa',
  'Tinseltown Video': 'Tinseltownv',
  Fotomatic: 'Fotomat',
  'Tower of Records': 'Towerofrec',
  'Toys Я Were': 'Toyswe',
  'Kaybee Toyworks': 'Kaybeetoyw',
  'Chuck E. Wheeze': 'Chuckewhe',
  'Discovery Zonked': 'Discoveryzo',
};

const FRAGMENTS: Record<string, string> = {
  'Megahit Video': 'deo',
  'Pan-Atlas': 'las',
  Blackcurrant: 'rant',
  Enrun: 'run',
  'Radio Hut': 'hut',
  'Chapter Eleven': 'ven',
  Woolyworth: 'worth',
  'Seers Roebeck': 'beck',
  Waldenbust: 'bust',
  'Circuit Village': 'lage',
  Compuwas: 'was',
  'Fried Electronics': 'nics',
  'Transworld Air': 'air',
  Braniffle: 'niffle',
  Concordia: 'dia',
  Texicorps: 'corps',
  'Standard Oyl': 'oyl',
  Wattage: 'tage',
  Noquia: 'quia',
  Palmistry: 'mistry',
  Netscapade: 'pade',
  'Tinseltown Video': 'deo',
  Fotomatic: 'tic',
  'Tower of Records': 'cords',
  'Toys Я Were': 'were',
  'Kaybee Toyworks': 'works',
  'Chuck E. Wheeze': 'wheeze',
  'Discovery Zonked': 'ked',
};

const rec = (displayNameValue: string, flavours: string[] = []): EatenRecord => ({
  displayName: displayNameValue,
  flavours,
});

describe('stem and fragment parity with design/build.py', () => {
  it.each(Object.entries(STEMS))('stem(%s) = %s', (name, expected) => {
    expect(stem(name)).toBe(expected);
  });

  it.each(Object.entries(FRAGMENTS))('fragment(%s) = %s', (name, expected) => {
    expect(fragment(name)).toBe(expected);
  });

  it('every pool name yields a 3–6 letter fragment — none returns a whole word', () => {
    for (const candidates of Object.values(POOL)) {
      for (const candidate of candidates) {
        const f = fragment(candidate.baseName);
        expect(f.length).toBeGreaterThanOrEqual(3);
        expect(f.length).toBeLessThanOrEqual(6);
        expect(f.toLowerCase()).not.toBe(candidate.baseName.toLowerCase());
      }
    }
  });

  it('the round-half-to-even stem length matches Python (Noquia -> Noqu, not Noqui)', () => {
    expect(stem('Noquia')).toBe('Noqu');
  });
});

describe('display name lineage (the naming.md worked game)', () => {
  it('Megahit Video eats Pan-Atlas -> Megahitvilas', () => {
    expect(displayName('Megahit Video', [rec('Pan-Atlas')])).toBe('Megahitvilas');
  });

  it('Blackcurrant eats Enrun -> Blackcurrun (seam collapse)', () => {
    expect(displayName('Blackcurrant', [rec('Enrun')])).toBe('Blackcurrun');
  });

  it('Megahitvilas eats Radio Hut -> Megahitvilashut', () => {
    expect(displayName('Megahit Video', [rec('Pan-Atlas'), rec('Radio Hut')])).toBe('Megahitvilashut');
  });

  it('… eats Chapter Eleven -> Megahitvilashutven', () => {
    expect(
      displayName('Megahit Video', [rec('Pan-Atlas'), rec('Radio Hut'), rec('Chapter Eleven')]),
    ).toBe('Megahitvilashutven');
  });

  it('… eats Blackcurrun -> Megahitvilashutvenrun (fragment of a display name)', () => {
    expect(
      displayName('Megahit Video', [
        rec('Pan-Atlas'),
        rec('Radio Hut'),
        rec('Chapter Eleven'),
        rec('Blackcurrun'),
      ]),
    ).toBe('Megahitvilashutvenrun');
  });
});

describe('rules the module must respect', () => {
  it('a returned headquarters refounds under its base name (empty eaten list)', () => {
    expect(displayName('Megahit Video', [])).toBe('Megahit Video');
  });

  it('a one-character word (possessive) is skipped', () => {
    // "Sizzle's" -> last real word "Sizzle" (the "s" is dropped)
    expect(fragment("Sizzle's").length).toBeGreaterThanOrEqual(3);
    expect(fragment("Sizzle's")).not.toBe('s');
  });

  it('disabling merge naming keeps the survivor’s own name', () => {
    expect(displayName('Megahit Video', [rec('Pan-Atlas')], { ...DEFAULT_MERGE_NAMING, enabled: false })).toBe(
      'Megahit Video',
    );
  });

  it('the blocklist falls back to the next syllable boundary, never the unblended name', () => {
    const blocked = (name: string) => name === 'Megahitvilas';
    const out = displayName('Megahit Video', [rec('Pan-Atlas')], DEFAULT_MERGE_NAMING, blocked);
    expect(out).not.toBe('Megahitvilas');
    expect(out).not.toBe('MegahitviPan-Atlas');
    expect(out.startsWith('Megahitvi')).toBe(true);
  });

  it('flavour accretes fully: own line plus every swallowed line', () => {
    const eaten = [rec('Panatl', ['the glamour of air travel', 'wings over everywhere'])];
    expect(accretedFlavour('be kind, rewind', eaten)).toEqual([
      'be kind, rewind',
      'the glamour of air travel',
      'wings over everywhere',
    ]);
  });
});
