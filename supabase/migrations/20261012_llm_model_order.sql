-- LLM model order from the 2026-10-02 pipeline evaluation (4 sites; see
-- scripts/pipeline-eval/). The engine tries one model per attempt in priority
-- order and now fails over to the next model almost immediately.
--   1 gemini-3.6-flash      best competitor/strategy quality (needs reasoning
--                           headroom — engine change in the same release)
--   2 gemini-3.5-flash-lite fast, stayed available while 3.6 returned 503s
--   3 gemini-3.5-flash      further Gemini fallback
--   4-5 GLM free models     other provider (survives a Gemini outage); too
--                           slow for the large strategy step, fine as backup
-- Idempotent: only reorders rows that exist.
update public.llm_models set priority = 1 where id = 'google/gemini-3.6-flash';
update public.llm_models set priority = 2 where id = 'google/gemini-3.5-flash-lite';
update public.llm_models set priority = 3 where id = 'google/gemini-3.5-flash';
update public.llm_models set priority = 4 where id = 'glm-4.7-flash';
update public.llm_models set priority = 5 where id = 'glm-4.5-flash';
