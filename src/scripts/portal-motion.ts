/** Exponential easing keeps the recovery continuous at different display refresh rates. */
export function smoothPortalLevel(
  current: number,
  target: number,
  elapsedMs: number,
  responseMs = 550,
): number {
  return current + (target - current) * (1 - Math.exp(-elapsedMs / responseMs));
}

/** Each failure chooses its own depth and pace, independently of display refresh rate. */
export function pickPortalFall(random: () => number = Math.random): {
  floor: number;
  responseMs: number;
} {
  return { floor: 38 + random() * 24, responseMs: 900 + random() * 700 };
}
