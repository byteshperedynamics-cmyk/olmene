-- Marketwise — seed data (spec §6 note, §8.2, §9)
--
-- PLANS: Polar product IDs are placeholders until the owner creates the real
-- products in Polar and pastes the ids here (HANDOFF.md §1–2). Prices shown
-- are display labels only; the real price lives in Polar.
--
-- LLM_MODELS: free lineup verified 2026-09-24 per the build prompt. The
-- lineup rotates — run `npm run models:refresh` before deploying to re-verify
-- against GET https://openrouter.ai/api/v1/models.

insert into public.plans (polar_product_id, name, reports_per_period, price_label, sort_order, active) values
  ('REPLACE_POLAR_PRODUCT_ID_STARTER', 'Starter', 5,  '$19 / month', 10, true),
  ('REPLACE_POLAR_PRODUCT_ID_PRO',     'Pro',    20, '$29 / month', 20, true)
on conflict (polar_product_id) do nothing;

insert into public.llm_models (id, priority, supports_json_schema, active, note) values
  ('openai/gpt-oss-120b:free', 10, true,  true, 'Verified free 2026-09-24. Good JSON discipline.'),
  ('nex-agi/nex-n2-pro:free',  20, false, true, 'Verified free 2026-09-24.'),
  ('openrouter/free',          900, false, true, 'Free-models router — last resort, rotates automatically.')
on conflict (id) do nothing;
