/** Shape of GET /api/public/stats/ (aggregates only). */
export interface PublicStats {
  freeScans: number;
  reports: number;
  sourcesCited: number;
  prsOpened: number;
  prsMerged: number;
  sitesMonitored: number;
  measuredOutcomes: number;
  /** null unless the owner enabled PUBLIC_METRICS_SHOW_MRR */
  mrr: { current: number; weeks: Array<{ week: string; mrr: number }> } | null;
  feed: Array<{ mergedAt: string; fixes: string[]; site: string | null }>;
  generatedAt: string;
}
