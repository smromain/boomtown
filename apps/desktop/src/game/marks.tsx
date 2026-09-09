import type { ComponentType, SVGProps } from 'react';
import type { Industry } from '@boomtown/engine';
import {
  BoltIcon,
  BookOpenIcon,
  CakeIcon,
  CpuChipIcon,
  DevicePhoneMobileIcon,
  FilmIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/solid';

/** One Heroicon per industry — the seven are fixed, so this map is total. */
const ICONS: Record<Industry, ComponentType<SVGProps<SVGSVGElement>>> = {
  books: BookOpenIcon,
  electronics: CpuChipIcon,
  air: PaperAirplaneIcon,
  energy: BoltIcon,
  tech: DevicePhoneMobileIcon,
  video: FilmIcon,
  toys: CakeIcon,
};

export function IndustryMark({ industry, color, size = 24 }: { industry: Industry; color: string; size?: number }) {
  const Icon = ICONS[industry];
  return <Icon width={size} height={size} style={{ color, margin: 2, alignSelf: 'center' }} aria-hidden="true" />;
}
