import type { Settings } from "./types";

/** FPS value meaning "no limit at all" (written as a huge target frame rate). */
export const FPS_UNLIMITED = 9999;

/** The graphics options RoAccount writes to Roblox's ClientAppSettings.json. */
export const gfxOf = (s: Settings) => ({
  fpsCap: s.fpsCap, lowestGraphics: s.lowestGraphics, msaa: s.msaa, textures: s.textures, render: s.render,
  graySky: s.graySky, noGrass: s.noGrass, voxel: s.voxelLighting, noShadows: s.noShadows, noPostFx: s.noPostFx,
});
export const gfxKey = (s: Settings) => JSON.stringify(gfxOf(s));
export const gfxAny = (s: Settings) =>
  s.fpsCap > 0 || s.lowestGraphics || s.msaa > 0 || s.textures !== "default" || s.render !== "default" || s.graySky || s.noGrass || s.voxelLighting || s.noShadows || s.noPostFx;
export const fpsLabel = (n: number) => (n === 0 ? "Default" : n >= FPS_UNLIMITED ? "∞" : String(n));
