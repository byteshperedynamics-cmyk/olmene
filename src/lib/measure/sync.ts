/**
 * Measure sync (brief §6.4): for each active Search Console connection, pull
 * final daily data (Search Console lags ~3 days), store it, and recompute the
 * measured outcome of every merged fix. Called from POST /api/cron/sync/.
 */
import { measureAll, type DailyPoint, type Outcome } from "./attribution";
import { queryDaily, refreshAccessToken, type Fetch } from "./google";

export interface GoogleConnection {
  id: string;
  user_id: string;
  secret_ciphertext: string | null;
  metadata: { property?: string } | null;
}

export interface MeasureDbPort {
  listGoogleConnections(): Promise<GoogleConnection[]>;
  lastFetchedDate(connectionId: string): Promise<string | null>;
  upsertDaily(rows: Array<{ connection_id: string; user_id: string; date: string; clicks: number; impressions: number; ctr: number; position: number }>): Promise<void>;
  getDaily(connectionId: string, since: string): Promise<DailyPoint[]>;
  mergedJobs(userId: string): Promise<Array<{ id: string; merged_at: string }>>;
  replaceOutcomes(connectionId: string, userId: string, outcomes: Outcome[]): Promise<void>;
  markConnection(id: string, patch: { status?: string; last_verified_at?: string }): Promise<void>;
}

export interface MeasureDeps {
  decrypt: (ciphertext: string) => Promise<string>;
  client: { id: string; secret: string };
  fetch?: Fetch;
  today?: () => string;
}

const DAY = 86_400_000;
const shift = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);

export async function syncMeasure(db: MeasureDbPort, deps: MeasureDeps) {
  const today = deps.today?.() ?? new Date().toISOString().slice(0, 10);
  const f = deps.fetch ?? fetch;
  const out = { connections: 0, daysStored: 0, outcomes: 0, errors: 0 };
  for (const conn of await db.listGoogleConnections()) {
    const property = conn.metadata?.property;
    if (!property || !conn.secret_ciphertext) continue;
    out.connections++;
    try {
      const refresh = await deps.decrypt(conn.secret_ciphertext);
      let access: string;
      try {
        access = await refreshAccessToken(deps.client, refresh, f);
      } catch {
        // revoked or expired grant: stop polling until the user reconnects
        await db.markConnection(conn.id, { status: "expired" });
        out.errors++;
        continue;
      }
      const last = await db.lastFetchedDate(conn.id);
      const end = shift(today, -3);
      const start = last ? shift(last, 1) : shift(today, -120);
      if (start <= end) {
        const days = await queryDaily(access, property, start, end, f);
        if (days.length) {
          await db.upsertDaily(days.map((d) => ({ connection_id: conn.id, user_id: conn.user_id, ...d })));
          out.daysStored += days.length;
        }
      }
      await db.markConnection(conn.id, { last_verified_at: new Date().toISOString() });
      const series = await db.getDaily(conn.id, shift(today, -150));
      const merges = (await db.mergedJobs(conn.user_id)).map((j) => ({ id: j.id, mergedAt: j.merged_at }));
      const outcomes = measureAll(series, merges, end);
      await db.replaceOutcomes(conn.id, conn.user_id, outcomes);
      out.outcomes += outcomes.length;
    } catch {
      out.errors++;
    }
  }
  return out;
}
