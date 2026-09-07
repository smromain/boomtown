import type { Industry } from '@boomtown/engine';

/** One drawn mark per industry — placeholder identities, ported from design/build.py `b_mark`. */
const PATHS: Record<Industry, string> = {
  books:
    'M12 7v13M12 7C10 5 7 4.5 3 5v13c4-.5 7 0 9 2M12 7c2-2 5-2.5 9-2v13c-4-.5-7 0-9 2',
  electronics:
    'M3 10h18v10H3zM8 15a2 2 0 1 0 0-.01M13 14h5M13 17h5M8 10 17 3',
  air: 'M12 2c3 3 3 17 0 20-3-3-3-17 0-20zM2 12h20M4.5 7.5c4.7 2 10.3 2 15 0M4.5 16.5c4.7-2 10.3-2 15 0',
  energy: 'M13 3l-7 10h5l-1 8 7-10h-5z',
  tech: 'M6 2h12v20H6zM9 6h6M9 11h2M13 11h2M9 14h2M13 14h2M9 17h6',
  video: 'M2 6h20v12H2zM8 12a2.5 2.5 0 1 0 0-.01M16 12a2.5 2.5 0 1 0 0-.01M2 9h20',
  toys: 'M3 9h12v12H3zM7 13h4M9 11v4M17 3l1.6 3.3 3.4.5-2.5 2.4.6 3.6-3.1-1.7-3.1 1.7.6-3.6L12 6.8l3.4-.5z',
};

export function IndustryMark({ industry, color, size = 24 }: { industry: Industry; color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[industry]} />
    </svg>
  );
}
