import { getActiveSession, getCurrentUser } from 'stores/sessionStore';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

export const PORTAL_PLAY_STORAGE_KEY = 'portaltrip-play';

const HEAT_STEP = 0.12;
const HEAT_HALF_LIFE_MS = 14 * 60 * 1000;
const FAIL_FAST_MS = 8200;
const FAIL_SLOW_MS = 19500;

interface PlaySlice {
  helpAt: number[];
  heat: number;
  heatAt: number;
}

interface PortalPlayState {
  users: Record<string, PlaySlice>;
  lastGrant: { payout: number; at: number } | null;
  recordHelp: (userId: string, at?: number) => void;
  noteGrant: (payout: number) => void;
}

function emptySlice(): PlaySlice {
  return { helpAt: [], heat: 0, heatAt: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asHelpAt(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'number') return item;
      if (item && typeof item === 'object' && 'at' in item) return Number(item.at);
      return Number.NaN;
    })
    .filter((at) => Number.isFinite(at) && at > 0)
    .slice(-40);
}

function normalizeSlice(raw: unknown): PlaySlice {
  if (!raw || typeof raw !== 'object') return emptySlice();
  const row = raw as { helpAt?: unknown; helps?: unknown; heat?: unknown; heatAt?: unknown };
  return {
    helpAt: asHelpAt(row.helpAt ?? row.helps),
    heat: Number(row.heat) || 0,
    heatAt: Number(row.heatAt) || 0,
  };
}

function decayHeat(slice: PlaySlice, now: number): number {
  if (!slice.heatAt) return clamp(slice.heat, 0, 1);
  const elapsed = Math.max(0, now - slice.heatAt);
  return clamp(slice.heat * 2 ** (-elapsed / HEAT_HALF_LIFE_MS), 0, 1);
}

function playSlice(userId: string | undefined): PlaySlice {
  if (!userId) return emptySlice();
  return normalizeSlice(portalPlayStore.getState().users[userId]);
}

export const portalPlayStore = createStore<PortalPlayState>()(
  persist<PortalPlayState, [], [], Pick<PortalPlayState, 'users'>>(
    (set) => ({
      users: {},
      lastGrant: null,
      recordHelp: (userId, at = Date.now()) =>
        set((state) => {
          const previous = normalizeSlice(state.users[userId]);
          return {
            users: {
              ...state.users,
              [userId]: {
                helpAt: [...previous.helpAt, at].slice(-40),
                heat: clamp(decayHeat(previous, at) + HEAT_STEP, 0, 1),
                heatAt: at,
              },
            },
          };
        }),
      noteGrant: (payout) => set({ lastGrant: { payout, at: Date.now() } }),
    }),
    {
      name: PORTAL_PLAY_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ users: state.users }),
    },
  ),
);

/** Saldo que cobra la Ciudadela. El estipendio del portal ya está en esta cifra. */
export function getSpendableBalance(): number {
  return getActiveSession()?.user.balance ?? 0;
}

/** Entre ~8 s y ~20 s. Jugar más seguido acorta la espera, nunca por debajo del suelo. */
export function nextFailDelayMs(now = Date.now()): number {
  const heat = decayHeat(playSlice(getCurrentUser()?.id), now);
  const jitter = (Math.random() * 2 - 1) * 1600;
  const delay = FAIL_SLOW_MS - (FAIL_SLOW_MS - FAIL_FAST_MS) * heat + jitter;
  return Math.round(clamp(delay, FAIL_FAST_MS - 400, FAIL_SLOW_MS + 1200));
}
