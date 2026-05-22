/// <reference types="vite/client" />

import type { DesktopTrackerApi } from './lib/desktop';

declare global {
  interface Window {
    desktopTracker?: DesktopTrackerApi;
  }
}

export {};
