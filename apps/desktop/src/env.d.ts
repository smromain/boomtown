/// <reference types="vite/client" />

import type { BoomtownBridge } from '../electron/preload.js';

declare global {
  interface Window {
    /** The preload bridge (KTD9). Only present in the Electron renderer. */
    readonly boomtown: BoomtownBridge;
  }
}

declare module '*.css';
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
