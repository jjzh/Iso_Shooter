// Three.js is loaded via CDN as a global script tag
// This declaration makes TypeScript aware of the global THREE variable

import type * as THREEModule from 'three';

declare global {
  const THREE: typeof THREEModule;
  // nipplejs mobile joystick library (loaded via CDN)
  const nipplejs: any;
}

export {};
