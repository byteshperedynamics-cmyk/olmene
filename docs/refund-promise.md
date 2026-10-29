# The first-fix promise (refunds)

Promised on /pricing/, in the homepage FAQ and in the terms (`lt.s3.refund`)
since 2026-10-29:

> If you subscribe to Fix or Agency and Olmene can't deliver a single fix for
> your site within 14 days of your first payment, contact support within 30
> days of that payment and we'll refund it in full.

A **fix** is any of:
- a pull request Olmene opened (merged or not);
- a change applied through the Webflow or WordPress connection;
- a step-by-step guided fix for a problem the scan found (hosted platforms).

Only the **first payment** of a subscription, **once per customer**. Single
reports (€29) are not covered; their refunds stay case by case (`lt.s3.p`).

## When someone asks

1. Find the customer: Supabase → `subscriptions` by their email or user id,
   and note the first payment date (Polar → Orders).
2. Check the 14 days after that date for any fix: the agent run history in
   `/app/agent/` for their workspace (pull requests and Webflow/WordPress
   changes), and guided fixes on their site. If their repository or platform
   was never connected, offer to help connect it first (the terms say so);
   if they'd rather not, refund.
3. If there was no fix, refund the first order in full in Polar (Orders →
   the order → Refund). Polar is the merchant of record, so the refund, VAT
   and the credit note are handled there. Reply with the date it was issued.
4. If there was a fix, reply with the link to it, and offer the normal
   cancellation (access runs to the end of the period).

Count refunds per month. A rising rate means the agent is failing on real
sites, which is worth knowing sooner than the money.
