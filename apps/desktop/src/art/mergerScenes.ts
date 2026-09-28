/**
 * The Game Night skin's merger drawings (prototype): the survivor's
 * headquarters on the left, and a tower crane swinging the company it is
 * swallowing across to it. Drawn by hand in a 600×150 box, ground at y 132,
 * in the same flat, rough-lined style as the card scenes; edit them here.
 *
 * A scene is assembled from three parts so any survivor can meet any defunct
 * company: `BACKDROP`, one `HQ` (coloured `--gn-c`), then the crane carrying
 * one `LOAD` (coloured `--gn-t`). A load is drawn in its own 76-wide box with
 * its base at y 58 and hangs from the hook by two slings meeting at (38, -8);
 * `top` is where the slings meet the load.
 */
import type { Industry } from '@boomtown/engine';

const scallop = (x: number, y: number, n: number, w: number, h: number): string =>
  `M${x} ${y} ` + Array.from({ length: n }, () => `q${w / 2} ${h} ${w} 0`).join(' ') + 'z';

export const BACKDROP = `
<rect width="600" height="150" fill="var(--gn-sky)"/>
<circle cx="566" cy="52" r="14" fill="var(--gn-sun)" class="gn-fl"/>
<g fill="var(--gn-star)"><circle cx="300" cy="18" r="1.4"/><circle cx="470" cy="12" r="1.2"/><circle cx="28" cy="30" r="1.4"/></g>
<path class="gn-ln" d="M424 72 q6 -4 12 0 q6 -4 12 0" style="stroke-width:1.6"/>
<path class="gn-fl" d="M-4 128 Q150 120 300 128 T604 126 V154 H-4Z" fill="var(--gn-hill)"/>
<path class="gn-fl" d="M-4 138 Q200 132 400 138 T604 136 V154 H-4Z" fill="var(--gn-hill2)"/>`;

export const HQ: Record<Industry, string> = {
  video: `
<rect class="gn-fl" x="70" y="50" width="220" height="84" fill="var(--gn-wall)"/>
<rect class="gn-fl" x="126" y="34" width="108" height="24" rx="4" fill="var(--gn-c)"/>
<g fill="var(--gn-win)">${[138, 154, 170, 186, 202, 218].map((x) => `<circle cx="${x}" cy="46" r="2.6"/>`).join('')}</g>
<path class="gn-fl" d="M62 70 H298 V82 H62Z" fill="var(--gn-c)"/>
<path class="gn-fl" d="${scallop(62, 82, 13, 18, 10)}" fill="var(--gn-lite)"/>
<rect class="gn-fl" x="92" y="96" width="130" height="36" fill="var(--gn-glass)"/>
<g class="gn-fl" style="stroke-width:1.6"><rect x="100" y="104" width="12" height="24" fill="var(--gn-line)"/><rect x="118" y="104" width="12" height="24" fill="var(--gn-c)"/><rect x="136" y="104" width="12" height="24" fill="var(--gn-sun)"/><rect x="160" y="104" width="12" height="24" fill="var(--gn-line)"/><rect x="178" y="104" width="12" height="24" fill="var(--gn-c)"/><rect x="196" y="104" width="12" height="24" fill="var(--gn-lite)"/></g>
<rect class="gn-fl" x="236" y="94" width="36" height="38" fill="var(--gn-c)"/>
<circle cx="264" cy="114" r="2.2" fill="var(--gn-lite)"/>`,

  books: `
<path class="gn-ln" d="M36 132 V86 q0 -10 12 -10"/><circle class="gn-fl" cx="50" cy="80" r="5" fill="var(--gn-win)"/>
<rect class="gn-fl" x="62" y="46" width="226" height="86" fill="var(--gn-wall)"/>
<rect class="gn-fl" x="54" y="40" width="242" height="10" fill="var(--gn-lite)"/>
<rect class="gn-fl" x="128" y="20" width="94" height="22" rx="4" fill="var(--gn-c)"/>
<path class="gn-fl" d="M158 34 q8 -6 17 0 q9 -6 17 0 v-8 q-8 -5 -17 0 q-9 -5 -17 0z" fill="var(--gn-lite)" style="stroke-width:1.4"/>
<path class="gn-fl" d="M54 60 H296 V72 H54Z" fill="var(--gn-c)"/>
<path class="gn-fl" d="${scallop(58, 72, 13, 18, 10)}" fill="var(--gn-lite)"/>
<rect class="gn-fl" x="78" y="88" width="150" height="42" fill="var(--gn-glass)"/>
<g class="gn-fl" style="stroke-width:1.4"><rect x="86" y="100" width="9" height="30" fill="var(--gn-c)"/><rect x="95" y="96" width="8" height="34" fill="var(--gn-lite)"/><rect x="103" y="102" width="10" height="28" fill="#C64E25"/><rect x="113" y="98" width="7" height="32" fill="var(--gn-c)"/><rect x="120" y="104" width="11" height="26" fill="#355C99"/><rect x="138" y="98" width="9" height="32" fill="var(--gn-lite)"/><rect x="147" y="102" width="9" height="28" fill="var(--gn-c)"/><rect x="156" y="96" width="8" height="34" fill="#4A9471"/><rect x="164" y="100" width="10" height="30" fill="var(--gn-lite)"/><rect x="174" y="104" width="9" height="26" fill="#971D50"/><rect x="183" y="98" width="9" height="32" fill="var(--gn-c)"/><rect x="198" y="106" width="22" height="7" fill="var(--gn-lite)"/><rect x="200" y="113" width="20" height="7" fill="var(--gn-c)"/><rect x="198" y="120" width="22" height="10" fill="#355C99"/></g>
<rect class="gn-fl" x="242" y="86" width="32" height="46" fill="var(--gn-c)"/>
<circle cx="268" cy="110" r="2.2" fill="var(--gn-lite)"/>`,

  electronics: `
<path class="gn-fl" d="M42 100 a17 17 0 0 0 32 10z" fill="var(--gn-lite)"/>
<path class="gn-ln" d="M58 106 V132 M58 106 l8 -10"/>
<rect class="gn-fl" x="84" y="56" width="200" height="76" fill="var(--gn-wall)"/>
<path class="gn-ln" d="M252 56 V12 M242 24 H262 M245 36 H259 M252 12 l-10 12 M252 12 l10 12"/>
<path class="gn-ln" d="M236 8 q-8 8 0 16 M268 8 q8 8 0 16 M228 2 q-13 14 0 28 M276 2 q13 14 0 28" style="stroke-width:1.8"/>
<rect class="gn-fl" x="98" y="64" width="140" height="22" rx="5" fill="var(--gn-c)"/>
<g fill="var(--gn-lite)"><rect x="107" y="70" width="10" height="10" rx="2"/><rect x="123" y="72" width="104" height="6" rx="3" opacity=".9"/></g>
<rect class="gn-fl" x="96" y="94" width="134" height="36" fill="var(--gn-glass)"/>
<g class="gn-fl" style="stroke-width:1.4"><rect x="102" y="100" width="34" height="24" rx="4" fill="var(--gn-wall)"/><rect x="106" y="104" width="26" height="16" rx="2" fill="var(--gn-win)"/><rect x="142" y="104" width="30" height="20" rx="3" fill="var(--gn-c)"/><circle cx="151" cy="114" r="5" fill="var(--gn-wall)"/><rect x="178" y="98" width="44" height="26" rx="4" fill="var(--gn-wall)"/><rect x="182" y="102" width="36" height="18" rx="2" fill="var(--gn-win)"/></g>
<rect class="gn-fl" x="242" y="92" width="32" height="40" fill="var(--gn-c)"/>
<circle cx="268" cy="114" r="2.2" fill="var(--gn-lite)"/>`,

  tech: `
<rect class="gn-fl" x="14" y="94" width="38" height="38" rx="3" fill="var(--gn-c)"/>
<rect class="gn-fl" x="23" y="94" width="20" height="13" fill="var(--gn-lite)"/>
<rect class="gn-fl" x="21" y="114" width="24" height="18" fill="var(--gn-wall)"/>
<path class="gn-ln" d="M78 122 V132 M90 122 V132" style="stroke-width:3"/>
<path class="gn-fl" d="M73 132 h8 v-3 h-8z M87 132 h8 v-3 h-8z" fill="var(--gn-line)"/>
<path class="gn-ln" d="M70 96 l-9 -12 M98 100 l9 6" style="stroke-width:3"/>
<circle class="gn-fl" cx="60" cy="82" r="3.2" fill="var(--gn-skin1)"/>
<path class="gn-ln" d="M108 106 V80" style="stroke-width:1.6"/>
<path class="gn-fl" d="M100 74 h22 l6 7 l-6 7 h-22z" fill="var(--gn-c)"/>
<circle class="gn-fl" cx="108" cy="107" r="3.2" fill="var(--gn-skin1)"/>
<rect class="gn-fl" x="68" y="72" width="32" height="52" rx="7" fill="#2b2f3a"/>
<rect class="gn-fl" x="72" y="80" width="24" height="34" rx="2" fill="var(--gn-win)" style="stroke-width:1.4"/>
<circle class="gn-fl" cx="84" cy="91" r="7" fill="var(--gn-skin1)"/>
<circle cx="81.5" cy="90" r="1.1" fill="var(--gn-line)"/><circle cx="86.5" cy="90" r="1.1" fill="var(--gn-line)"/>
<path class="gn-ln" d="M81 94 q3 2.4 6 0" style="stroke-width:1.2"/>
<g fill="var(--gn-c)"><rect x="75" y="103" width="5" height="5" rx="1"/><rect x="82" y="103" width="5" height="5" rx="1"/><rect x="89" y="103" width="5" height="5" rx="1"/></g>
<rect x="79" y="75" width="10" height="2" rx="1" fill="var(--gn-lite)"/>
<circle cx="84" cy="119" r="2.4" fill="var(--gn-lite)"/>
<rect class="gn-fl" x="118" y="16" width="136" height="116" fill="var(--gn-wall)"/>
<rect class="gn-fl" x="130" y="26" width="112" height="38" rx="5" fill="var(--gn-c)"/>
<circle class="gn-ln" cx="186" cy="45" r="13" style="stroke:var(--gn-lite)"/>
<path class="gn-ln" d="M173 45 H199 M186 32 q-8 13 0 26 M186 32 q8 13 0 26" style="stroke:var(--gn-lite);stroke-width:1.6"/>
<g class="gn-fl" fill="var(--gn-glass)" style="stroke-width:1.4">${[74, 92]
    .flatMap((y) => [132, 172, 212].map((x) => `<rect x="${x}" y="${y}" width="28" height="12"/>`))
    .join('')}</g>
<rect class="gn-fl" x="170" y="110" width="32" height="22" fill="var(--gn-glass)"/>
<rect class="gn-fl" x="254" y="72" width="48" height="60" fill="var(--gn-wall)"/>
<rect class="gn-fl" x="262" y="82" width="32" height="10" fill="var(--gn-glass)"/>
<rect class="gn-fl" x="262" y="100" width="32" height="10" fill="var(--gn-glass)"/>
<path class="gn-fl" d="M266 72 a13 13 0 0 1 24 -8z" fill="var(--gn-lite)"/>
<path class="gn-ln" d="M140 16 V6 M232 16 V2" style="stroke-width:1.6"/>
<circle cx="232" cy="2" r="2.4" fill="var(--gn-c)"/>`,

  energy: `
<rect class="gn-fl" x="56" y="84" width="74" height="48" fill="var(--gn-c)"/>
<ellipse class="gn-fl" cx="93" cy="84" rx="37" ry="7" fill="var(--gn-lite)"/>
<path class="gn-ln" d="M56 108 H130" style="stroke:var(--gn-lite);stroke-width:3"/>
<path class="gn-ln" d="M120 88 V130 M126 88 V130 M120 96 H126 M120 106 H126 M120 116 H126" style="stroke-width:1.4"/>
<rect class="gn-fl" x="138" y="98" width="52" height="34" fill="var(--gn-lite)"/>
<ellipse class="gn-fl" cx="164" cy="98" rx="26" ry="5" fill="var(--gn-c)"/>
<path class="gn-ln" d="M130 118 H138 M190 120 H206"/>
<path class="gn-ln" d="M204 132 L226 34 L248 132 M209 110 H243 M213 90 H239 M218 70 H234 M222 52 H230 M209 110 L239 90 M213 90 L234 70 M218 70 L230 52"/>
<rect class="gn-fl" x="220" y="28" width="12" height="8" fill="var(--gn-c)"/>
<rect class="gn-fl" x="266" y="48" width="18" height="84" fill="var(--gn-wall)"/>
<rect class="gn-fl" x="266" y="56" width="18" height="8" fill="var(--gn-c)"/>
<circle class="gn-fl" cx="280" cy="36" r="8" fill="var(--gn-lite)"/>
<circle class="gn-fl" cx="294" cy="22" r="10" fill="var(--gn-lite)"/>
<circle class="gn-fl" cx="312" cy="12" r="7" fill="var(--gn-lite)"/>`,

  toys: `
<path class="gn-ln" d="M38 132 q-3 -24 2 -44 M56 132 q4 -30 -2 -52"/>
<ellipse class="gn-fl" cx="40" cy="76" rx="12" ry="14" fill="var(--gn-sun)"/>
<ellipse class="gn-fl" cx="56" cy="66" rx="12" ry="14" fill="#C64E25"/>
<path class="gn-fl" d="M76 132 L90 72 H234 L248 132Z" fill="var(--gn-lite)"/>
<path class="gn-fl" d="M106 132 L112 72 H132 L128 132Z M152 132 L152 72 H172 L172 132Z M196 132 L192 72 H212 L218 132Z" fill="var(--gn-c)"/>
<path class="gn-fl" d="M134 132 q28 -62 56 0z" fill="var(--gn-line)"/>
<path class="gn-fl" d="M64 76 L162 20 L260 76Z" fill="var(--gn-c)"/>
<path class="gn-fl" d="${scallop(64, 76, 10, 19.6, 10)}" fill="var(--gn-lite)"/>
<path class="gn-ln" d="M162 20 V4"/><path class="gn-fl" d="M162 4 l18 5 l-18 5z" fill="var(--gn-sun)"/>
<g transform="translate(10 0)"><path class="gn-ln" d="M286 112 V132 M293 112 V132 M306 112 V132 M313 112 V132" style="stroke-width:3"/>
<path class="gn-ln" d="M282 100 q-6 4 -4 12" style="stroke-width:1.6"/>
<path class="gn-fl" d="M306 96 L316 66 L325 68 L318 98z" fill="#f2c14e"/>
<path class="gn-fl" d="M282 100 q0 -8 10 -8 h20 q8 0 8 8 v6 q0 8 -8 8 h-22 q-8 0 -8 -8z" fill="#f2c14e"/>
<path class="gn-ln" d="M318 59 l-2 -6 M324 58 l0 -6" style="stroke-width:1.6"/>
<path class="gn-fl" d="M312 66 q2 -10 12 -9 q10 1 12 7 q-2 5 -10 5 q-8 1 -14 -3z" fill="#f2c14e"/>
<g fill="#b8742a"><circle cx="292" cy="100" r="3"/><circle cx="304" cy="104" r="3.2"/><circle cx="313" cy="97" r="2.4"/><circle cx="297" cy="108" r="2"/><circle cx="317" cy="83" r="2"/><circle cx="314" cy="91" r="1.8"/><circle cx="320" cy="74" r="1.6"/></g>
<circle cx="327" cy="62" r="1.5" fill="var(--gn-line)"/></g>
<g transform="translate(6 0)"><path class="gn-ln" d="M276 129 q7 -2 5 -9 q-2 -6 3 -8" style="stroke-width:1.6"/>
<path class="gn-fl" d="M250 132 q0 -15 13 -15 q12 0 14 11 l-2 4z" fill="var(--gn-seal)"/>
<circle class="gn-fl" cx="250" cy="108" r="5.5" fill="var(--gn-seal)"/><circle cx="250" cy="108" r="2.6" fill="#f3a6b8"/>
<circle class="gn-fl" cx="261" cy="107" r="5.5" fill="var(--gn-seal)"/><circle cx="261" cy="107" r="2.6" fill="#f3a6b8"/>
<path class="gn-fl" d="M249 119 l-9 3 l9 3z" fill="var(--gn-seal)"/>
<circle class="gn-fl" cx="255" cy="117" r="7" fill="var(--gn-seal)"/>
<circle cx="240" cy="122" r="1.8" fill="#f3a6b8"/><circle cx="252" cy="116" r="1.3" fill="var(--gn-line)"/>
<path class="gn-fl" d="M251 105 l5 -10 l5 10z" fill="var(--gn-c)"/></g>`,

  air: `
<path class="gn-ln" d="M30 132 V94"/><path class="gn-fl" d="M30 94 l20 3 v6 l-20 3z" fill="var(--gn-c)"/>
<rect class="gn-fl" x="56" y="92" width="186" height="40" fill="var(--gn-wall)"/>
<rect class="gn-fl" x="64" y="100" width="170" height="20" fill="var(--gn-glass)"/>
<path class="gn-ln" d="M94 100 V120 M124 100 V120 M154 100 V120 M184 100 V120 M214 100 V120" style="stroke-width:1.4"/>
<path class="gn-fl" d="M48 84 H250 L242 92 H56Z" fill="var(--gn-c)"/>
<rect class="gn-fl" x="118" y="68" width="62" height="16" rx="3" fill="var(--gn-lite)"/>
<path class="gn-fl" d="M132 77 q14 -4 32 -2 q4 1 4 2 q0 1 -4 2 q-18 2 -32 -2z M146 75 l6 -5 h3 l-3 6z" fill="var(--gn-c)" style="stroke-width:1.2"/>
<rect class="gn-fl" x="262" y="48" width="18" height="84" fill="var(--gn-wall)"/>
<path class="gn-fl" d="M252 34 H290 L286 50 H256Z" fill="var(--gn-glass)"/>
<path class="gn-fl" d="M250 28 H292 V34 H250Z" fill="var(--gn-c)"/>
<path class="gn-ln" d="M271 28 V14"/>
<circle cx="271" cy="12" r="2.4" fill="var(--gn-c)"/>`,
};

interface Load {
  readonly top: number;
  readonly art: string;
}

export const LOAD: Record<Industry, Load> = {
  video: {
    top: 10,
    art: `
<rect class="gn-fl" x="6" y="22" width="64" height="36" fill="var(--gn-wall)"/>
<rect class="gn-fl" x="18" y="10" width="40" height="13" rx="3" fill="var(--gn-t)"/>
<g fill="var(--gn-win)"><circle cx="25" cy="16.5" r="1.8"/><circle cx="33" cy="16.5" r="1.8"/><circle cx="41" cy="16.5" r="1.8"/><circle cx="49" cy="16.5" r="1.8"/></g>
<path class="gn-fl" d="M2 27 H74 V33 H2Z" fill="var(--gn-t)"/>
<rect class="gn-fl" x="10" y="38" width="36" height="20" fill="var(--gn-glass)"/>
<rect class="gn-fl" x="52" y="36" width="14" height="22" fill="var(--gn-t)"/>`,
  },
  books: {
    top: 18,
    art: `
<rect class="gn-fl" x="6" y="18" width="64" height="40" fill="var(--gn-wall)"/>
<path class="gn-fl" d="M2 24 H74 V31 H2Z" fill="var(--gn-t)"/>
<path class="gn-fl" d="${scallop(2, 31, 8, 9, 5)}" fill="var(--gn-lite)"/>
<rect class="gn-fl" x="10" y="40" width="38" height="18" fill="var(--gn-glass)"/>
<g class="gn-fl" style="stroke-width:1.2"><rect x="14" y="44" width="5" height="14" fill="var(--gn-t)"/><rect x="19" y="42" width="5" height="16" fill="var(--gn-lite)"/><rect x="24" y="46" width="6" height="12" fill="#355C99"/><rect x="33" y="43" width="5" height="15" fill="var(--gn-t)"/><rect x="38" y="45" width="5" height="13" fill="var(--gn-lite)"/></g>
<rect class="gn-fl" x="54" y="38" width="12" height="20" fill="var(--gn-t)"/>`,
  },
  electronics: {
    top: 24,
    art: `
<path class="gn-ln" d="M60 24 V4 M55 10 H65 M60 4 l-5 6 M60 4 l5 6" style="stroke-width:1.6"/>
<rect class="gn-fl" x="6" y="24" width="64" height="34" fill="var(--gn-wall)"/>
<rect class="gn-fl" x="12" y="28" width="42" height="10" rx="2" fill="var(--gn-t)"/>
<rect class="gn-fl" x="10" y="42" width="38" height="16" fill="var(--gn-glass)"/>
<rect class="gn-fl" x="16" y="45" width="16" height="11" rx="2" fill="var(--gn-wall)" style="stroke-width:1.2"/>
<rect class="gn-fl" x="54" y="40" width="12" height="18" fill="var(--gn-t)"/>`,
  },
  tech: {
    top: 4,
    art: `
<rect class="gn-fl" x="8" y="4" width="60" height="42" rx="6" fill="var(--gn-wall)"/>
<rect class="gn-fl" x="14" y="10" width="48" height="30" rx="3" fill="var(--gn-t)"/>
<circle class="gn-ln" cx="38" cy="25" r="9" style="stroke:var(--gn-lite);stroke-width:1.6"/>
<path class="gn-ln" d="M29 25 H47 M38 16 q-6 9 0 18 M38 16 q6 9 0 18" style="stroke:var(--gn-lite);stroke-width:1.2"/>
<path class="gn-fl" d="M30 46 h16 l4 6 h-24z" fill="var(--gn-wall)"/>
<rect class="gn-fl" x="20" y="52" width="36" height="6" rx="2" fill="var(--gn-wall)"/>`,
  },
  energy: {
    top: 20,
    art: `
<rect class="gn-fl" x="10" y="22" width="56" height="36" fill="var(--gn-t)"/>
<ellipse class="gn-fl" cx="38" cy="22" rx="28" ry="5" fill="var(--gn-lite)"/>
<path class="gn-ln" d="M10 40 H66" style="stroke:var(--gn-lite);stroke-width:2.6"/>
<path class="gn-ln" d="M56 26 V56 M61 26 V56" style="stroke-width:1.2"/>`,
  },
  toys: {
    top: 20,
    art: `
<path class="gn-fl" d="M8 58 L14 26 H62 L68 58Z" fill="var(--gn-lite)"/>
<path class="gn-fl" d="M22 58 L25 26 H35 L35 58Z M45 58 L45 26 H55 L58 58Z" fill="var(--gn-t)"/>
<path class="gn-fl" d="M4 28 L38 2 L72 28Z" fill="var(--gn-t)"/>`,
  },
  air: {
    top: 28,
    art: `
<path class="gn-fl" d="M30 36 l12 14 h6 l-6 -14z" fill="var(--gn-t)"/>
<path class="gn-fl" d="M2 34 q24 -7 62 -4 q8 1 10 4 q-2 3 -10 4 q-40 3 -62 -4z" fill="var(--gn-lite)"/>
<path class="gn-fl" d="M28 32 l14 -14 h6 l-6 16z" fill="var(--gn-t)"/>
<path class="gn-fl" d="M2 34 l-2 -12 h6 l8 10z" fill="var(--gn-t)"/>
<g fill="var(--gn-glass)"><circle cx="22" cy="33" r="1.4"/><circle cx="30" cy="32.5" r="1.4"/><circle cx="50" cy="32.5" r="1.4"/><circle cx="58" cy="33" r="1.4"/></g>`,
  },
};

/** The crane, carrying `load`, and the dashed swing towards the survivor. */
export function crane(load: Industry): string {
  const { top, art } = LOAD[load];
  return `
<path class="gn-ln" d="M380 132 V22 M392 132 V22" style="stroke-width:2.2"/>
<path class="gn-ln" d="M380 132 L392 118 L380 104 L392 90 L380 76 L392 62 L380 48 L392 34 L380 22" style="stroke-width:1.4"/>
<path class="gn-ln" d="M386 22 V6 M386 6 L336 20 M386 6 L526 20" style="stroke-width:1.4"/>
<rect class="gn-fl" x="330" y="18" width="200" height="8" fill="var(--gn-crane)"/>
<rect class="gn-fl" x="330" y="26" width="26" height="16" fill="var(--gn-rock)"/>
<rect class="gn-fl" x="394" y="30" width="18" height="14" rx="2" fill="var(--gn-crane)"/>
<rect class="gn-fl" x="498" y="26" width="16" height="6" fill="var(--gn-line)"/>
<g class="gn-sway"><path class="gn-ln" d="M506 32 V54" style="stroke-width:1.6"/>
<g transform="translate(468 62) rotate(-5)">
<path class="gn-ln" d="M38 -8 L10 ${top} M38 -8 L66 ${top}" style="stroke-width:1.4"/>
<path class="gn-ln" d="M38 -10 q-5 5 0 9" style="stroke-width:2"/>
${art}
</g></g>
<path class="gn-ln" d="M456 116 C436 126 396 110 354 116" style="stroke-dasharray:6 7"/>
<path class="gn-fl" d="M350 116 l13 -8 l0 13z" fill="var(--gn-line)"/>`;
}

export function mergerScene(survivor: Industry, defunct: Industry): string {
  return `<g class="gn-rough">${BACKDROP}${HQ[survivor]}${crane(defunct)}</g>`;
}
