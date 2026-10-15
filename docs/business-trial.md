# Free trials for teams and agencies

`/business/` sells Olmene to companies and agencies and takes requests for a
**14-day free trial of the Team plan**. The page promises a reply **within
one working day**, so each request needs a person.

## What happens when someone asks

1. They fill in the form at `/business/#trial`: name, work email, company,
   website, whether the sites are their own or their clients', and
   optionally team size and a note. Signed in or not.
2. `POST /api/trial-request/` checks it (`src/lib/trial/rules.ts`, same rules
   as the form), drops bots quietly (a hidden field, or sent within 3 seconds
   of the form appearing), and allows 3 requests an hour per network. The
   same address again within a day is not stored twice. It saves a row in
   `trial_requests` (only the server can read it) with `notify_to` =
   `SUPPORT_EMAIL` from `src/lib/config.ts`.
3. Within a minute the `notify` function emails that inbox: "Trial request:
   {company} (agency|company)" with every field, and **Reply-To set to the
   person who asked**, so pressing Reply answers them. It tries 3 times.

## What you do (within one working day)

1. Reply to the email. If they were signed in, the email says so and gives
   their user id. Otherwise ask them to sign up with the address they used.
2. Turn on Team for 14 days for their account. Olmene treats a subscription
   with status `trialing` or `active` as paid (`subscriptions` table, synced
   from Polar), so anything you set up in Polar works, for example:
   - a checkout link for Team with a 14-day free trial, if the product has
     one in Polar; or
   - a one-time discount code for Team's first period.
   Send the link or code in your reply. Don't promise "no card needed"
   unless the way you set it up really doesn't ask for one.
3. Optional: set the row's `status` in Supabase (Table editor →
   `trial_requests`) to `contacted`, `trial_started`, `declined` or `spam`.

When `SUPPORT_EMAIL` changes (support@olmene.com once email routing is on),
new requests follow it automatically; old rows keep the address they had.

## Where it shows up

- Header nav ("For teams"), footer ("For teams and agencies"), the pricing
  page and the homepage plans (a "Choosing for a company or an agency?" band).
- In the app: the Team page when the plan has no room for teammates, Billing
  (before someone subscribes) and the white-label switch on the Clients page.
- The privacy policy lists what the form collects (`lp.s1.trial`).

Copy is in all 15 dictionaries (`biz.*`, `trial.*`, `pricing.trial.*`). The
trial length and plan are `TRIAL_DAYS` / `TRIAL_PLAN` in
`src/lib/trial/rules.ts`; the copy reads the length from there, but "Team",
"5 people" and "4 full analyses a month" are written out, so change them with
the plan.

## Tests

```bash
bun test src/lib/trial            # form rules, bot check, limits, duplicates
npm run test:sql                  # supabase/tests/trial_requests.test.sql: rules, no browser access
deno test --allow-all --config supabase/functions/deno.json supabase/functions/notify
```
