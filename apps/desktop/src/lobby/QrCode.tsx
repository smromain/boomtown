import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * A QR code, drawn as one SVG path (#62).
 *
 * Dark modules on a light plate with the four-module quiet zone the standard
 * asks for: a phone camera across a living room reads a code by its contrast
 * and its margin, so neither follows the app's theme. Error correction is `M`,
 * which a TV's glare and a slightly off-square photo both stay within.
 */
export function QrCode({ text, label, size = 184 }: { text: string; label: string; size?: number }) {
  const { path, extent } = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(text);
    code.make();
    const count = code.getModuleCount();
    const quiet = 4;
    let d = '';
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (code.isDark(row, col)) d += `M${col + quiet} ${row + quiet}h1v1h-1z`;
      }
    }
    return { path: d, extent: count + quiet * 2 };
  }, [text]);

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${extent} ${extent}`}
      shapeRendering="crispEdges"
    >
      <rect width={extent} height={extent} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
