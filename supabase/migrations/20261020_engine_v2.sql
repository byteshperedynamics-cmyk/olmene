-- Engine v2 (2026-10-13): more kinds of sites (guided fixes for every
-- platform, Webflow/WordPress connections), screenshots and proposed fixes
-- on free scans, AI visibility, alert channels, pull-request checks,
-- per-report cost cap.
-- Additive and idempotent like engine v1: new tables/columns with defaults
-- only; nothing the current app reads is renamed or dropped. Safe to run twice.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Free scans: screenshot with pins, proposed fixes (both filled later)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.scans add column if not exists shot jsonb;
alter table public.scans add column if not exists proposals jsonb;

-- Screenshots of public homepages, readable by anyone with the link (the
-- scan result points at them). Deleted with their scan (section 9).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scan-shots', 'scan-shots', true, 4194304, array['image/jpeg'])
on conflict (id) do nothing;
