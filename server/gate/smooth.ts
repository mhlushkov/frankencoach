import type { Frame, Landmark, Landmarks } from '../../contracts/types';

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Centered running median per point, per axis (x, y, z); visibility = min over the window.
 * `window` must be odd. Null frames stay null and are left out of their neighbours' windows;
 * at the edges the window shrinks to the frames that exist. Pure: returns a new Landmarks.
 */
export function medianSmooth(l: Landmarks, window = 3): Landmarks {
  if (!Number.isInteger(window) || window < 1 || window % 2 === 0) throw new Error(`median window must be a positive odd integer, got ${window}`);
  const h = (window - 1) / 2;
  const fs = l.frames;
  const frames: Frame[] = fs.map((f, i) => {
    if (!f.landmarks) return { t: f.t, landmarks: null };
    const win: Landmark[][] = [];
    for (let j = Math.max(0, i - h); j <= Math.min(fs.length - 1, i + h); j++) {
      const m = fs[j].landmarks;
      if (m) win.push(m);
    }
    const landmarks = f.landmarks.map((p, k) => {
      const ps = win.map(m => m[k]).filter(Boolean);
      return {
        x: median(ps.map(q => q.x)), y: median(ps.map(q => q.y)), z: median(ps.map(q => q.z)),
        visibility: Math.min(...ps.map(q => q.visibility)),
      };
    });
    return { t: f.t, landmarks };
  });
  return { ...l, frames };
}
