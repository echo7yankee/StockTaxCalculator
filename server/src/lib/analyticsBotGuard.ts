// Behavioral guard against UA-rotating crawlers that fire the pageview beacon.
//
// The static BOT_UA filter in routes/track.ts catches honest crawler User-Agents
// (Googlebot, HeadlessChrome, ...), but a sweeper can rotate its UA from a single
// IP to look like a real mobile browser and slip straight through. Observed in
// production 2026-06-29: one Azure IP swept every route in ~5 min, alternating
// HeadlessChrome (dropped) with spoofed "moto g power" / iPhone UAs (stored),
// inflating that day's pageviews from ~2 real to 30.
//
// A human reads pages; a sweeper enumerates them. So we gate on behaviour, not
// identity: once a single IP logs more than MAX_IN_WINDOW pageviews inside a
// short rolling window it is parked in a cooldown, and every further pageview
// from it is dropped regardless of which UA it presents next. State is in-memory
// and best-effort, matching the beacon's own semantics (a process restart simply
// re-learns the offenders, which it does within the first few hits of a sweep).
//
// Funnel and other events are never gated here: they need real client JS, bots
// rarely fire them, and they are far too low-volume to be worth the false-positive
// risk. Only the pageview firehose is protected.
//
// NOTE: gating is per-IP, so a busy NAT/CGNAT exit shared by many simultaneous
// humans could in theory trip it. At current single-digit-per-day human volumes
// that is not reachable; revisit the threshold if real traffic grows enough that
// one IP legitimately serves >MAX_IN_WINDOW human pageviews per minute.

const WINDOW_MS = 60_000; // rolling window for the per-IP pageview count
const MAX_IN_WINDOW = 8; // more than this many pageviews/IP/window = a sweep
const COOLDOWN_MS = 15 * 60_000; // park a tripped IP this long (drop all its pageviews)
const MAX_TRACKED_IPS = 10_000; // hard cap so the maps cannot grow unbounded

// ip -> ascending list of recent pageview timestamps (within WINDOW_MS)
const recentHits = new Map<string, number[]>();
// ip -> timestamp until which the IP is parked
const cooldownUntil = new Map<string, number>();

// Drop entries that can no longer affect a decision: expired cooldowns and
// fully-aged hit lists. Called opportunistically; if the maps are still over the
// cap afterwards we clear the cheap-to-rebuild hit map outright rather than let
// memory grow without bound.
function prune(now: number): void {
  if (recentHits.size + cooldownUntil.size <= MAX_TRACKED_IPS) return;
  for (const [ip, until] of cooldownUntil) {
    if (now >= until) cooldownUntil.delete(ip);
  }
  for (const [ip, times] of recentHits) {
    if (times.length === 0 || now - times[times.length - 1] >= WINDOW_MS) {
      recentHits.delete(ip);
    }
  }
  if (recentHits.size + cooldownUntil.size > MAX_TRACKED_IPS) recentHits.clear();
}

// Returns true if this pageview from `ip` should be dropped as part of a sweep.
// Records the hit as a side effect, so call it exactly once per pageview beacon.
export function isPageviewSweep(ip: string, now: number): boolean {
  const parkedUntil = cooldownUntil.get(ip);
  if (parkedUntil !== undefined) {
    if (now < parkedUntil) return true;
    cooldownUntil.delete(ip);
  }

  const times = (recentHits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  times.push(now);

  if (times.length > MAX_IN_WINDOW) {
    cooldownUntil.set(ip, now + COOLDOWN_MS);
    recentHits.delete(ip); // parked now; the count is no longer needed
    prune(now);
    return true;
  }

  recentHits.set(ip, times);
  prune(now);
  return false;
}

// Test-only: clear all in-memory state so cases start from a clean slate.
export function resetPageviewSweepGuard(): void {
  recentHits.clear();
  cooldownUntil.clear();
}
