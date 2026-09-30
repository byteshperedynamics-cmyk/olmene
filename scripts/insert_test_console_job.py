#!/usr/bin/env python3
"""Insert a frozen running test job so the AgentConsole can be E2E-verified."""
import json, sys, urllib.request

PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"

STEP_LOG = json.dumps([
    {"step": "crawl", "status": "done", "startedAt": "2026-09-25T16:40:00Z", "endedAt": "2026-09-25T16:40:12Z", "model": "nvidia/nemotron-3-super-120b-a12b:free"},
    {"step": "profile", "status": "done", "startedAt": "2026-09-25T16:40:12Z", "endedAt": "2026-09-25T16:40:31Z", "model": "nvidia/nemotron-3-super-120b-a12b:free"},
    {"step": "research", "status": "done", "startedAt": "2026-09-25T16:40:31Z", "endedAt": "2026-09-25T16:41:02Z", "model": "nex-agi/nex-n2.5-pro:free"},
    {"step": "competitors_pick", "status": "done", "startedAt": "2026-09-25T16:41:02Z", "endedAt": "2026-09-25T16:41:25Z", "model": "nvidia/nemotron-3-super-120b-a12b:free"},
    {"step": "competitors_extract", "status": "done", "startedAt": "2026-09-25T16:41:25Z", "endedAt": "2026-09-25T16:41:54Z"},
])

sql = f"""
INSERT INTO analysis_jobs (id, user_id, site_url, input, status, current_step, step_log, error, wait_reason, created_at, started_at, completed_at, attempts)
VALUES (
  '0e4a1c7d-9b3f-4d2e-8a11-5f6b7c8d9e0f',
  '471bef9b-a45e-4ced-bef5-b32e25f11309',
  'https://stripe.com',
  jsonb_build_object('goal','grow_revenue','language','English','productName','Stripe'),
  'running',
  'competitors_analyze',
  '{STEP_LOG}'::jsonb,
  NULL,
  'llm_daily',
  now() - interval '2 minutes',
  now() - interval '95 seconds',
  NULL,
  0
) RETURNING id, status, current_step;
"""

body = json.dumps({"query": sql}).encode()
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{REF}/database/query",
    data=body,
    headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        print(json.dumps(json.load(r))[:500])
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:800])
