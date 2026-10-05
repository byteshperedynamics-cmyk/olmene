-- GLM priority swap (2026-10-03 health check): glm-4.7-flash is now heavily
-- throttled on the z.ai free tier (15–36 s for trivial calls, measured twice
-- same-day), while glm-4.5-flash answers in ~1.2 s. Put the healthy model
-- first so the GLM fallback path actually fails over quickly. Gemini order
-- is unchanged. Idempotent: only reorders rows that exist.
update public.llm_models set priority = 4 where id = 'glm-4.5-flash';
update public.llm_models set priority = 5 where id = 'glm-4.7-flash';
