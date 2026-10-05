-- Gemini on Vertex AI becomes the primary report model (2026-10-06).
--
-- Vertex calls are billed to the Google Cloud project's credits, so they are a
-- paid service: Google's Gemini API terms allow only paid services for users
-- in the EEA, Switzerland and the UK, and paid traffic is not used for
-- training. Evaluation on plausible.io + olmene.com through the full pipeline
-- (Vertex, 2026-10-06): 3.8 Flash gave the most specific findings at
-- ~$0.07/report; 3.6 Flash was the fastest at ~$0.06 and is the fallback when
-- 3.8 answers 429 "resource exhausted"; 3.7 Flash linked a competitor to the
-- wrong site and is not used.
--
-- Requires the edge-function secrets VERTEX_API_KEY (an authorization key
-- bound to a service account with Agent Platform User) and VERTEX_PROJECT.
-- Until they are set, the engine skips these rows and uses the next model.
-- Idempotent.
insert into public.llm_models (id, priority, supports_json_schema, active, note) values
  ('vertex/google/gemini-3.8-flash', 1, false, true, 'Vertex AI (Cloud credits). Primary: most specific findings in the 2026-10-06 evaluation.'),
  ('vertex/google/gemini-3.6-flash', 2, false, true, 'Vertex AI (Cloud credits). Fallback: fastest, cheapest per report.')
on conflict (id) do update
  set priority = excluded.priority,
      active = true,
      note = excluded.note;

-- Gemini API free tier: not allowed for users in the EEA/CH/UK, and free-tier
-- prompts may be used to improve Google's products.
update public.llm_models set active = false where id like 'google/%';

-- Z.ai GLM free models stay as the last resort (slow, but free and keyless
-- for Google outages or when the credits run out).
update public.llm_models set priority = 10 where id = 'glm-4.5-flash';
update public.llm_models set priority = 11 where id = 'glm-4.7-flash';
