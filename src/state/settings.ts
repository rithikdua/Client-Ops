import type { Density, NavStyle } from './types';

/**
 * Presentation settings. In the design prototype these were component-level
 * props ("Feel" section) rather than in-app controls: density switches the
 * page/row padding, navStyle collapses the sidebar to an icon rail, and
 * headerGlow paints the design system's purple halo behind the canvas.
 * Defaults match the values saved in the exported design.
 */
export const APP_SETTINGS: { density: Density; navStyle: NavStyle; headerGlow: boolean } = {
  density: 'comfortable',
  navStyle: 'full',
  headerGlow: true,
};
