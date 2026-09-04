import {
  type PortalActivity,
  type PortalActivitySample,
  reportPortalActivity,
  startPortalActivity,
} from 'services/portalTripApi';
import { getApiErrorView, PortalTripApiError } from 'services/portalTripApiError';
import { portalPlayStore } from 'stores/portalPlayStore';
import { getActiveSession, sessionStore } from 'stores/sessionStore';
import { showToast } from './travel-planner/notifications';

/** Sends measured movement, never an amount. One request in flight; retries reuse the sample. */
export class PortalActivityTracker {
  private readonly token = getActiveSession()?.accessToken;
  private readonly userId = getActiveSession()?.user.id;
  private cycle: PortalActivity | null = null;
  private pending: PortalActivitySample | null = null;
  private busy = false;
  private stopped = false;
  private lastMove = 0;
  private activeMs = 0;
  private distance = 0;
  private nextAt = 0;
  private warned = false;
  rewarded = false;
  progress = 0;

  private current(): boolean {
    const session = getActiveSession();
    return !this.stopped && Boolean(this.token) && session?.accessToken === this.token;
  }

  move(distance: number, now = performance.now()): void {
    if (!this.current() || !this.cycle || document.hidden || distance <= 0) return;
    if (this.lastMove && now - this.lastMove <= 200) {
      this.activeMs += now - this.lastMove;
      this.distance += Math.min(distance, 0.25);
    }
    this.lastMove = now;
  }

  stop(): void {
    this.stopped = true;
  }

  tick(now: number): void {
    if (document.hidden) {
      this.lastMove = this.activeMs = this.distance = 0;
      return;
    }
    if (!this.current() || this.rewarded || this.busy || now < this.nextAt) return;
    this.busy = true;
    void this.send();
  }

  private async send(): Promise<void> {
    try {
      let result: PortalActivity;
      if (!this.cycle) {
        result = await startPortalActivity();
        this.lastMove = this.activeMs = this.distance = 0;
      } else {
        this.pending ??= {
          cycleId: this.cycle.cycleId,
          sequence: this.cycle.nextSequence,
          activeMs: Math.min(5000, Math.floor(this.activeMs)),
          distance: Math.min(20, this.distance),
        };
        this.activeMs = this.distance = 0;
        result = await reportPortalActivity(this.pending);
      }
      if (!this.current()) return;
      this.pending = null;
      this.cycle = result;
      this.progress = result.progress;
      this.warned = false;
      if (result.payout > 0 && this.userId) {
        this.rewarded = true;
        portalPlayStore.getState().recordHelp(this.userId);
        portalPlayStore.getState().noteGrant(result.payout);
        sessionStore.getState().setBalance(Number(result.balance));
      }
    } catch (error) {
      if (!this.current()) return;
      if (error instanceof PortalTripApiError && (error.status === 422 || error.status === 404)) {
        // An idle/expired cycle resumes automatically on the next sample.
        this.cycle = null;
        this.pending = null;
        this.progress = 0;
      } else if (!this.warned) {
        showToast(getApiErrorView(error).message, 'neutral');
        this.warned = true;
      }
      // Network failures and cooldowns retry the same sequence, so a committed reward is not repeated.
    } finally {
      this.busy = false;
      this.nextAt = performance.now() + 1000;
    }
  }
}
