Deno.serve(async (req)=>{
  const env = getEnv();
  const cors = corsHeaders(env.APP_URL, env.ENV);
  if (req.method === "OPTIONS") return preflight(env.APP_URL, env.ENV);
  if (req.method !== "POST") {
    return json({
      error: {
        code: "method_not_allowed",
        message: "POST only"
      }
    }, 405, cors);
  }
  try {
    const userId = await userIdFromRequest(req);
    if (!userId) {
      return json({
        error: {
          code: "unauthorized",
          message: "Sign in first."
        }
      }, 401, cors);
    }
    const parsed = StartAnalysisInput.safeParse(await req.json().catch(()=>null));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return json({
        error: {
          code: "bad_request",
          message: first?.message ?? "Invalid input"
        }
      }, 400, cors);
    }
    const input = parsed.data;
    const url = normalizeSiteUrl(input.siteUrl);
    if (!url) {
      return json({
        error: {
          code: "bad_request",
          message: "Enter a valid website URL."
        }
      }, 400, cors);
    }
    const supabase = serviceClient();
    // Entitlement: active or trialing subscription (cancellation keeps
    // access until period end because Polar reports status until then).
    const { data: sub } = await supabase.from("subscriptions").select("status, polar_product_id, current_period_start, current_period_end").eq("user_id", userId).order("last_event_at", {
      ascending: false
    }).limit(5);
    const now = new Date();
    const activeSub = (sub ?? []).find((s)=>ENTITLED.has(s.status) && (!s.current_period_end || new Date(s.current_period_end) > now));
    if (!activeSub) {
      return json({
        error: {
          code: "not_subscribed",
          message: "You need an active subscription to run analyses."
        }
      }, 402, cors);
    }
    // Plan quota.
    const { data: plan } = await supabase.from("plans").select("name, reports_per_period").eq("polar_product_id", activeSub.polar_product_id).maybeSingle();
    const quota = plan?.reports_per_period ?? 0;
    const periodStart = activeSub.current_period_start ?? new Date(now.getTime() - 30 * 864e5).toISOString();
    const { count } = await supabase.from("analysis_jobs").select("id", {
      count: "exact",
      head: true
    }).eq("user_id", userId).gte("created_at", periodStart).not("status", "in", "(failed,canceled)");
    if ((count ?? 0) >= quota) {
      return json({
        error: {
          code: "quota_exceeded",
          message: `You have used all ${quota} reports in your current billing period. Your quota renews with your subscription.`
        }
      }, 429, cors);
    }
    // Abuse limit: 1 concurrent job.
    const { count: runningCount } = await supabase.from("analysis_jobs").select("id", {
      count: "exact",
      head: true
    }).eq("user_id", userId).in("status", [
      "queued",
      "running"
    ]);
    if ((runningCount ?? 0) >= 1) {
      return json({
        error: {
          code: "job_in_progress",
          message: "You already have an analysis in progress. Please wait for it to finish."
        }
      }, 429, cors);
    }
    // Abuse limit: 10 starts per hour.
    const hourAgo = new Date(now.getTime() - 3600_000).toISOString();
    const { count: hourCount } = await supabase.from("analysis_jobs").select("id", {
      count: "exact",
      head: true
    }).eq("user_id", userId).gte("created_at", hourAgo);
    if ((hourCount ?? 0) >= MAX_STARTS_PER_HOUR) {
      return json({
        error: {
          code: "rate_limited",
          message: "Too many analyses started this hour. Please try again later."
        }
      }, 429, cors);
    }
    const { data: job, error } = await supabase.from("analysis_jobs").insert({
      user_id: userId,
      site_url: url.toString(),
      input: toSafeInput(input),
      status: "queued",
      current_step: "crawl",
      step_outputs: {},
      step_log: []
    }).select("id").single();
    if (error || !job) {
      throw new Error(`job insert failed: ${error?.message ?? "unknown"}`);
    }
    return json({
      jobId: job.id
    }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
2.0{
  "name": "@supabase/auth-js",
  "version": "2.117.1",
  "private": false,
  "description": "Official SDK for Supabase Auth",
  "keywords": [
    "auth",
    "supabase",
    "auth",
    "authentication"
  ],
  "homepage": "https://github.com/supabase/supabase-js/tree/master/packages/core/auth-js",
  "bugs": "https://github.com/supabase/supabase-js/issues",
  "license": "MIT",
  "author": "Supabase",
  "files": [
    "dist",
    "src",
    "migrations",
    "AGENTS.md"
  ],
  "main": "dist/main/index.js",
  "module": "dist/module/index.js",
  "types": "dist/module/index.d.ts",
  "repository": {
    "type": "git",
    "url": "https://github.com/supabase/supabase-js.git",
    "directory": "packages/core/auth-js"
  },
  "dependencies": {
    "tslib": "2.8.1"
  },
  "devDependencies": {
    "@faker-js/faker": "^9.9.0",
    "@types/jest": "30.0.0",
    "@types/jsonwebtoken": "^8.5.8",
    "@types/node": "20.19.9",
    "jest": "30.4.2",
    "jest-environment-jsdom": "30.4.1",
    "jest-mock-server": "^0.1.0",
    "jsonwebtoken": "^9.0.0",
    "prettier": "^3.6.2",
    "ts-jest": "^29.4.9",
    "typedoc": "^0.27.9",
    "typescript": "~5.8.3"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "build": "npm run build:main && npm run build:module",
    "build:main": "tsc -p tsconfig.json",
    "build:module": "tsc -p tsconfig.module.json",
    "docs": "typedoc --options ../../../typedoc.base.mjs src/index.ts --out docs/v2 --excludePrivate --excludeProtected",
    "docs:json": "typedoc --options ../../../typedoc.base.mjs --json docs/v2/spec.json --excludeExternals --excludePrivate --excludeProtected src/index.ts"
  }
}# Agent instructions for `@supabase/auth-js`

Supabase Auth client SDK for JavaScript. Handles sign-in, sign-up, sessions, OAuth, MFA, and related auth flows.

When helping a user work with this package:

- **Usage and quick start**: [`README.md`](./README.md)
- **Full API reference**: [`src/`](./src/) — every public method and type has TSDoc with `@example` blocks. Read the source for the canonical, version-pinned answer.
- **Migration notes**: [`migrations/`](./migrations/) — per-theme markdown files for changes that need caller action.

For broader Supabase guidance (docs site, MCP tools, schema and project workflows), use the centralized [Supabase agent skills](https://github.com/supabase/agent-skills): `npx skills add supabase/agent-skills`. Or pair with the Supabase MCP server via the [Supabase Plugin for AI Coding Agents](https://supabase.com/docs/guides/getting-started/plugins).
# Lockless auth coordination

**Since:** v2.107.0
**Action required by:** v3.0.0

`@supabase/auth-js` now coordinates session refreshes without a shared mutex by default. The legacy `lock` option is still honored when supplied, but it is deprecated and will be removed in v3.

## What changed

- **Default coordination is lockless.** A client constructed without a `lock` option no longer acquires `navigator.locks` or any in-process lock. In-tab concurrent refreshes are deduplicated via the pre-existing single-flight (`refreshingDeferred`); cross-tab refresh races are resolved by GoTrue's server-side parent-of-active mechanism on the v1 refresh-token path.
- **Commit guard inside `_callRefreshToken`.** The client snapshots storage before the rotated-token fetch and re-reads after. If a non-null pre-fetch snapshot was cleared or replaced between the two reads (a concurrent `signOut` ran `_removeSession`, or another tab's refresh rotated first), the rotated tokens are discarded instead of being written back over storage. The discarded result resolves with `{ data: null, error: new AuthRefreshDiscardedError() }`.
- **New `AuthRefreshDiscardedError`** (with `isAuthRefreshDiscardedError` type guard). Surfaces through `refreshSession()` and `setSession()` results when the commit guard fires. `getSession()` surfaces it only when storage was cleared mid-flight; when another caller's rotation replaced storage, `getSession()` returns the session now in storage instead. Distinct from `AuthRetryableFetchError` (transient network) and `AuthApiError` (server rejection).
- **New `client.auth.dispose()`.** Tears down the auto-refresh interval, the `visibilitychange` listener, the `BroadcastChannel`, and registered `onAuthStateChange` subscribers. Idempotent. Designed for React Strict Mode and HMR cleanup hooks. In-flight `fetch` calls are not aborted — they run to completion.
- **`lock` and `lockAcquireTimeout` options.** Accepted and honored when supplied (legacy opt-in path); both are `@deprecated` and will be removed in v3.

## Who is affected

**Most callers: nothing to do.** If you do not pass a `lock` option to `createClient` / `GoTrueClient`, you are already on the lockless default path and will get the bug fixes and new APIs without any code change.

**Callers passing a custom `lock`** (typically React Native `processLock`, Node multi-process setups with shared AsyncStorage, or a custom lock implementation):

- v2.x (since v2.107.0): your custom `lock` is still invoked exactly as before. The legacy `_acquireLock` machinery is preserved on an opt-in path gated by `settings.lock != null`. No code change required. Since v2.112.4 the client logs a one-time deprecation warning when a `lock` is supplied.
- v3.0.0 (planned): the `lock` and `lockAcquireTimeout` options will be removed entirely. Drop them from your client options before upgrading to v3.

## New APIs worth knowing

### `client.auth.dispose()`

Tears down the client's background work in one call. Safe to call repeatedly.

```ts
useEffect(() => {
  const supabase = createClient(URL, KEY)
  return () => {
    supabase.auth.dispose()
  }
}, [])
```

### `AuthRefreshDiscardedError`

Returned from `refreshSession()` / `setSession()` when the commit guard discards a successfully-rotated session. `getSession()` returns it only when storage was cleared mid-flight (concurrent `signOut`); when another tab's refresh replaced storage, `getSession()` hands back that session instead.

```ts
import { isAuthRefreshDiscardedError } from '@supabase/auth-js'

const { data, error } = await supabase.auth.refreshSession()
if (isAuthRefreshDiscardedError(error)) {
  // A concurrent signOut cleared storage between fetch start and now.
  // The rotated tokens were discarded; the SIGNED_OUT event already fired.
  // Treat as a successful no-op — no need to retry.
}
```

## Behavior changes worth flagging

- **`_autoRefreshTokenTick` may run concurrently with `signOut` / `setSession` / `getUser`** on the lockless default path. Previously the tick used `_acquireLock(0, ...)` which skipped whenever any auth op held the lock. The lockless equivalent only skips when `refreshingDeferred` is set. The commit guard keeps storage consistent under the new concurrency. The legacy lock opt-in path retains the old skip-on-any-lock behavior.
- **`onAuthStateChange` async callbacks** that call `getUser`, `setSession`, or read the session from inside the callback are now safe on the default path (previously deadlocked through the lock). One residual hazard remains: calling `refreshSession` (or anything routing through `_callRefreshToken`) from inside a `TOKEN_REFRESHED` handler still deadlocks via `refreshingDeferred`. The `@deprecated` marker on the async overload is kept with its reason updated to point at this specific case.
- **Subscriber timing on the default path:** subscribers stay awaited; same as before. What changes is that `signOut` no longer waits for an in-flight refresh's HTTP and continuation to finish before its own fetch goes out. Both fetches now run concurrently, and the commit guard keeps storage consistent.

## Timing & concurrency notes for downstream consumers

Removing the default `_acquireLock(...)` wrapper changes the _microtask shape_ of `getSession`, `getUser`, `refreshSession`, `setSession`, `signOut`, `_initialize`, and `_reauthenticate`. Application behavior is unchanged — these methods still return the same values — but the await chain is shorter.

### What changed in the await chain

Previously, each of those methods looked like:

```ts
return await this._acquireLock(this.lockAcquireTimeout, async () => {
  return await this._getUser()
})
```

`_acquireLock` awaited `navigator.locks.request` (browser) or the in-process `processLock` (Node). That added a handful of microtasks before the inner operation ran. On the lockless default path, the wrapper is skipped and the inner operation runs directly:

```ts
if (this.lock) {
  return await this._acquireLock(this.lockAcquireTimeout, async () => {
    return await this._getUser()
  })
}
return await this._getUser()
```

### Downstream impact via `fetchWithAuth`

`supabase-js` wraps the user's `fetch` via `fetchWithAuth` (in `packages/core/supabase-js/src/SupabaseClient.ts`), which awaits `_getAccessToken()` before every PostgREST, Storage, and Functions request. With the shorter pre-fetch await chain, concurrent client calls — for example `Promise.all([supabase.rpc(...), supabase.rpc(...)])` or `Promise.all(rows.map((r) => supabase.from(...).insert(...)))` — may reach the network layer in a different micro-order than they did on v2.106 and earlier.

### What this can surface as

Tests that use order-sensitive mocks (nock, MSW, or any interceptor that matches requests in registration order) against parallel client calls may flip. A concrete example from the wild: a downstream worker repo registered two `nock(URL).post('/rest/v1/rpc/queue_job', body => expect(body).toMatchInlineSnapshot(...)).reply(200)` interceptors back-to-back, one expecting database `333`, the other expecting database `222`, and relied on the calls arriving in that order. The application code dispatched both via `Promise.all(replicas.map((r) => supabase.rpc('queue_job', ...)))`. On v2.107 the arrival order flipped, the first interceptor's body matcher ran against the wrong payload, vitest raised `toMatchInlineSnapshot with different snapshots cannot be called at the same location`, and the unmatched interceptor caused a "pending mocks left" failure at teardown.

The application behavior was correct in both versions: both RPCs completed, both rows ended up in the queue. Only the _test_ depended on an ordering that was never guaranteed.

### Recommended fix pattern

Make mocks order-independent. Two common shapes:

1. **Branch the body matcher on a discriminator field.** Register one interceptor with `.times(N)`; inside the body matcher, look at a field on the request body (e.g. an `id`) and assert against the expected payload for that id.

   ```ts
   const expected: Record<number, unknown> = {
     222: {
       /* expected body for replica 222 */
     },
     333: {
       /* expected body for replica 333 */
     },
   }

   nock(URL)
     .post('/path', (body) => {
       expect(body).toStrictEqual(expected[body.id])
       return true
     })
     .times(2)
     .reply(200)
   ```

2. **Capture and assert as a set.** Push each received body into an array from the matcher, return `true` to accept, then after the parallel block resolves assert the array's _contents_ (e.g. via `expect(received).toEqual(expect.arrayContaining([...]))`) without pinning order.

Do not pin behavior to lock-induced delays. They were incidental, not a guarantee — and they may shift again in future patch releases as internal awaits are refactored.

The custom-`lock` opt-in path retains the old await shape and is unaffected by this section.

## Migration steps

### If you do not pass a custom `lock` (most users)

No action required for v2. No action required for v3.

### If you pass a custom `lock` (e.g., React Native `processLock`)

No action required for v2 — your lock continues to work.

For v3 readiness:

1. Remove `lock` and `lockAcquireTimeout` from your `createClient` / `GoTrueClient` options before upgrading to v3.
2. If you depended on cross-process serialization (e.g., Node multi-process with shared AsyncStorage), validate that the lockless coordination (in-tab single-flight + server parent-of-active) is sufficient for your runtime. The default is safe for the cases the lock was originally added to handle (cross-tab refresh races), since the server resolves them.

```ts
// Before (v2.x, still works):
const supabase = createClient(URL, KEY, {
  auth: { lock: processLock, lockAcquireTimeout: 5000 },
})

// After (v3-ready):
const supabase = createClient(URL, KEY)
```

## Reference

- Server-side parent-of-active mechanism: `internal/tokens/service.go:376-385` in the [supabase/auth](https://github.com/supabase/auth) repo (v1 branch, the `*models.RefreshToken` type assertion). When a request arrives with a revoked refresh token whose child is the currently-active token, the server returns the active token instead of rejecting — both tabs receive the same rotated token under DB row locking.
- `lib/locks.ts` exports (`navigatorLock`, `processLock`, `LockAcquireTimeoutError`, `NavigatorLockAcquireTimeoutError`, `ProcessLockAcquireTimeoutError`, `internals`) remain available for direct imports, marked `@deprecated`. Direct callers who use these exports outside the `GoTrueClient` constructor option are unaffected.
# Migration notes for `@supabase/auth-js`

Each file in this directory describes one migration theme — what changed in `@supabase/auth-js`, who is affected, and what callers need to do.

Files are shipped with the npm package, so the migration notes you see here are pinned to the version of `@supabase/auth-js` you have installed. Upgrading the package brings the relevant migration notes along with it.

## How agents should use this directory

When helping a developer upgrade `@supabase/auth-js`:

1. Read the migration files in `node_modules/@supabase/auth-js/migrations/` for the version they have installed.
2. Cross-reference against the version they are upgrading to.
3. Apply the migration steps described in each relevant file.

## How humans should use this directory

Browse the files for the migration theme you care about. Each file is self-contained and explains its own scope, audience, and steps.

## File naming

One file per migration theme, named by topic rather than version (e.g. `<theme>.md`, kebab-case). A single version can ship multiple theme files; a single theme can span multiple versions. Each file documents its own `Since` / `Will require action by` version range internally.

## Cross-cutting migration notes

Migrations that span multiple Supabase packages (e.g. Node.js version drops, monorepo restructures) live in [`docs/MIGRATION.md`](../../../../docs/MIGRATION.md) at the repository root, not here. This directory is scoped to `@supabase/auth-js` only.
import GoTrueAdminApi from './GoTrueAdminApi'
import {
  AUTO_REFRESH_TICK_DURATION_MS,
  AUTO_REFRESH_TICK_THRESHOLD,
  DEFAULT_HEADERS,
  EXPIRY_MARGIN_MS,
  GOTRUE_URL,
  JWKS_TTL,
  PKCE_FLOW_ID_PARAM,
  REFRESH_FAILURE_COOLDOWN_MS,
  STORAGE_KEY,
} from './lib/constants'
import {
  AuthError,
  AuthImplicitGrantRedirectError,
  AuthInvalidCredentialsError,
  AuthInvalidJwtError,
  AuthInvalidTokenResponseError,
  AuthPKCECodeVerifierMissingError,
  AuthPKCEGrantCodeExchangeError,
  AuthRefreshDiscardedError,
  AuthSessionMissingError,
  AuthUnknownError,
  isAuthApiError,
  isAuthError,
  isAuthImplicitGrantRedirectError,
  isAuthRefreshDiscardedError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from './lib/errors'
import {
  Fetch,
  _request,
  _sessionResponse,
  _sessionResponsePassword,
  _ssoResponse,
  _userResponse,
} from './lib/fetch'
import {
  appendFlowIdToRedirectTo,
  assertRecoveryCodesExperimentalEnabled,
  decodeJWT,
  deepClone,
  Deferred,
  expiresAt,
  generateCallbackId,
  getAlgorithm,
  getCodeChallengeAndMethod,
  getItemAsync,
  insecureUserWarningProxy,
  isBrowser,
  parseParametersFromURL,
  pkceVerifierSlotKey,
  removeAllPKCEVerifiers,
  removeItemAsync,
  removePKCEVerifier,
  resolveFetch,
  retrievePKCEVerifier,
  retryable,
  setItemAsync,
  sleep,
  supportsLocalStorage,
  userNotAvailableProxy,
  validateExp,
  validatePKCEFlowId,
} from './lib/helpers'
import { memoryLocalStorageAdapter } from './lib/local-storage'
import { LockAcquireTimeoutError, navigatorLock } from './lib/locks'
import { polyfillGlobalThis } from './lib/polyfills'
import { version } from './lib/version'

import { bytesToBase64URL, stringToUint8Array } from './lib/base64url'
import type {
  AuthChangeEvent,
  AuthenticatorAssuranceLevels,
  AuthFlowType,
  AuthMFAChallengePhoneResponse,
  AuthMFAChallengeResponse,
  AuthMFAChallengeTOTPResponse,
  AuthMFAChallengeWebauthnResponse,
  AuthMFAChallengeWebauthnServerResponse,
  AuthMFAEnrollPhoneResponse,
  AuthMFAEnrollResponse,
  AuthMFAEnrollTOTPResponse,
  AuthMFAEnrollWebauthnResponse,
  AuthMFAGetAuthenticatorAssuranceLevelResponse,
  AuthMFAListFactorsResponse,
  AuthMFARecoveryCodesGenerateResponse,
  AuthMFARecoveryCodesStatusResponse,
  AuthMFAUnenrollResponse,
  AuthMFAVerifyResponse,
  AuthOtpResponse,
  AuthResponse,
  AuthResponsePassword,
  AuthTokenResponse,
  AuthTokenResponsePassword,
  CallRefreshTokenResult,
  EthereumWallet,
  EthereumWeb3Credentials,
  Factor,
  GoTrueClientOptions,
  GoTrueMFAApi,
  InitializeResult,
  JWK,
  JwtHeader,
  JwtPayload,
  LockFunc,
  MFAChallengeAndVerifyParams,
  MFAChallengeParams,
  MFAChallengePhoneParams,
  MFAChallengeTOTPParams,
  MFAChallengeWebauthnParams,
  MFAEnrollParams,
  MFAEnrollPhoneParams,
  MFAEnrollTOTPParams,
  MFAEnrollWebauthnParams,
  MFARecoveryCodesGenerateParams,
  MFARecoveryCodesVerifyParams,
  MFAUnenrollParams,
  MFAVerifyParams,
  MFAVerifyPhoneParams,
  MFAVerifyTOTPParams,
  MFAVerifyWebauthnParamFields,
  MFAVerifyWebauthnParams,
  OAuthResponse,
  AuthOAuthServerApi,
  AuthOAuthAuthorizationDetailsResponse,
  AuthOAuthConsentResponse,
  AuthOAuthGrantsResponse,
  AuthOAuthRevokeGrantResponse,
  Prettify,
  Provider,
  ResendParams,
  Session,
  SignInAnonymouslyCredentials,
  SignInWithIdTokenCredentials,
  SignInWithOAuthCredentials,
  SignInWithPasswordCredentials,
  SignInWithPasswordlessCredentials,
  SignInWithSSO,
  SignOut,
  SignUpWithPasswordCredentials,
  SolanaWallet,
  SolanaWeb3Credentials,
  SSOResponse,
  StrictOmit,
  Subscription,
  SupportedStorage,
  User,
  UserAttributes,
  UserIdentity,
  UserResponse,
  VerifyOtpParams,
  Web3Credentials,
  AuthPasskeyApi,
  ExperimentalFeatureFlags,
  SignInWithPasskeyCredentials,
  RegisterPasskeyCredentials,
  VerifyPasskeyRegistrationParams,
  StartPasskeyAuthenticationParams,
  VerifyPasskeyAuthenticationParams,
  PasskeyUpdateParams,
  PasskeyDeleteParams,
  AuthPasskeyRegistrationOptionsResponse,
  AuthPasskeyRegistrationVerifyResponse,
  AuthPasskeyAuthenticationOptionsResponse,
  AuthPasskeyAuthenticationVerifyResponse,
  AuthPasskeyListResponse,
  AuthPasskeyUpdateResponse,
  AuthPasskeyDeleteResponse,
} from './lib/types'
import {
  createSiweMessage,
  fromHex,
  getAddress,
  Hex,
  SiweMessage,
  toHex,
} from './lib/web3/ethereum'
import {
  createCredential,
  deserializeCredentialCreationOptions,
  deserializeCredentialRequestOptions,
  getCredential,
  serializeCredentialCreationResponse,
  serializeCredentialRequestResponse,
  browserSupportsWebAuthn,
  webAuthnAbortService,
  WebAuthnApi,
} from './lib/webauthn'
import {
  AuthenticationCredential,
  PublicKeyCredentialJSON,
  RegistrationCredential,
} from './lib/webauthn.dom'

polyfillGlobalThis() // Make "globalThis" available

const DEFAULT_OPTIONS: Omit<
  Required<GoTrueClientOptions>,
  'fetch' | 'storage' | 'userStorage' | 'lock'
> = {
  url: GOTRUE_URL,
  storageKey: STORAGE_KEY,
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: true,
  headers: DEFAULT_HEADERS,
  flowType: 'implicit',
  debug: false,
  hasCustomAuthorizationHeader: false,
  throwOnError: false,
  lockAcquireTimeout: 5000, // 5 seconds. Only used when a custom `lock` is supplied. TODO(v3): remove.
  skipAutoInitialize: false,
  experimental: {},
}

/**
 * No-op lock used internally as a placeholder. Kept so older test setups that
 * inject this exact reference do not break; new code never sees it because
 * `this.lock` stays `null` when no custom lock is supplied (lockless path).
 * TODO(v3): remove with the legacy lock path.
 */
async function lockNoOp<R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  return await fn()
}

/**
 * Caches JWKS values for all clients created in the same environment. This is
 * especially useful for shared-memory execution environments such as Vercel's
 * Fluid Compute, AWS Lambda or Supabase's Edge Functions. Regardless of how
 * many clients are created, if they share the same storage key they will use
 * the same JWKS cache, significantly speeding up getClaims() with asymmetric
 * JWTs.
 */
const GLOBAL_JWKS: { [storageKey: string]: { cachedAt: number; jwks: { keys: JWK[] } } } = {}

// Warn once per JS realm, not per client instance — server-side apps can
// construct many clients per process and must not be spammed.
let deprecatedLockWarned = false

export default class GoTrueClient {
  private static nextInstanceID: Record<string, number> = {}

  private instanceID: number

  /**
   * Namespace for the GoTrue admin methods.
   * These methods should only be used in a trusted server-side environment.
   */
  admin: GoTrueAdminApi
  /**
   * Namespace for the MFA methods.
   */
  mfa: GoTrueMFAApi
  /**
   * Namespace for the OAuth 2.1 authorization server methods.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   * Used to implement the authorization code flow on the consent page.
   */
  oauth: AuthOAuthServerApi
  /**
   * Namespace for passkey methods.
   * Includes lower-level two-step registration/authentication and passkey management.
   */
  passkey: AuthPasskeyApi
  /**
   * The storage key used to identify the values saved in localStorage
   */
  protected storageKey: string

  protected flowType: AuthFlowType

  /**
   * The JWKS used for verifying asymmetric JWTs
   */
  protected get jwks() {
    return GLOBAL_JWKS[this.storageKey]?.jwks ?? { keys: [] }
  }

  protected set jwks(value: { keys: JWK[] }) {
    GLOBAL_JWKS[this.storageKey] = { ...GLOBAL_JWKS[this.storageKey], jwks: value }
  }

  protected get jwks_cached_at() {
    return GLOBAL_JWKS[this.storageKey]?.cachedAt ?? Number.MIN_SAFE_INTEGER
  }

  protected set jwks_cached_at(value: number) {
    GLOBAL_JWKS[this.storageKey] = { ...GLOBAL_JWKS[this.storageKey], cachedAt: value }
  }

  protected autoRefreshToken: boolean
  protected persistSession: boolean
  protected storage: SupportedStorage
  /**
   * @experimental
   */
  protected userStorage: SupportedStorage | null = null
  protected memoryStorage: { [key: string]: string } | null = null
  protected stateChangeEmitters: Map<string | symbol, Subscription> = new Map()
  protected autoRefreshTicker: ReturnType<typeof setInterval> | null = null
  protected autoRefreshTickTimeout: ReturnType<typeof setTimeout> | null = null
  protected visibilityChangedCallback: (() => Promise<any>) | null = null
  protected refreshingDeferred: Deferred<CallRefreshTokenResult> | null = null
  /**
   * Cache of the most recent refresh failure, keyed by the refresh token
   * that failed. Serial callers passing the *same* token within
   * `REFRESH_FAILURE_COOLDOWN_MS` (including subsequent auto-refresh ticks)
   * receive this cached result instead of firing another `/token` request.
   * Callers passing a *different* token (token rotation pickup, explicit
   * `setSession`/`refreshSession({ refresh_token })`, multi-account switch)
   * bypass the cache and attempt a fresh refresh as they should.
   * Cleared on any successful refresh (locally or via BroadcastChannel from
   * another tab) and on `_removeSession`.
   *
   * Pairs with `refreshingDeferred`: concurrent callers share the in-flight
   * promise, serial callers within the cooldown share the failure result.
   */
  protected lastRefreshFailure: {
    refreshToken: string
    result: CallRefreshTokenResult
    expiresAt: number
  } | null = null
  /**
   * Monotonic counter incremented at the top of `_removeSession`, before any
   * `await`. The commit guard inside `_callRefreshToken` captures this value
   * before `_saveSession` and re-checks it after, so a `signOut` that
   * interleaves inside `_saveSession`'s storage-write awaits is still caught
   * (the post-fetch storage snapshot alone misses that window).
   */
  protected _sessionRemovalEpoch = 0
  /**
   * Keeps track of the async client initialization.
   * When null or not yet resolved the auth state is `unknown`
   * Once resolved the auth state is known and it's safe to call any further client methods.
   * Keep extra care to never reject or throw uncaught errors
   */
  protected initializePromise: Promise<InitializeResult> | null = null
  /**
   * Non-null only while `initialize()` is running. While open,
   * `_notifyAllSubscribers` enqueues init-chain notifications (those fired with
   * `broadcast = true`, i.e. from `_recoverAndRefresh`) into this array instead
   * of firing directly, so that `initializePromise` is guaranteed to be
   * resolved before any subscriber callback runs. Callbacks that call
   * `getSession()` / `getUser()` etc. would otherwise deadlock because those
   * methods await `initializePromise`. Notifications from the incoming
   * BroadcastChannel handler (`broadcast = false`) are not enqueued — they fire
   * immediately. Flushed (in order) by `initialize()` after `initializePromise`
   * settles.
   */
  private _pendingInitNotifications: Array<{
    event: AuthChangeEvent
    session: Session | null
    broadcast: boolean
  }> | null = null
  protected detectSessionInUrl:
    | boolean
    | ((url: URL, params: { [parameter: string]: string }) => boolean) = true
  protected url: string
  protected headers: {
    [key: string]: string
  }
  protected hasCustomAuthorizationHeader = false
  protected suppressGetSessionWarning = false
  protected fetch: Fetch
  /**
   * Custom lock function passed via `settings.lock`. When non-null, every auth
   * operation runs inside `_acquireLock`. When null (the default), the client
   * uses its lockless coordination (refresh single-flight + commit guard).
   * TODO(v3): remove along with the legacy lock path.
   */
  protected lock: LockFunc | null = null
  protected lockAcquired = false
  protected pendingInLock: Promise<any>[] = []
  protected throwOnError: boolean
  /**
   * Only consulted when a custom `lock` is supplied. TODO(v3): remove.
   */
  protected lockAcquireTimeout: number
  /**
   * Opt-in flags for experimental features. Defaults to an empty object.
   * See `GoTrueClientOptions.experimental`.
   */
  protected experimental: ExperimentalFeatureFlags

  /**
   * Used to broadcast state change events to other tabs listening.
   */
  protected broadcastChannel: BroadcastChannel | null = null

  protected logDebugMessages: boolean
  protected logger: (message: string, ...args: any[]) => void = console.log

  /**
   * Create a new client for use in the browser.
   *
   * @example Using supabase-js (recommended)
   * ```ts
   * import { createClient } from '@supabase/supabase-js'
   *
   * const supabase = createClient('https://xyzcompany.supabase.co', 'your-publishable-key')
   * const { data, error } = await supabase.auth.getUser()
   * ```
   *
   * @example Standalone import for bundle-sensitive environments
   * ```ts
   * import { GoTrueClient } from '@supabase/auth-js'
   *
   * const auth = new GoTrueClient({
   *   url: 'https://xyzcompany.supabase.co/auth/v1',
   *   headers: { apikey: 'your-publishable-key' },
   *   storageKey: 'supabase-auth',
   * })
   * ```
   */
  constructor(options: GoTrueClientOptions) {
    const settings = { ...DEFAULT_OPTIONS, ...options }
    this.storageKey = settings.storageKey

    this.instanceID = GoTrueClient.nextInstanceID[this.storageKey] ?? 0
    GoTrueClient.nextInstanceID[this.storageKey] = this.instanceID + 1

    this.logDebugMessages = !!settings.debug
    if (typeof settings.debug === 'function') {
      this.logger = settings.debug
    }

    if (this.instanceID > 0 && isBrowser()) {
      const message = `${this._logPrefix()} Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.`
      console.warn(message)
      if (this.logDebugMessages) {
        console.trace(message)
      }
    }

    this.persistSession = settings.persistSession
    this.autoRefreshToken = settings.autoRefreshToken
    this.experimental = settings.experimental ?? {}
    this.admin = new GoTrueAdminApi({
      url: settings.url,
      headers: settings.headers,
      fetch: settings.fetch,
      experimental: this.experimental,
    })

    this.url = settings.url
    this.headers = settings.headers
    this.fetch = resolveFetch(settings.fetch)
    this.detectSessionInUrl = settings.detectSessionInUrl
    this.flowType = settings.flowType
    this.hasCustomAuthorizationHeader = settings.hasCustomAuthorizationHeader
    this.throwOnError = settings.throwOnError

    // Always wire `lockAcquireTimeout` even on the lockless path: consumers
    // (including supabase-js tests) read it off the client to verify option
    // flow-through.
    this.lockAcquireTimeout = settings.lockAcquireTimeout

    // TODO(v3): remove. Legacy opt-in path preserved for backwards
    // compatibility with callers passing a custom `lock` (typically React
    // Native `processLock` or Node multi-process setups). When `settings.lock`
    // is null the client uses its lockless coordination — no `navigator.locks`
    // by default, no implicit `processLock`.
    if (settings.lock != null) {
      this.lock = settings.lock

      if (!deprecatedLockWarned) {
        deprecatedLockWarned = true
        console.warn(
          `${this._logPrefix()} The "lock" option is deprecated and will be removed in v3. The client now coordinates session refreshes without a lock, so most apps can drop the option. See https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/migrations/lockless-coordination.md`
        )
      }
    }

    if (!this.jwks) {
      this.jwks = { keys: [] }
      this.jwks_cached_at = Number.MIN_SAFE_INTEGER
    }

    this.mfa = {
      verify: this._verify.bind(this),
      enroll: this._enroll.bind(this),
      unenroll: this._unenroll.bind(this),
      challenge: this._challenge.bind(this),
      listFactors: this._listFactors.bind(this),
      challengeAndVerify: this._challengeAndVerify.bind(this),
      getAuthenticatorAssuranceLevel: this._getAuthenticatorAssuranceLevel.bind(this),
      webauthn: new WebAuthnApi(this),
      recoveryCodes: {
        getStatus: this._getRecoveryCodesStatus.bind(this),
        generate: this._generateRecoveryCodes.bind(this),
        verify: this._verifyRecoveryCode.bind(this),
        regenerate: this._regenerateRecoveryCodes.bind(this),
        unenroll: this._unenrollRecoveryCodes.bind(this),
      },
    }

    this.oauth = {
      getAuthorizationDetails: this._getAuthorizationDetails.bind(this),
      approveAuthorization: this._approveAuthorization.bind(this),
      denyAuthorization: this._denyAuthorization.bind(this),
      listGrants: this._listOAuthGrants.bind(this),
      revokeGrant: this._revokeOAuthGrant.bind(this),
    }

    this.passkey = {
      startRegistration: this._startPasskeyRegistration.bind(this),
      verifyRegistration: this._verifyPasskeyRegistration.bind(this),
      startAuthentication: this._startPasskeyAuthentication.bind(this),
      verifyAuthentication: this._verifyPasskeyAuthentication.bind(this),
      list: this._listPasskeys.bind(this),
      update: this._updatePasskey.bind(this),
      delete: this._deletePasskey.bind(this),
    }

    if (this.persistSession) {
      if (settings.storage) {
        this.storage = settings.storage
      } else {
        if (supportsLocalStorage()) {
          this.storage = globalThis.localStorage
        } else {
          this.memoryStorage = {}
          this.storage = memoryLocalStorageAdapter(this.memoryStorage)
        }
      }

      if (settings.userStorage) {
        this.userStorage = settings.userStorage
      }
    } else {
      this.memoryStorage = {}
      this.storage = memoryLocalStorageAdapter(this.memoryStorage)
    }

    if (isBrowser() && globalThis.BroadcastChannel && this.persistSession && this.storageKey) {
      try {
        this.broadcastChannel = new globalThis.BroadcastChannel(this.storageKey)
      } catch (e) {
        console.error(
          'Failed to create a new BroadcastChannel, multi-tab state changes will not be available',
          e
        )
      }

      this.broadcastChannel?.addEventListener('message', async (event) => {
        this._debug('received broadcast notification from other tab or client', event)

        // Another tab successfully refreshed or signed in — any cached
        // failure in this tab is stale and should not block the next
        // refresh attempt.
        if (event.data.event === 'TOKEN_REFRESHED' || event.data.event === 'SIGNED_IN') {
          this.lastRefreshFailure = null
        }

        try {
          await this._notifyAllSubscribers(event.data.event, event.data.session, false) // broadcast = false so we don't get an endless loop of messages
        } catch (error) {
          this._debug('#broadcastChannel', 'error', error)
        }
      })
    }

    // Only auto-initialize if not explicitly disabled. Skipped in SSR contexts
    // where initialization timing must be controlled. All public methods have
    // lazy initialization, so the client remains fully functional.
    if (!settings.skipAutoInitialize) {
      this.initialize().catch((error) => {
        this._debug('#initialize()', 'error', error)
      })
    }
  }

  /**
   * Returns whether error throwing mode is enabled for this client.
   */
  public isThrowOnErrorEnabled(): boolean {
    return this.throwOnError
  }

  /**
   * Centralizes return handling with optional error throwing. When `throwOnError` is enabled
   * and the provided result contains a non-nullish error, the error is thrown instead of
   * being returned. This ensures consistent behavior across all public API methods.
   */
  private _returnResult<T extends { error: any }>(result: T): T {
    if (this.throwOnError && result && result.error) {
      throw result.error
    }
    return result
  }

  private _logPrefix(): string {
    return (
      'GoTrueClient@' +
      `${this.storageKey}:${this.instanceID} (${version}) ${new Date().toISOString()}`
    )
  }

  private _debug(...args: any[]): GoTrueClient {
    if (this.logDebugMessages) {
      this.logger(this._logPrefix(), ...args)
    }

    return this
  }

  /**
   * Initialize the auth client by loading the session from storage or
   * detecting it from the URL after an OAuth, magic-link, or password-recovery
   * redirect.
   *
   * **Most callers do not need to invoke this directly.** The client calls it
   * automatically during construction, and to react to sign-in events (including
   * post-redirect events) you should subscribe to `onAuthStateChange` rather
   * than awaiting `initialize()`.
   *
   * You only need to call it manually when you have opted out of the automatic
   * call by passing `skipAutoInitialize: true` — for example, in an SSR context
   * where you need to control initialization timing. In that case, awaiting
   * `initialize()` returns the resolved session result (or any error encountered
   * while detecting it from the URL).
   *
   * @category Auth
   */
  async initialize(): Promise<InitializeResult> {
    if (this.initializePromise) {
      return await this.initializePromise
    }

    // Open the notification queue before _initialize() runs so that every
    // _notifyAllSubscribers call inside the init chain enqueues instead of
    // firing. Without this, a callback receiving SIGNED_IN (or TOKEN_REFRESHED
    // / SIGNED_OUT) during _recoverAndRefresh would deadlock if it called
    // getSession() / getUser() — those methods await initializePromise, which
    // can only resolve after the callback returns, which can only return after
    // getSession() resolves. The queue is flushed below after initializePromise
    // has settled, so callbacks run with a fully resolved initializePromise.
    this._pendingInitNotifications = []

    this.initializePromise = (async () => {
      if (this.lock != null) {
        // TODO(v3): remove legacy lock path
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._initialize()
        })
      }
      return await this._initialize()
    })()

    const result = await this.initializePromise

    // initializePromise is now resolved — flush queued notifications in order.
    // Callbacks can safely call getSession() / getUser() / signOut() etc.
    const queue = this._pendingInitNotifications ?? []
    this._pendingInitNotifications = null
    for (const n of queue) {
      await this._notifyAllSubscribers(n.event, n.session, n.broadcast)
    }

    return result
  }

  /**
   * IMPORTANT:
   * 1. Never throw in this method, as it is called from the constructor
   * 2. Never return a session from this method as it would be cached over
   *    the whole lifetime of the client
   */
  private async _initialize(): Promise<InitializeResult> {
    try {
      let params: { [parameter: string]: string } = {}
      let callbackUrlType = 'none'

      if (isBrowser()) {
        params = parseParametersFromURL(window.location.href)
        if (this._isImplicitGrantCallback(params)) {
          callbackUrlType = 'implicit'
        } else if (await this._isPKCECallback(params)) {
          callbackUrlType = 'pkce'
        }
      }

      /**
       * Attempt to get the session from the URL only if these conditions are fulfilled
       *
       * Note: If the URL isn't one of the callback url types (implicit or pkce),
       * then there could be an existing session so we don't want to prematurely remove it
       */
      if (isBrowser() && this.detectSessionInUrl && callbackUrlType !== 'none') {
        const { data, error } = await this._getSessionFromURL(params, callbackUrlType)
        if (error) {
          this._debug('#_initialize()', 'error detecting session from URL', error)

          if (isAuthImplicitGrantRedirectError(error)) {
            const errorCode = error.details?.code
            if (
              errorCode === 'identity_already_exists' ||
              errorCode === 'identity_not_found' ||
              errorCode === 'single_identity_not_deletable'
            ) {
              return { error }
            }
          }

          // Don't remove existing session on URL login failure.
          // A failed attempt (e.g. reused magic link) shouldn't invalidate a valid session.

          return { error }
        }

        const { session, redirectType } = data

        this._debug(
          '#_initialize()',
          'detected session in URL',
          session,
          'redirect type',
          redirectType
        )

        await this._saveSession(session)

        setTimeout(async () => {
          if (redirectType === 'recovery') {
            await this._notifyAllSubscribers('PASSWORD_RECOVERY', session)
          } else {
            await this._notifyAllSubscribers('SIGNED_IN', session)
          }
        }, 0)

        return { error: null }
      }
      // no login attempt via callback url try to recover session from storage
      await this._recoverAndRefresh()
      return { error: null }
    } catch (error) {
      if (isAuthError(error)) {
        return this._returnResult({ error })
      }

      return this._returnResult({
        error: new AuthUnknownError('Unexpected error during initialization', error),
      })
    } finally {
      await this._handleVisibilityChange()
      this._debug('#_initialize()', 'end')
    }
  }

  /**
   * Creates a new anonymous user.
   *
   * @returns A session where the is_anonymous claim in the access token JWT set to true
   *
   * @category Auth
   *
   * @remarks
   * - Returns an anonymous user
   * - It is recommended to set up captcha for anonymous sign-ins to prevent abuse. You can pass in the captcha token in the `options` param.
   *
   * @example Create an anonymous user
   * ```js
   * const { data, error } = await supabase.auth.signInAnonymously({
   *   options: {
   *     captchaToken
   *   }
   * });
   * ```
   *
   * @exampleResponse Create an anonymous user
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "",
   *       "phone": "",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {},
   *       "user_metadata": {},
   *       "identities": [],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *       "is_anonymous": true
   *     },
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "token_type": "bearer",
   *       "expires_in": 3600,
   *       "expires_at": 1700000000,
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "email": "",
   *         "phone": "",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "app_metadata": {},
   *         "user_metadata": {},
   *         "identities": [],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z",
   *         "is_anonymous": true
   *       }
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @example Create an anonymous user with custom user metadata
   * ```js
   * const { data, error } = await supabase.auth.signInAnonymously({
   *   options: {
   *     data
   *   }
   * })
   * ```
   */
  async signInAnonymously(credentials?: SignInAnonymouslyCredentials): Promise<AuthResponse> {
    try {
      const res = await _request(this.fetch, 'POST', `${this.url}/signup`, {
        headers: this.headers,
        body: {
          data: credentials?.options?.data ?? {},
          gotrue_meta_security: { captcha_token: credentials?.options?.captchaToken },
        },
        xform: _sessionResponse,
      })
      const { data, error } = res

      if (error || !data) {
        return this._returnResult({ data: { user: null, session: null }, error: error })
      }
      const session: Session | null = data.session
      const user: User | null = data.user

      if (data.session) {
        await this._saveSession(data.session)
        await this._notifyAllSubscribers('SIGNED_IN', session)
      }

      return this._returnResult({ data: { user, session }, error: null })
    } catch (error) {
      if (isAuthError(error)) {
        return this._returnResult({ data: { user: null, session: null }, error })
      }

      throw error
    }
  }

  /**
   * Creates a new user.
   *
   * Be aware that if a user account exists in the system you may get back an
   * error message that attempts to hide this information from the user.
   * This method has support for PKCE via email signups. The PKCE flow cannot be used when autoconfirm is enabled.
   *
   * @returns A logged-in session if the server has "autoconfirm" ON
   * @returns A user if the server has "autoconfirm" OFF
   *
   * @category Auth
   *
   * @remarks
   * - By default, the user needs to verify their email address before logging in. To turn this off, disable **Confirm email** in [your project](/dashboard/project/_/auth/providers).
   * - **Confirm email** determines if users need to confirm their email address after signing up.
   *   - If **Confirm email** is enabled, a `user` is returned but `session` is null.
   *   - If **Confirm email** is disabled, both a `user` and a `session` are returned.
   * - When the user confirms their email address, they are redirected to the [`SITE_URL`](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls) by default. You can modify your `SITE_URL` or add additional redirect URLs in [your project](/dashboard/project/_/auth/url-configuration).
   * - If signUp() is called for an existing confirmed user:
   *   - When both **Confirm email** and **Confirm phone** (even when phone provider is disabled) are enabled in [your project](/dashboard/project/_/auth/providers), an obfuscated/fake user object is returned.
   *   - When either **Confirm email** or **Confirm phone** (even when phone provider is disabled) is disabled, the error message, `User already registered` is returned.
   * - To fetch the currently logged-in user, refer to [`getUser()`](/docs/reference/javascript/auth-getuser).
   *
   * @example Sign up with an email and password
   * ```js
   * const { data, error } = await supabase.auth.signUp({
   *   email: 'example@email.com',
   *   password: 'example-password',
   * })
   * ```
   *
   * @exampleResponse Sign up with an email and password
   * ```json
   * // Some fields may be null if "confirm email" is enabled.
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {},
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z"
   *     },
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "token_type": "bearer",
   *       "expires_in": 3600,
   *       "expires_at": 1700000000,
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "email": "example@email.com",
   *         "email_confirmed_at": "2024-01-01T00:00:00Z",
   *         "phone": "",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "app_metadata": {
   *           "provider": "email",
   *           "providers": [
   *             "email"
   *           ]
   *         },
   *         "user_metadata": {},
   *         "identities": [
   *           {
   *             "identity_id": "22222222-2222-2222-2222-222222222222",
   *             "id": "11111111-1111-1111-1111-111111111111",
   *             "user_id": "11111111-1111-1111-1111-111111111111",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": false,
   *               "phone_verified": false,
   *               "sub": "11111111-1111-1111-1111-111111111111"
   *             },
   *             "provider": "email",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "example@email.com"
   *           }
   *         ],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z"
   *       }
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @example Sign up with a phone number and password (SMS)
   * ```js
   * const { data, error } = await supabase.auth.signUp({
   *   phone: '123456789',
   *   password: 'example-password',
   *   options: {
   *     channel: 'sms'
   *   }
   * })
   * ```
   *
   * @exampleDescription Sign up with a phone number and password (whatsapp)
   * The user will be sent a WhatsApp message which contains a OTP. By default, a given user can only request a OTP once every 60 seconds. Note that a user will need to have a valid WhatsApp account that is linked to Twilio in order to use this feature.
   *
   * @example Sign up with a phone number and password (whatsapp)
   * ```js
   * const { data, error } = await supabase.auth.signUp({
   *   phone: '123456789',
   *   password: 'example-password',
   *   options: {
   *     channel: 'whatsapp'
   *   }
   * })
   * ```
   *
   * @example Sign up with additional user metadata
   * ```js
   * const { data, error } = await supabase.auth.signUp(
   *   {
   *     email: 'example@email.com',
   *     password: 'example-password',
   *     options: {
   *       data: {
   *         first_name: 'John',
   *         age: 27,
   *       }
   *     }
   *   }
   * )
   * ```
   *
   * @exampleDescription Sign up with a redirect URL
   * - See [redirect URLs and wildcards](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls) to add additional redirect URLs to your project.
   *
   * @example Sign up with a redirect URL
   * ```js
   * const { data, error } = await supabase.auth.signUp(
   *   {
   *     email: 'example@email.com',
   *     password: 'example-password',
   *     options: {
   *       emailRedirectTo: 'https://example.com/welcome'
   *     }
   *   }
   * )
   * ```
   */
  async signUp(credentials: SignUpWithPasswordCredentials): Promise<AuthResponse> {
    let flowId: string | null = null
    try {
      let res: AuthResponse
      if ('email' in credentials) {
        const { email, password, options } = credentials
        let codeChallenge: string | null = null
        let codeChallengeMethod: string | null = null
        if (this.flowType === 'pkce') {
          ;[codeChallenge, codeChallengeMethod, flowId] = await this._getCodeChallengeAndMethod()
        }
        res = await _request(this.fetch, 'POST', `${this.url}/signup`, {
          headers: this.headers,
          redirectTo: this._maybeAppendFlowIdToRedirect(options?.emailRedirectTo, flowId),
          body: {
            email,
            password,
            data: options?.data ?? {},
            gotrue_meta_security: { captcha_token: options?.captchaToken },
            code_challenge: codeChallenge,
            code_challenge_method: codeChallengeMethod,
          },
          xform: _sessionResponse,
        })
      } else if ('phone' in credentials) {
        const { phone, password, options } = credentials
        res = await _request(this.fetch, 'POST', `${this.url}/signup`, {
          headers: this.headers,
          body: {
            phone,
            password,
            data: options?.data ?? {},
            channel: options?.channel ?? 'sms',
            gotrue_meta_security: { captcha_token: options?.captchaToken },
          },
          xform: _sessionResponse,
        })
      } else {
        throw new AuthInvalidCredentialsError(
          'You must provide either an email or phone number and a password'
        )
      }

      const { data, error } = res

      if (error || !data) {
        await removePKCEVerifier(this.storage, this.storageKey, flowId)
        return this._returnResult({ data: { user: null, session: null }, error: error })
      }

      const session: Session | null = data.session
      const user: User | null = data.user

      if (data.session) {
        await this._saveSession(data.session)
        await this._notifyAllSubscribers('SIGNED_IN', session)
      }

      return this._returnResult({ data: { user, session }, error: null })
    } catch (error) {
      await removePKCEVerifier(this.storage, this.storageKey, flowId)
      if (isAuthError(error)) {
        return this._returnResult({ data: { user: null, session: null }, error })
      }

      throw error
    }
  }

  /**
   * Log in an existing user with an email and password or phone and password.
   *
   * Be aware that you may get back an error message that will not distinguish
   * between the cases where the account does not exist or that the
   * email/phone and password combination is wrong or that the account can only
   * be accessed via social login.
   *
   * @category Auth
   *
   * @remarks
   * - Requires either an email and password or a phone number and password.
   *
   * @example Sign in with email and password
   * ```js
   * const { data, error } = await supabase.auth.signInWithPassword({
   *   email: 'example@email.com',
   *   password: 'example-password',
   * })
   * ```
   *
   * @exampleResponse Sign in with email and password
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {},
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z"
   *     },
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "token_type": "bearer",
   *       "expires_in": 3600,
   *       "expires_at": 1700000000,
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "email": "example@email.com",
   *         "email_confirmed_at": "2024-01-01T00:00:00Z",
   *         "phone": "",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "app_metadata": {
   *           "provider": "email",
   *           "providers": [
   *             "email"
   *           ]
   *         },
   *         "user_metadata": {},
   *         "identities": [
   *           {
   *             "identity_id": "22222222-2222-2222-2222-222222222222",
   *             "id": "11111111-1111-1111-1111-111111111111",
   *             "user_id": "11111111-1111-1111-1111-111111111111",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": false,
   *               "phone_verified": false,
   *               "sub": "11111111-1111-1111-1111-111111111111"
   *             },
   *             "provider": "email",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "example@email.com"
   *           }
   *         ],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z"
   *       }
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @example Sign in with phone and password
   * ```js
   * const { data, error } = await supabase.auth.signInWithPassword({
   *   phone: '+13334445555',
   *   password: 'some-password',
   * })
   * ```
   *
   * @exampleDescription Handling errors
   * Log the full `error` object so fields like `code`, `status`, and `name` aren't hidden. The `error.code` (e.g. `'invalid_credentials'`, `'email_not_confirmed'`) is often more useful for branching than `error.message`, and the full object surfaces both.
   *
   * @example Handling errors
   * ```js
   * const { data, error } = await supabase.auth.signInWithPassword({
   *   email: 'example@email.com',
   *   password: 'example-password',
   * })
   * if (error) {
   *   console.error(error)
   *   return
   * }
   * ```
   */
  async signInWithPassword(
    credentials: SignInWithPasswordCredentials
  ): Promise<AuthTokenResponsePassword> {
    try {
      let res: AuthResponsePassword
      if ('email' in credentials) {
        const { email, password, options } = credentials
        res = await _request(this.fetch, 'POST', `${this.url}/token?grant_type=password`, {
          headers: this.headers,
          body: {
            email,
            password,
            gotrue_meta_security: { captcha_token: options?.captchaToken },
          },
          xform: _sessionResponsePassword,
        })
      } else if ('phone' in credentials) {
        const { phone, password, options } = credentials
        res = await _request(this.fetch, 'POST', `${this.url}/token?grant_type=password`, {
          headers: this.headers,
          body: {
            phone,
            password,
            gotrue_meta_security: { captcha_token: options?.captchaToken },
          },
          xform: _sessionResponsePassword,
        })
      } else {
        throw new AuthInvalidCredentialsError(
          'You must provide either an email or phone number and a password'
        )
      }
      const { data, error } = res

      if (error) {
        return this._returnResult({ data: { user: null, session: null }, error })
      } else if (!data || !data.session || !data.user) {
        const invalidTokenError = new AuthInvalidTokenResponseError()
        return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError })
      }
      if (data.session) {
        await this._saveSession(data.session)
        await this._notifyAllSubscribers('SIGNED_IN', data.session)
      }
      return this._returnResult({
        data: {
          user: data.user,
          session: data.session,
          ...(data.weak_password ? { weakPassword: data.weak_password } : null),
        },
        error,
      })
    } catch (error) {
      if (isAuthError(error)) {
        return this._returnResult({ data: { user: null, session: null }, error })
      }
      throw error
    }
  }

  /**
   * Log in an existing user via a third-party provider.
   * This method supports the PKCE flow.
   *
   * @category Auth
   *
   * @remarks
   * - This method is used for signing in using [Social Login (OAuth) providers](/docs/guides/auth#configure-third-party-providers).
   * - It works by redirecting your application to the provider's authorization screen, before bringing back the user to your app.
   *
   * @example Sign in using a third-party provider
   * ```js
   * const { data, error } = await supabase.auth.signInWithOAuth({
   *   provider: 'github'
   * })
   * ```
   *
   * @exampleResponse Sign in using a third-party provider
   * ```json
   * {
   *   data: {
   *     provider: 'github',
   *     url: <PROVIDER_URL_TO_REDIRECT_TO>,
   *     flowId: <PKCE_FLOW_ID_OR_NULL>
   *   },
   *   error: null
   * }
   * ```
   *
   * @exampleDescription Sign in using a third-party provider with redirect
   * - When the OAuth provider successfully authenticates the user, they are redirected to the URL specified in the `redirectTo` parameter. This parameter defaults to the [`SITE_URL`](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls). It does not redirect the user immediately after invoking this method.
   * - See [redirect URLs and wildcards](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls) to add additional redirect URLs to your project.
   *
   * @example Sign in using a third-party provider with redirect
   * ```js
   * const { data, error } = await supabase.auth.signInWithOAuth({
   *   provider: 'github',
   *   options: {
   *     redirectTo: 'https://example.com/welcome'
   *   }
   * })
   * ```
   *
   * @exampleDescription Sign in with scopes and access provider tokens
   * If you need additional access from an OAuth provider, in order to access provider specific APIs in the name of the user, you can do this by passing in the scopes the user should authorize for your application. Note that the `scopes` option takes in **a space-separated list** of scopes.
   *
   * Because OAuth sign-in often includes redirects, you should register an `onAuthStateChange` callback immediately after you create the Supabase client. This callback will listen for the presence of `provider_token` and `provider_refresh_token` properties on the `session` object and store them in local storage. The client library will emit these values **only once** immediately after the user signs in. You can then access them by looking them up in local storage, or send them to your backend servers for further processing.
   *
   * Finally, make sure you remove them from local storage on the `SIGNED_OUT` event. If the OAuth provider supports token revocation, make sure you call those APIs either from the frontend or schedule them to be called on the backend.
   *
   * @example Sign in with scopes and access provider tokens
   * ```js
   * // Register this immediately after calling createClient!
   * // Because signInWithOAuth causes a redirect, you need to fetch the
   * // provider tokens from the callback.
   * supabase.auth.onAuthStateChange((event, session) => {
   *   if (session && session.provider_token) {
   *     window.localStorage.setItem('oauth_provider_token', session.provider_token)
   *   }
   *
   *   if (session && session.provider_refresh_token) {
   *     window.localStorage.setItem('oauth_provider_refresh_token', session.provider_refresh_token)
   *   }
   *
   *   if (event === 'SIGNED_OUT') {
   *     window.localStorage.removeItem('oauth_provider_token')
   *     window.localStorage.removeItem('oauth_provider_refresh_token')
   *   }
   * })
   *
   * // Call this on your Sign in with GitHub button to initiate OAuth
   * // with GitHub with the requested elevated scopes.
   * await supabase.auth.signInWithOAuth({
   *   provider: 'github',
   *   options: {
   *     scopes: 'repo gist notifications'
   *   }
   * })
   * ```
   */
  async signInWithOAuth(credentials: SignInWithOAuthCredentials): Promise<OAuthResponse> {
    return await this._handleProviderSignIn(credentials.provider, {
      redirectTo: credentials.options?.redirectTo,
      scopes: credentials.options?.scopes,
      queryParams: credentials.options?.queryParams,
      skipBrowserRedirect: credentials.options?.skipBrowserRedirect,
    })
  }

  /**
   * Log in an existing user by exchanging an Auth Code issued during the PKCE flow.
   *
   * @category Auth
   *
   * @remarks
   * - Used when `flowType` is set to `pkce` in client options.
   * - When several PKCE flows are in flight at once, pass `options.flowId` so
   *   the code is exchanged with the verifier created by that specific flow.
   *   The flow id is returned by `signInWithOAuth`, and with
   *   `experimental.appendPkceFlowIdToRedirects` enabled it also arrives on
   *   your callback URL as the reserved `sb_flow_id` query parameter (read
   *   automatically in a browser).
   * - When a flow id is present but its stored verifier is gone (evicted,
   *   already used, or from another device), the call fails with a verifier
   *   missing error instead of trying another flow's verifier — a mismatched
   *   verifier would consume the single-use code. Without any flow id the
   *   most recently stored verifier is used, as before.
   *
   * @example Exchange Auth Code
   * ```js
   * supabase.auth.exchangeCodeForSession('34e770dd-9ff9-416c-87fa-43b31d7ef225')
   * ```
   *
   * @example Exchange Auth Code for a specific flow (e.g. in a server-side callback handler)
   * ```js
   * const flowId = requestUrl.searchParams.get('sb_flow_id')
   * supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
   * ```
   *
   * @exampleResponse Exchange Auth Code
   * ```json
   * {
   *   "data": {
   *     session: {
   *       access_token: '<ACCESS_TOKEN>',
   *       token_type: 'bearer',
   *       expires_in: 3600,
   *       expires_at: 1700000000,
   *       refresh_token: '<REFRESH_TOKEN>',
   *       user: {
   *         id: '11111111-1111-1111-1111-111111111111',
   *         aud: 'authenticated',
   *         role: 'authenticated',
   *         email: 'example@email.com'
   *         email_confirmed_at: '2024-01-01T00:00:00Z',
   *         phone: '',
   *         confirmation_sent_at: '2024-01-01T00:00:00Z',
   *         confirmed_at: '2024-01-01T00:00:00Z',
   *         last_sign_in_at: '2024-01-01T00:00:00Z',
   *         app_metadata: {
   *           "provider": "email",
   *           "providers": [
   *             "email",
   *             "<OTHER_PROVIDER>"
   *           ]
   *         },
   *         user_metadata: {
   *           email: 'email@email.com',
   *           email_verified: true,
   *           full_name: 'User Name',
   *           iss: '<ISS>',
   *           name: 'User Name',
   *           phone_verified: false,
   *           provider_id: '<PROVIDER_ID>',
   *           sub: '<SUB>'
   *         },
   *         identities: [
   *           {
   *             "identity_id": "22222222-2222-2222-2222-222222222222",
   *             "id": "11111111-1111-1111-1111-111111111111",
   *             "user_id": "11111111-1111-1111-1111-111111111111",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": false,
   *               "phone_verified": false,
   *               "sub": "11111111-1111-1111-1111-111111111111"
   *             },
   *             "provider": "email",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "email@example.com"
   *           },
   *           {
   *             "identity_id": "33333333-3333-3333-3333-333333333333",
   *             "id": "<ID>",
   *             "user_id": "<USER_ID>",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": true,
   *               "full_name": "User Name",
   *               "iss": "<ISS>",
   *               "name": "User Name",
   *               "phone_verified": false,
   *               "provider_id": "<PROVIDER_ID>",
   *               "sub": "<SUB>"
   *             },
   *             "provider": "<PROVIDER>",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "example@email.com"
   *           }
   *         ],
   *         created_at: '2024-01-01T00:00:00Z',
   *         updated_at: '2024-01-01T00:00:00Z',
   *         is_anonymous: false
   *       },
   *       provider_token: '<PROVIDER_TOKEN>',
   *       provider_refresh_token: '<PROVIDER_REFRESH_TOKEN>'
   *     },
   *     user: {
   *       id: '11111111-1111-1111-1111-111111111111',
   *       aud: 'authenticated',
   *       role: 'authenticated',
   *       email: 'example@email.com',
   *       email_confirmed_at: '2024-01-01T00:00:00Z',
   *       phone: '',
   *       confirmation_sent_at: '2024-01-01T00:00:00Z',
   *       confirmed_at: '2024-01-01T00:00:00Z',
   *       last_sign_in_at: '2024-01-01T00:00:00Z',
   *       app_metadata: {
   *         provider: 'email',
   *         providers: [
   *           "email",
   *           "<OTHER_PROVIDER>"
   *         ]
   *       },
   *       user_metadata: {
   *         email: 'email@email.com',
   *         email_verified: true,
   *         full_name: 'User Name',
   *         iss: '<ISS>',
   *         name: 'User Name',
   *         phone_verified: false,
   *         provider_id: '<PROVIDER_ID>',
   *         sub: '<SUB>'
   *       },
   *       identities: [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "email@example.com"
   *         },
   *         {
   *           "identity_id": "33333333-3333-3333-3333-333333333333",
   *           "id": "<ID>",
   *           "user_id": "<USER_ID>",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": true,
   *             "full_name": "User Name",
   *             "iss": "<ISS>",
   *             "name": "User Name",
   *             "phone_verified": false,
   *             "provider_id": "<PROVIDER_ID>",
   *             "sub": "<SUB>"
   *           },
   *           "provider": "<PROVIDER>",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       created_at: '2024-01-01T00:00:00Z',
   *       updated_at: '2024-01-01T00:00:00Z',
   *       is_anonymous: false
   *     },
   *     redirectType: null
   *   },
   *   "error": null
   * }
   * ```
   */
  async exchangeCodeForSession(
    authCode: string,
    options?: { flowId?: string }
  ): Promise<AuthTokenResponse> {
    await this.initializePromise

    if (this.lock != null) {
      // TODO(v3): remove legacy lock path
      return this._acquireLock(this.lockAcquireTimeout, async () => {
        return this._exchangeCodeForSession(authCode, options)
      })
    }

    return this._exchangeCodeForSession(authCode, options)
  }

  /**
   * Signs in a user by verifying a message signed by the user's private key.
   * Supports Ethereum (via Sign-In-With-Ethereum) & Solana (Sign-In-With-Solana) standards,
   * both of which derive from the EIP-4361 standard
   * With slight variation on Solana's side.
   * @reference https://eips.ethereum.org/EIPS/eip-4361
   *
   * @category Auth
   *
   * @remarks
   * - Uses a Web3 (Ethereum, Solana) wallet to sign a user in.
   * - Read up on the [potential for abuse](/docs/guides/auth/auth-web3#potential-for-abuse) before using it.
   *
   * @example Sign in with Solana or Ethereum (Window API)
   * ```js
   *   // uses window.ethereum for the wallet
   *   const { data, error } = await supabase.auth.signInWithWeb3({
   *     chain: 'ethereum',
   *     statement: 'I accept the Terms of Service at https://example.com/tos'
   *   })
   *
   *   // uses window.solana for the wallet
   *   const { data, error } = await supabase.auth.signInWithWeb3({
   *     chain: 'solana',
   *     statement: 'I accept the Terms of Service at https://example.com/tos'
   *   })
   * ```
   *
   * @example Sign in with Ethereum (Message and Signature)
   * ```js
   *   const { data, error } = await supabase.auth.signInWithWeb3({
   *     chain: 'ethereum',
   *     message: '<sign in with ethereum message>',
   *     signature: '<hex of the ethereum signature over the message>',
   *   })
   * ```
   *
   * @example Sign in with Solana (Brave)
   * ```js
   *   const { data, error } = await supabase.auth.signInWithWeb3({
   *     chain: 'solana',
   *     statement: 'I accept the Terms of Service at https://example.com/tos',
   *     wallet: window.braveSolana
   *   })
   * ```
   *
   * @example Sign in with Solana (Wallet Adapter)
   * ```jsx
   *   function SignInButton() {
   *   const wallet = useWallet()
   *
   *   return (
   *     <>
   *       {wallet.connected ? (
   *         <button
   *           onClick={() => {
   *             supabase.auth.signInWithWeb3({
   *               chain: 'solana',
   *               statement: 'I accept the Terms of Service at https://example.com/tos',
   *               wallet,
   *             })
   *           }}
   *         >
   *           Sign in with Solana
   *         </button>
   *       ) : (
   *         <WalletMultiButton />
   *       )}
   *     </>
   *   )
   * }
   *
   * function App() {
   *   const endpoint = clusterApiUrl('devnet')
   *   const wallets = useMemo(() => [], [])
   *
   *   return (
   *     <ConnectionProvider endpoint={endpoint}>
   *       <WalletProvider wallets={wallets}>
   *         <WalletModalProvider>
   *           <SignInButton />
   *         </WalletModalProvider>
   *       </WalletProvider>
   *     </ConnectionProvider>
   *   )
   * }
   * ```
   */
  async signInWithWeb3(credentials: Web3Credentials): Promise<
    | {
        data: { session: Session; user: User }
        error: null
      }
    | { data: { session: null; user: null }; error: AuthError }
  > {
    const { chain } = credentials

    switch (chain) {
      case 'ethereum':
        return await this.signInWithEthereum(credentials)
      case 'solana':
        return await this.signInWithSolana(credentials)
      default:
        throw new Error(`@supabase/auth-js: Unsupported chain "${chain}"`)
    }
  }

  private async signInWithEthereum(
    credentials: EthereumWeb3Credentials
  ): Promise<
    | { data: { session: Session; user: User }; error: null }
    | { data: { session: null; user: null }; error: AuthError }
  > {
    // TODO: flatten type
    let message: string
    let signature: Hex

    if ('message' in credentials) {
      message = credentials.message
      signature = credentials.signature
    } else {
      const { chain, wallet, statement, options } = credentials

      let resolvedWallet: EthereumWallet

      if (!isBrowser()) {
        if (typeof wallet !== 'object' || !options?.url) {
          throw new Error(
            '@supabase/auth-js: Both wallet and url must be specified in non-browser environments.'
          )
        }

        resolvedWallet = wallet
      } else if (typeof wallet === 'object') {
        resolvedWallet = wallet
      } else {
        const windowAny = window as any

        if (
          'ethereum' in windowAny &&
          typeof windowAny.ethereum === 'object' &&
          'request' in windowAny.ethereum &&
          typeof windowAny.ethereum.request === 'function'
        ) {
          resolvedWallet = windowAny.ethereum
        } else {
          throw new Error(
            `@supabase/auth-js: No compatible Ethereum wallet interface on the window object (window.ethereum) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'ethereum', wallet: resolvedUserWallet }) instead.`
          )
        }
      }

      const url = new URL(options?.url ?? window.location.href)

      const accounts = await resolvedWallet
        .request({
          method: 'eth_requestAccounts',
        })
        .then((accs) => accs as string[])
        .catch(() => {
          throw new Error(
            `@supabase/auth-js: Wallet method eth_requestAccounts is missing or invalid`
          )
        })

      if (!accounts || accounts.length === 0) {
        throw new Error(
          `@supabase/auth-js: No accounts available. Please ensure the wallet is connected.`
        )
      }

      const address = getAddress(accounts[0])

      let chainId = options?.signInWithEthereum?.chainId
      if (!chainId) {
        const chainIdHex = await resolvedWallet.request({
          method: 'eth_chainId',
        })
        chainId = fromHex(chainIdHex as Hex)
      }

      const siweMessage: SiweMessage = {
        domain: url.host,
        address: address,
        statement: statement,
        uri: url.href,
        version: '1',
        chainId: chainId,
        nonce: options?.signInWithEthereum?.nonce,
        issuedAt: options?.signInWithEthereum?.issuedAt ?? new Date(),
        expirationTime: options?.signInWithEthereum?.expirationTime,
        notBefore: options?.signInWithEthereum?.notBefore,
        requestId: options?.signInWithEthereum?.requestId,
        resources: options?.signInWithEthereum?.resources,
      }

      message = createSiweMessage(siweMessage)

      // Sign message
      signature = (await resolvedWallet.request({
        method: 'personal_sign',
        params: [toHex(message), address],
      })) as Hex
    }

    try {
      const { data, error } = await _request(
        this.fetch,
        'POST',
        `${this.url}/token?grant_type=web3`,
        {
          headers: this.headers,
          body: {
            chain: 'ethereum',
            message,
            signature,
            ...(credentials.options?.captchaToken
              ? { gotrue_meta_security: { captcha_token: credentials.options?.captchaToken } }
              : null),
          },
          xform: _sessionResponse,
        }
      )
      if (error) {
        throw error
      }
      if (!data || !data.session || !data.user) {
        const invalidTokenError = new AuthInvalidTokenResponseError()
        return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError })
      }
      if (data.session) {
        await this._saveSession(data.session)
        await this._notifyAllSubscribers('SIGNED_IN', data.session)
      }
      return this._returnResult({ data: { ...data }, error })
    } catch (error) {
      if (isAuthError(error)) {
        return this._returnResult({ data: { user: null, session: null }, error })
      }

      throw error
    }
  }

  private async signInWithSolana(credentials: SolanaWeb3Credentials) {
    let message: string
    let signature: Uint8Array

    if ('message' in credentials) {
      message = credentials.message
      signature = credentials.signature
    } else {
      const { chain, wallet, statement, options } = credentials

      let resolvedWallet: SolanaWallet

      if (!isBrowser()) {
        if (typeof wallet !== 'object' || !options?.url) {
          throw new Error(
            '@supabase/auth-js: Both wallet and url must be specified in non-browser environments.'
          )
        }

        resolvedWallet = wallet
      } else if (typeof wallet === 'object') {
        resolvedWallet = wallet
      } else {
        const windowAny = window as any

        if (
          'solana' in windowAny &&
          typeof windowAny.solana === 'object' &&
          (('signIn' in windowAny.solana && typeof windowAny.solana.signIn === 'function') ||
            ('signMessage' in windowAny.solana &&
              typeof windowAny.solana.signMessage === 'function'))
        ) {
          resolvedWallet = windowAny.solana
        } else {
          throw new Error(
            `@supabase/auth-js: No compatible Solana wallet interface on the window object (window.solana) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'solana', wallet: resolvedUserWallet }) instead.`
          )
        }
      }

      const url = new URL(options?.url ?? window.location.href)

      if ('signIn' in resolvedWallet && resolvedWallet.signIn) {
        const output = await resolvedWallet.signIn({
          issuedAt: new Date().toISOString(),

          ...options?.signInWithSolana,

          // non-overridable properties
          version: '1',
          domain: url.host,
          uri: url.href,

          ...(statement ? { statement } : null),
        })

        let outputToProcess: any

        if (Array.isArray(output) && output[0] && typeof output[0] === 'object') {
          outputToProcess = output[0]
        } else if (
          output &&
          typeof output === 'object' &&
          'signedMessage' in output &&
          'signature' in output
        ) {
          outputToProcess = output
        } else {
          throw new Error('@supabase/auth-js: Wallet method signIn() returned unrecognized value')
        }

        if (
          'signedMessage' in outputToProcess &&
          'signature' in outputToProcess &&
          (typeof outputToProcess.signedMessage === 'string' ||
            outputToProcess.signedMessage instanceof Uint8Array) &&
          outputToProcess.signature instanceof Uint8Array
        ) {
          message =
            typeof outputToProcess.signedMessage === 'string'
              ? outputToProcess.signedMessage
              : new TextDecoder().decode(outputToProcess.signedMessage)
          signature = outputToProcess.signature
        } else {
          throw new Error(
            '@supabase/auth-js: Wallet method signIn() API returned object without signedMessage and signature fields'
          )
        }
      } else {
        if (
          !('signMessage' in resolvedWallet) ||
          typeof resolvedWallet.signMessage !== 'function' ||
          !('publicKey' in resolvedWallet) ||
          typeof resolvedWallet !== 'object' ||
          !resolvedWallet.publicKey ||
          !('toBase58' in resolvedWallet.publicKey) ||
          typeof resolvedWallet.publicKey.toBase58 !== 'function'
        ) {
          throw new Error(
            '@supabase/auth-js: Wallet does not have a compatible signMessage() and publicKey.toBase58() API'
          )
        }

        message = [
          `${url.host} wants you to sign in with your Solana account:`,
          resolvedWallet.publicKey.toBase58(),
          ...(statement ? ['', statement, ''] : ['']),
          'Version: 1',
          `URI: ${url.href}`,
          `Issued At: ${options?.signInWithSolana?.issuedAt ?? new Date().toISOString()}`,
          ...(options?.signInWithSolana?.notBefore
            ? [`Not Before: ${options.signInWithSolana.notBefore}`]
            : []),
          ...(options?.signInWithSolana?.expirationTime
            ? [`Expiration Time: ${options.signInWithSolana.expirationTime}`]
            : []),
          ...(options?.signInWithSolana?.chainId
            ? [`Chain ID: ${options.signInWithSolana.chainId}`]
            : []),
          ...(options?.signInWithSolana?.nonce ? [`Nonce: ${options.signInWithSolana.nonce}`] : []),
          ...(options?.signInWithSolana?.requestId
            ? [`Request ID: ${options.signInWithSolana.requestId}`]
            : []),
          ...(options?.signInWithSolana?.resources?.length
            ? [
                'Resources',
                ...options.signInWithSolana.resources.map((resource) => `- ${resource}`),
              ]
            : []),
        ].join('\n')

        const maybeSignature = await resolvedWallet.signMessage(
          new TextEncoder().encode(message),
          'utf8'
        )

        if (!maybeSignature || !(maybeSignature instanceof Uint8Array)) {
          throw new Error(
            '@supabase/auth-js: Wallet signMessage() API returned an recognized value'
          )
        }

        signature = maybeSignature
      }
    }

    try {
      const { data, error } = await _request(
        this.fetch,
        'POST',
        `${this.url}/token?grant_type=web3`,
        {
          headers: this.headers,
          body: {
            chain: 'solana',
            message,
            signature: bytesToBase64URL(signature),

            ...(credentials.options?.captchaToken
              ? { gotrue_meta_security: { captcha_token: credentials.options?.captchaToken } }
              : null),
          },
          xform: _sessionResponse,
        }
      )
      if (error) {
        throw error
      }
      if (!data || !data.session || !data.user) {
        const invalidTokenError = new AuthInvalidTokenResponseError()
        return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError })
      }
      if (data.session) {
        await this._saveSession(data.session)
        await this._notifyAllSubscribers('SIGNED_IN', data.session)
      }
      return this._returnResult({ data: { ...data }, error })
    } catch (error) {
      if (isAuthError(error)) {
        return this._returnResult({ data: { user: null, session: null }, error })
      }

      throw error
    }
  }

  private async _exchangeCodeForSession(
    authCode: string,
    options?: { flowId?: string }
  ): Promise<
    | {
        data: { session: Session; user: User; redirectType: string | null }
        error: null
      }
    | { data: { session: null; user: null; redirectType: null }; error: AuthError }
  > {
    const hasExplicitFlowId = options?.flowId != null
    const requestedFlowId = hasExplicitFlowId
      ? validatePKCEFlowId(options?.flowId)
      : isBrowser()
        ? validatePKCEFlowId(parseParametersFromURL(window.location.href)[PKCE_FLOW_ID_PARAM])
        : null

    if (hasExplicitFlowId && !requestedFlowId) {
      this._debug(
        '#_exchangeCodeForSession()',
        'provided flowId is not a valid flow id',
        options?.flowId
      )
    }

    // With a flow id (explicit or from the callback URL) the lookup is
    // slot-only and a miss fails fast — see retrievePKCEVerifier. An invalid
    // explicit flow id also fails fast rather than borrowing another flow's
    // verifier.
    const { verifier: storageItem, flowId } =
      hasExplicitFlowId && !requestedFlowId
        ? { verifier: null, flowId: null }
        : await retrievePKCEVerifier(this.storage, this.storageKey, requestedFlowId)
    const [codeVerifier, redirectType] = (storageItem ?? '').split('/')

    try {
      if (!codeVerifier && this.flowType === 'pkce') {
        throw new AuthPKCECodeVerifierMissingError()
      }

      const { data, error } = await _request(
        this.fetch,
        'POST',
        `${this.url}/token?grant_type=pkce`,
        {
          headers: this.headers,
          body: {
            auth_code: authCode,
            code_verifier: codeVerifier,
          },
          xform: _sessionResponse,
        }
      )
      await removePKCEVerifier(this.storage, this.storageKey, flowId)
      if (error) {
        throw error
      }
      if (!data || !data.session || !data.user) {
        const invalidTokenError = new AuthInvalidTokenResponseError()
        return this._returnResult({
          data: { user: null, session: null, redirectType: null },
          error: invalidTokenError,
        })
      }
      if (data.session) {
        await this._saveSession(data.session)
        await this._notifyAllSubscribers(
          redirectType === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN',
          data.session
        )
      }
      return this._returnResult({ data: { ...data, redirectType: redirectType ?? null }, error })
    } catch (error) {
      await removePKCEVerifier(this.storage, this.storageKey, flowId)
      if (isAuthError(error)) {
        return this._returnResult({
          data: { user: null, session: null, redirectType: null },
          error,
        })
      }
      throw error
    }
  }

  /**
   * Allows signing in with an OIDC ID token. The authentication provider used
   * should be enabled and configured.
   *
   * @category Auth
   *
   * @remarks
   * - Use an ID token to sign in.
   * - Especially useful when implementing sign in using native platform dialogs in mobile or desktop apps using Sign in with Apple or Sign in with Google on iOS and Android.
   * - You can also use Google's [One Tap](https://developers.google.com/identity/gsi/web/guides/display-google-one-tap) and [Automatic sign-in](https://developers.google.com/identity/gsi/web/guides/automatic-sign-in-sign-out) via this API.
   *
   * @example Sign In using ID Token
   * ```js
   * const { data, error } = await supabase.auth.signInWithIdToken({
   *   provider: 'google',
   *   token: 'your-id-token'
   * })
   * ```
   *
   * @exampleResponse Sign In using ID Token
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         ...
   *       },
   *       "user_metadata": {
   *         ...
   *       },
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "provider": "google",
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *     },
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "token_type": "bearer",
   *       "expires_in": 3600,
   *       "expires_at": 1700000000,
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "app_metadata": {
   *           ...
   *         },
   *         "user_metadata": {
   *           ...
   *         },
   *         "identities": [
   *           {
   *             "identity_id": "22222222-2222-2222-2222-222222222222",
   *             "provider": "google",
   *           }
   *         ],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z",
   *       }
   *     }
   *   },
   *   "error": null
   * }
   * ```
   */
  async signInWithIdToken(credentials: SignInWithIdTokenCredentials): Promise<AuthTokenResponse> {
    try {
      const { options, provider, token, access_token, nonce } = credentials

      const res = await _request(this.fetch, 'POST', `${this.url}/token?grant_type=id_token`, {
        headers: this.headers,
        body: {
          provider,
          id_token: token,
          access_token,
          nonce,
          gotrue_meta_security: { captcha_token: options?.captchaToken },
        },
        xform: _sessionResponse,
      })

      const { data, error } = res
      if (error) {
        return this._returnResult({ data: { user: null, session: null }, error })
      } else if (!data || !data.session || !data.user) {
        const invalidTokenError = new AuthInvalidTokenResponseError()
        return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError })
      }
      if (data.session) {
        await this._saveSession(data.session)
        await this._notifyAllSubscribers('SIGNED_IN', data.session)
      }
      return this._returnResult({ data, error })
    } catch (error) {
      if (isAuthError(error)) {
        return this._returnResult({ data: { user: null, session: null }, error })
      }
      throw error
    }
  }

  /**
   * Log in a user using magiclink or a one-time password (OTP).
   *
   * If the `{{ .ConfirmationURL }}` variable is specified in the email template, a magiclink will be sent.
   * If the `{{ .Token }}` variable is specified in the email template, an OTP will be sent.
   * If you're using phone sign-ins, only an OTP will be sent. You won't be able to send a magiclink for phone sign-ins.
   *
   * Be aware that you may get back an error message that will not distinguish
   * between the cases where the account does not exist or, that the account
   * can only be accessed via social login.
   *
   * Do note that you will need to configure a Whatsapp sender on Twilio
   * if you are using phone sign in with the 'whatsapp' channel. The whatsapp
   * channel is not supported on other providers
   * at this time.
   * This method supports PKCE when an email is passed.
   *
   * @category Auth
   *
   * @remarks
   * - Requires either an email or phone number.
   * - This method is used for passwordless sign-ins where a OTP is sent to the user's email or phone number.
   * - If the user doesn't exist, `signInWithOtp()` will signup the user instead. To restrict this behavior, you can set `shouldCreateUser` in `SignInWithPasswordlessCredentials.options` to `false`.
   * - If you're using an email, you can configure whether you want the user to receive a magiclink or a OTP.
   * - If you're using phone, you can configure whether you want the user to receive a OTP.
   * - The magic link's destination URL is determined by the [`SITE_URL`](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls).
   * - See [redirect URLs and wildcards](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls) to add additional redirect URLs to your project.
   * - Magic links and OTPs share the same implementation. To send users a one-time code instead of a magic link, [modify the magic link email template](/dashboard/project/_/auth/templates) to include `{{ .Token }}` instead of `{{ .ConfirmationURL }}`.
   * - See our [Twilio Phone Auth Guide](/docs/guides/auth/phone-login?showSMSProvider=Twilio) for details about configuring WhatsApp sign in.
   *
   * @exampleDescription Sign in with email
   * The user will be sent an email which contains either a magiclink or a OTP or both. By default, a given user can only request a OTP once every 60 seconds.
   *
   * @example Sign in with email
   * ```js
   * const { data, error } = await supabase.auth.signInWithOtp({
   *   email: 'example@email.com',
   *   options: {
   *     emailRedirectTo: 'https://example.com/welcome'
   *   }
   * })
   * ```
   *
   * @exampleResponse Sign in with email
   * ```json
   * {
   *   "data": {
   *     "user": null,
   *     "session": null
   *   },
   *   "error": null
   * }
   * ```
   *
   * @exampleDescription Sign in with SMS OTP
   * The user will be sent a SMS which contains a OTP. By default, a given user can only request a OTP once every 60 seconds.
   *
   * @example Sign in with SMS OTP
   * ```js
   * const { data, error } = await supabase.auth.signInWithOtp({
   *   phone: '+13334445555',
   * })
   * ```
   *
   * @exampleDescription Sign in with WhatsApp OTP
   * The user will be sent a WhatsApp message which contains a OTP. By default, a given user can only request a OTP once every 60 seconds. Note that a user will need to have a valid WhatsApp account that is linked to Twilio in order to use this feature.
   *
   * @example Sign in with WhatsApp OTP
   * ```js
   * const { data, error } = await supabase.auth.signInWithOtp({
   *   phone: '+13334445555',
   *   options: {
   *     channel:'whatsapp',
   *   }
   * })
   * ```
   */
  async signInWithOtp(credentials: SignInWithPasswordlessCredentials): Promise<AuthOtpResponse> {
    let flowId: string | null = null
    try {
      if ('email' in credentials) {
        const { email, options } = credentials
        let codeChallenge: string | null = null
        let codeChallengeMethod: string | null = null
        if (this.flowType === 'pkce') {
          ;[codeChallenge, codeChallengeMethod, flowId] = await this._getCodeChallengeAndMethod()
        }
        const { error } = await _request(this.fetch, 'POST', `${this.url}/otp`, {
          headers: this.headers,
          body: {
            email,
            data: options?.data ?? {},
            create_user: options?.shouldCreateUser ?? true,
            gotrue_meta_security: { captcha_token: options?.captchaToken },
            code_challenge: codeChallenge,
            code_challenge_method: codeChallengeMethod,
          },
          redirectTo: this._maybeAppendFlowIdToRedirect(options?.emailRedirectTo, flowId),
        })
        return this._returnResult({ data: { user: null, session: null }, error })
      }
      if ('phone' in credentials) {
        const { phone, options } = credentials
        const { data, error } = await _request(this.fetch, 'POST', `${this.url}/otp`, {
          headers: this.headers,
          body: {
            phone,
            data: options?.data ?? {},
            create_user: options?.shouldCreateUser ?? true,
            gotrue_meta_security: { captcha_token: options?.captchaToken },
            channel: options?.channel ?? 'sms',
          },
        })
        return this._returnResult({
          data: { user: null, session: null, messageId: data?.message_id },
          error,
        })
      }
      throw new AuthInvalidCredentialsError('You must provide either an email or phone number.')
    } catch (error) {
      await removePKCEVerifier(this.storage, this.storageKey, flowId)
      if (isAuthError(error)) {
        return this._returnResult({ data: { user: null, session: null }, error })
      }

      throw error
    }
  }

  /**
   * Log in a user given a User supplied OTP or TokenHash received through mobile or email.
   *
   * @category Auth
   *
   * @remarks
   * - The `verifyOtp` method takes in different verification types.
   * - If a phone number is used, the type can either be:
   *   1. `sms` – Used when verifying a one-time password (OTP) sent via SMS during sign-up or sign-in.
   *   2. `phone_change` – Used when verifying an OTP sent to a new phone number during a phone number update process.
   * - If an email address is used, the type can be one of the following (note: `signup` and `magiclink` types are deprecated):
   *   1. `email` – Used when verifying an OTP sent to the user's email during sign-up or sign-in.
   *   2. `recovery` – Used when verifying an OTP sent for account recovery, typically after a password reset request.
   *   3. `invite` – Used when verifying an OTP sent as part of an invitation to join a project or organization.
   *   4. `email_change` – Used when verifying an OTP sent to a new email address during an email update process.
   * - The verification type used should be determined based on the corresponding auth method called before `verifyOtp` to sign up / sign-in a user.
   * - The `TokenHash` is contained in the [email templates](/docs/guides/auth/auth-email-templates) and can be used to sign in.  You may wish to use the hash for the PKCE flow for Server Side Auth. Read [the Password-based Auth guide](/docs/guides/auth/passwords) for more details.
   *
   * @example Verify Signup One-Time Password (OTP)
   * ```js
   * const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email'})
   * ```
   *
   * @exampleResponse Verify Signup One-Time Password (OTP)
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "confirmed_at": "2024-01-01T00:00:00Z",
   *       "recovery_sent_at": "2024-01-01T00:00:00Z",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {
   *         "email": "example@email.com",
   *         "email_verified": false,
   *         "phone_verified": false,
   *         "sub": "11111111-1111-1111-1111-111111111111"
   *       },
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *       "is_anonymous": false
   *     },
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "token_type": "bearer",
   *       "expires_in": 3600,
   *       "expires_at": 1700000000,
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "email": "example@email.com",
   *         "email_confirmed_at": "2024-01-01T00:00:00Z",
   *         "phone": "",
   *         "confirmed_at": "2024-01-01T00:00:00Z",
   *         "recovery_sent_at": "2024-01-01T00:00:00Z",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "app_metadata": {
   *           "provider": "email",
   *           "providers": [
   *             "email"
   *           ]
   *         },
   *         "user_metadata": {
   *           "email": "example@email.com",
   *           "email_verified": false,
   *           "phone_verified": false,
   *           "sub": "11111111-1111-1111-1111-111111111111"
   *         },
   *         "identities": [
   *           {
   *             "identity_id": "22222222-2222-2222-2222-222222222222",
   *             "id": "11111111-1111-1111-1111-111111111111",
   *             "user_id": "11111111-1111-1111-1111-111111111111",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": false,
   *               "phone_verified": false,
   *               "sub": "11111111-1111-1111-1111-111111111111"
   *             },
   *             "provider": "email",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "example@email.com"
   *           }
   *         ],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z",
   *         "is_anonymous": false
   *       }
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @example Verify SMS One-Time Password (OTP)
   * ```js
   * const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms'})
   * ```
   *
   * @example Verify Email Auth (Token Hash)
   * ```js
   * const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email'})
   * ```
   */
  async verifyOtp(params: VerifyOtpParams): Promise<AuthResponse> {
    try {
      let redirectTo: string | undefined = undefined
      let captchaToken: string | undefined = undefined
      if ('options' in params) {
        redirectTo = params.options?.redirectTo
        captchaToken = params.options?.captchaToken
      }
      const { data, error } = await _request(this.fetch, 'POST', `${this.url}/verify`, {
        headers: this.headers,
        body: {
          ...params,
          gotrue_meta_security: { captcha_token: captchaToken },
        },
        redirectTo,
        xform: _sessionResponse,
      })

      if (error) {
        throw error
      }
      if (!data) {
        const tokenVerificationError = new Error('An error occurred on token verification.')
        throw tokenVerificationError
      }

      const session: Session | null = data.session
      const user: User | null = data.user

      if (session?.access_token) {
        await this._saveSession(session as Session)
        await this._notifyAllSubscribers(
          params.type == 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN',
          session
        )
      }

      return this._returnResult({ data: { user, session }, error: null })
    } catch (error) {
      if (isAuthError(error)) {
        return this._returnResult({ data: { user: null, session: null }, error })
      }

      throw error
    }
  }

  /**
   * Attempts a single-sign on using an enterprise Identity Provider. A
   * successful SSO attempt will redirect the current page to the identity
   * provider authorization page. The redirect URL is implementation and SSO
   * protocol specific.
   *
   * You can use it by providing a SSO domain. Typically you can extract this
   * domain by asking users for their email address. If this domain is
   * registered on the Auth instance the redirect will use that organization's
   * currently active SSO Identity Provider for the login.
   *
   * If you have built an organization-specific login page, you can use the
   * organization's SSO Identity Provider UUID directly instead.
   *
   * @category Auth
   *
   * @remarks
   * - Before you can call this method you need to [establish a connection](/docs/guides/auth/sso/auth-sso-saml#managing-saml-20-connections) to an identity provider. Use the [CLI commands](/docs/reference/cli/supabase-sso) to do this.
   * - If you've associated an email domain to the identity provider, you can use the `domain` property to start a sign-in flow.
   * - In case you need to use a different way to start the authentication flow with an identity provider, you can use the `providerId` property. For example:
   *     - Mapping specific user email addresses with an identity provider.
   *     - Using different hints to identity the identity provider to be used by the user, like a company-specific page, IP address or other tracking information.
   *
   * @example Sign in with email domain
   * ```js
   *   // You can extract the user's email domain and use it to trigger the
   *   // authentication flow with the correct identity provider.
   *
   *   const { data, error } = await supabase.auth.signInWithSSO({
   *     domain: 'company.com'
   *   })
   *
   *   if (data?.url) {
   *     // redirect the user to the identity provider's authentication flow
   *     window.location.href = data.url
   *   }
   * ```
   *
   * @example Sign in with provider UUID
   * ```js
   *   // Useful when you need to map a user's sign in request according
   *   // to different rules that can't use email domains.
   *
   *   const { data, error } = await supabase.auth.signInWithSSO({
   *     providerId: '21648a9d-8d5a-4555-a9d1-d6375dc14e92'
   *   })
   *
   *   if (data?.url) {
   *     // redirect the user to the identity provider's authentication flow
   *     window.location.href = data.url
   *   }
   * ```
   */
  async signInWithSSO(params: SignInWithSSO): Promise<SSOResponse> {
    let flowId: string | null = null
    try {
      let codeChallenge: string | null = null
      let codeChallengeMethod: string | null = null
      if (this.flowType === 'pkce') {
        ;[codeChallenge, codeChallengeMethod, flowId] = await this._getCodeChallengeAndMethod()
      }

      const result = await _request(this.fetch, 'POST', `${this.url}/sso`, {
        body: {
          ...('providerId' in params ? { provider_id: params.providerId } : null),
          ...('domain' in params ? { domain: params.domain } : null),
          redirect_to: this._maybeAppendFlowIdToRedirect(params.options?.redirectTo, flowId),
          ...(params?.options?.captchaToken
            ? { gotrue_meta_security: { captcha_token: params.options.captchaToken } }
            : null),
          skip_http_redirect: true, // fetch does not handle redirects
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
        },
        headers: this.headers,
        xform: _ssoResponse,
      })

      // Automatically redirect in browser unless skipBrowserRedirect is true
      if (result.data?.url && isBrowser() && !params.options?.skipBrowserRedirect) {
        window.location.assign(result.data.url)
      }

      return this._returnResult(result)
    } catch (error) {
      await removePKCEVerifier(this.storage, this.storageKey, flowId)
      if (isAuthError(error)) {
        return this._returnResult({ data: null, error })
      }
      throw error
    }
  }

  /**
   * Sends a reauthentication OTP to the user's email or phone number.
   * Requires the user to be signed-in.
   *
   * @category Auth
   *
   * @remarks
   * - This method is used together with `updateUser()` when a user's password needs to be updated.
   * - If you require your user to reauthenticate before updating their password, you need to enable the **Secure password change** option in your [project's email provider settings](/dashboard/project/_/auth/providers).
   * - A user is only require to reauthenticate before updating their password if **Secure password change** is enabled and the user **hasn't recently signed in**. A user is deemed recently signed in if the session was created in the last 24 hours.
   * - This method will send a nonce to the user's email. If the user doesn't have a confirmed email address, the method will send the nonce to the user's confirmed phone number instead.
   * - After receiving the OTP, include it as the `nonce` in your `updateUser()` call to finalize the password change.
   *
   * @exampleDescription Send reauthentication nonce
   * Sends a reauthentication nonce to the user's email or phone number.
   *
   * @example Send reauthentication nonce
   * ```js
   * const { error } = await supabase.auth.reauthenticate()
   * ```
   */
  async reauthenticate(): Promise<AuthResponse> {
    await this.initializePromise

    if (this.lock != null) {
      // TODO(v3): remove legacy lock path
      return await this._acquireLock(this.lockAcquireTimeout, async () => {
        return await this._reauthenticate()
      })
    }

    return await this._reauthenticate()
  }

  private async _reauthenticate(): Promise<AuthResponse> {
    try {
      return await this._useSession(async (result) => {
        const {
          data: { session },
          error: sessionError,
        } = result
        if (sessionError) throw sessionError
        if (!session) throw new AuthSessionMissingError()

        const { error } = await _request(this.fetch, 'GET', `${this.url}/reauthenticate`, {
          headers: this.headers,
          jwt: session.access_token,
        })
        return this._returnResult({ data: { user: null, session: null }, error })
      })
    } catch (error) {
      if (isAuthError(error)) {
        return this._returnResult({ data: { user: null, session: null }, error })
      }
      throw error
    }
  }

  /**
   * Resends an existing signup confirmation email, email change email, SMS OTP or phone change OTP.
   *
   * @category Auth
   *
   * @remarks
   * - Resends a signup confirmation, email change or phone change email to the user.
   * - Passwordless sign-ins can be resent by calling the `signInWithOtp()` method again.
   * - Password recovery emails can be resent by calling the `resetPasswordForEmail()` method again.
   * - This method will only resend an email or phone OTP to the user if there was an initial signup, email change or phone change request being made(note: For existing users signing in with OTP, you should use `signInWithOtp()` again to resend the OTP).
   * - You can specify a redirect url when you resend an email link using the `emailRedirectTo` option.
   *
   * @exampleDescription Resend an email signup confirmation
   * Resends the email signup confirmation to the user
   *
   * @example Resend an email signup confirmation
   * ```js
   * const { error } = await supabase.auth.resend({
   *   type: 'signup',
   *   email: 'email@example.com',
   *   options: {
   *     emailRedirectTo: 'https://example.com/welcome'
   *   }
   * })
   * ```
   *
   * @exampleDescription Resend a phone signup confirmation
   * Resends the phone signup confirmation email to the user
   *
   * @example Resend a phone signup confirmation
   * ```js
   * const { error } = await supabase.auth.resend({
   *   type: 'sms',
   *   phone: '1234567890'
   * })
   * ```
   *
   * @exampleDescription Resend email change email
   * Resends the email change email to the user
   *
   * @example Resend email change email
   * ```js
   * const { error } = await supabase.auth.resend({
   *   type: 'email_change',
   *   email: 'email@example.com'
   * })
   * ```
   *
   * @exampleDescription Resend phone change OTP
   * Resends the phone change OTP to the user
   *
   * @example Resend phone change OTP
   * ```js
   * const { error } = await supabase.auth.resend({
   *   type: 'phone_change',
   *   phone: '1234567890'
   * })
   * ```
   */
  async resend(credentials: ResendParams): Promise<AuthOtpResponse> {
    let flowId: string | null = null
    try {
      const endpoint = `${this.url}/resend`
      if ('email' in credentials) {
        const { email, type, options } = credentials
        let codeChallenge: string | null = null
        let codeChallengeMethod: string | null = null
        if (this.flowType === 'pkce') {
          ;[codeChallenge, codeChallengeMethod, flowId] = await this._getCodeChallengeAndMethod()
        }
        const { error } = await _request(this.fetch, 'POST', endpoint, {
          headers: this.headers,
          body: {
            email,
            type,
            gotrue_meta_security: { captcha_token: options?.captchaToken },
            code_challenge: codeChallenge,
            code_challenge_method: codeChallengeMethod,
          },
          redirectTo: this._maybeAppendFlowIdToRedirect(options?.emailRedirectTo, flowId),
        })
        if (error) {
          await removePKCEVerifier(this.storage, this.storageKey, flowId)
        }
        return this._returnResult({ data: { user: null, session: null }, error })
      } else if ('phone' in credentials) {
        const { phone, type, options } = credentials
        const { data, error } = await _request(this.fetch, 'POST', endpoint, {
          headers: this.headers,
          body: {
            phone,
            type,
            gotrue_meta_security: { captcha_token: options?.captchaToken },
          },
        })
        return this._returnResult({
          data: { user: null, session: null, messageId: data?.message_id },
          error,
        })
      }
      throw new AuthInvalidCredentialsError(
        'You must provide either an email or phone number and a type'
      )
    } catch (error) {
      await removePKCEVerifier(this.storage, this.storageKey, flowId)
      if (isAuthError(error)) {
        return this._returnResult({ data: { user: null, session: null }, error })
      }
      throw error
    }
  }

  /**
   * Returns the session, refreshing it if necessary.
   *
   * The session returned can be null if the session is not detected which can happen in the event a user is not signed-in or has logged out.
   *
   * **IMPORTANT:** This method loads values directly from the storage attached
   * to the client. If that storage is based on request cookies for example,
   * the values in it may not be authentic and therefore it's strongly advised
   * against using this method and its results in such circumstances. A warning
   * will be emitted if this is detected. Use {@link GoTrueClient.getUser} instead.
   *
   * @category Auth
   *
   * @remarks
   * - Since the introduction of [asymmetric JWT signing keys](/docs/guides/auth/signing-keys), this method is considered low-level and we encourage you to use `getClaims()` or `getUser()` instead.
   * - Retrieves the current [user session](/docs/guides/auth/sessions) from the storage medium (local storage, cookies).
   * - The session contains an access token (signed JWT), a refresh token and the user object.
   * - If the session's access token is expired or is about to expire, this method will use the refresh token to refresh the session.
   * - When using in a browser, or you've called `startAutoRefresh()` in your environment (React Native, etc.) this function always returns a valid access token without refreshing the session itself, as this is done in the background. This function returns very fast.
   * - **IMPORTANT SECURITY NOTICE:** If using an insecure storage medium, such as cookies or request headers, the user object returned by this function **must not be trusted**. Always verify the JWT using `getClaims()` or your own JWT verification library to securely establish the user's identity and access. You can also use `getUser()` to fetch the user object directly from the Auth server for this purpose.
   * - Cross-tab refresh races are handled by the GoTrue server (the rotated token from the first tab is returned to subsequent tabs via the parent-of-active mechanism), so no client-side serialization is needed.
   *
   * @example Get the session data
   * ```js
   * const { data, error } = await supabase.auth.getSession()
   * ```
   *
   * @exampleResponse Get the session data
   * ```json
   * {
   *   "data": {
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "token_type": "bearer",
   *       "expires_in": 3600,
   *       "expires_at": 1700000000,
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "email": "example@email.com",
   *         "email_confirmed_at": "2024-01-01T00:00:00Z",
   *         "phone": "",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "app_metadata": {
   *           "provider": "email",
   *           "providers": [
   *             "email"
   *           ]
   *         },
   *         "user_metadata": {
   *           "email": "example@email.com",
   *           "email_verified": false,
   *           "phone_verified": false,
   *           "sub": "11111111-1111-1111-1111-111111111111"
   *         },
   *         "identities": [
   *           {
   *             "identity_id": "22222222-2222-2222-2222-222222222222",
   *             "id": "11111111-1111-1111-1111-111111111111",
   *             "user_id": "11111111-1111-1111-1111-111111111111",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": false,
   *               "phone_verified": false,
   *               "sub": "11111111-1111-1111-1111-111111111111"
   *             },
   *             "provider": "email",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "example@email.com"
   *           }
   *         ],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z",
   *         "is_anonymous": false
   *       }
   *     }
   *   },
   *   "error": null
   * }
   * ```
   */
  async getSession() {
    await this.initializePromise

    if (this.lock != null) {
      // TODO(v3): remove legacy lock path
      return await this._acquireLock(this.lockAcquireTimeout, async () => {
        return this._useSession(async (result) => {
          return result
        })
      })
    }

    return await this._useSession(async (result) => {
      return result
    })
  }

  /**
   * Acquires a global lock based on the storage key.
   *
   * TODO(v3): remove along with the legacy lock path. Only called when
   * `this.lock` is non-null (custom lock supplied via constructor). The
   * default lockless path bypasses this entirely.
   */
  private async _acquireLock<R>(acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
    this._debug('#_acquireLock', 'begin', acquireTimeout)

    try {
      if (this.lockAcquired) {
        const last = this.pendingInLock.length
          ? this.pendingInLock[this.pendingInLock.length - 1]
          : Promise.resolve()

        const result = (async () => {
          await last
          return await fn()
        })()

        this.pendingInLock.push(
          (async () => {
            try {
              await result
            } catch (_e) {
              // we just care if it finished
            }
          })()
        )

        return result
      }

      return await this.lock!(`lock:${this.storageKey}`, acquireTimeout, async () => {
        this._debug('#_acquireLock', 'lock acquired for storage key', this.storageKey)

        try {
          this.lockAcquired = true

          const result = fn()

          this.pendingInLock.push(
            (async () => {
              try {
                await result
              } catch (e: any) {
                // we just care if it finished
              }
            })()
          )

          await result

          // keep draining the queue until there's nothing to wait on
          while (this.pendingInLock.length) {
            const waitOn = [...this.pendingInLock]

            await Promise.all(waitOn)

            this.pendingInLock.splice(0, waitOn.length)
          }

          return await result
        } finally {
          this._debug('#_acquireLock', 'lock released for storage key', this.storageKey)

          this.lockAcquired = false
        }
      })
    } finally {
      this._debug('#_acquireLock', 'end')
    }
  }

  /**
   * Use instead of {@link GoTrueClient.getSession} inside the library. Loads the session
   * via `__loadSession` (which may trigger a refresh if the access token is
   * within the expiry margin) and runs `fn` with the result.
   */
  private async _useSession<R>(
    fn: (
      result:
        | {
            data: {
              session: Session
            }
            error: null
          }
        | {
            data: {
              session: null
            }
            error: AuthError
          }
        | {
            data: {
              session: null
            }
            error: null
          }
    ) => Promise<R>
  ): Promise<R> {
    this._debug('#_useSession', 'begin')

    try {
      // Concurrent callers may both reach __loadSession; storage reads are
      // idempotent, and the only write path inside it (refresh) is
      // single-flighted downstream by `refreshingDeferred` in
      // `_callRefreshToken`. No serialization is needed at this layer.
      const result = await this.__loadSession()

      return await fn(result)
    } finally {
      this._debug('#_useSession', 'end')
    }
  }

  /**
   * NEVER USE DIRECTLY!
   *
   * Always use `_useSession`.
   */
  private async __loadSession(): Promise<
    | {
        data: {
          session: Session
        }
        error: null
      }
    | {
        data: {
          session: null
        }
        error: AuthError
      }
    | {
        data: {
          session: null
        }
        error: null
      }
  > {
    this._debug('#__loadSession()', 'begin')

    if (this.lock != null && !this.lockAcquired) {
      // TODO(v3): remove. Only meaningful on the legacy lock path.
      this._debug('#__loadSession()', 'used outside of an acquired lock!', new Error().stack)
    }

    try {
      let currentSession: Session | null = null

      const maybeSession = await getItemAsync(this.storage, this.storageKey)

      this._debug('#getSession()', 'session from storage', maybeSession)

      if (maybeSession !== null) {
        if (this._isValidSession(maybeSession)) {
          currentSession = maybeSession
        } else {
          this._debug('#getSession()', 'session from storage is not valid')
          await this._removeSession()
        }
      }

      if (!currentSession) {
        return { data: { session: null }, error: null }
      }

      // A session is considered expired before the access token _actually_
      // expires. When the autoRefreshToken option is off (or when the tab is
      // in the background), very eager users of getSession() -- like
      // realtime-js -- might send a valid JWT which will expire by the time it
      // reaches the server.
      const hasExpired = currentSession.expires_at
        ? currentSession.expires_at * 1000 - Date.now() < EXPIRY_MARGIN_MS
        : false

      this._debug(
        '#__loadSession()',
        `session has${hasExpired ? '' : ' not'} expired`,
        'expires_at',
        currentSession.expires_at
      )

      if (!hasExpired) {
        return { data: { session: await this._hydrateSessionUser(currentSession) }, error: null }
      }

      const { data: session, error } = await this._callRefreshToken(currentSession.refresh_token)
      if (error) {
        // A failed refresh does not mean there is no session. Storage is the
        // source of truth at this point, because either:
        //  - `_callRefreshToken` kept the original session in storage since
        //    the access token is still inside its real expiry window (a
        //    proactive refresh that failed non-retryably), or
        //  - another caller, in this tab or a different one, committed its
        //    own rotated session while this refresh was in flight, so this
        //    one was discarded by the commit guard or rejected by the server
        //    as already used.
        // Empty storage (concurrent `signOut`) or an expired stored session
        // means the session is genuinely gone and the error stands. Callers
        // that pass an explicit token (`setSession`,
        // `refreshSession({ refresh_token })`) call `_callRefreshToken`
        // directly and surface the failure instead.
        const stored = (await getItemAsync(this.storage, this.storageKey)) as Session | null
        if (
          stored &&
          this._isValidSession(stored) &&
          stored.expires_at &&
          stored.expires_at * 1000 > Date.now()
        ) {
          return this._returnResult({
            data: { session: await this._hydrateSessionUser(stored) },
            error: null,
          })
        }
        return this._returnResult({ data: { session: null }, error })
      }

      return this._returnResult({ data: { session }, error: null })
    } finally {
      this._debug('#__loadSession()', 'end')
    }
  }

  /**
   * Completes a session read back from storage so it matches what callers of
   * `getSession()` expect: fills in `session.user` from `userStorage` when the
   * client keeps the user in split storage, and wraps the user in the
   * insecure-access warning proxy on the server.
   */
  private async _hydrateSessionUser(session: Session): Promise<Session> {
    if (this.userStorage) {
      const maybeUser: { user?: User | null } | null = (await getItemAsync(
        this.userStorage,
        this.storageKey + '-user'
      )) as any

      session.user = maybeUser?.user ? maybeUser.user : userNotAvailableProxy()
    }

    // Warns when properties of the user are accessed, not when session.user itself is accessed.
    if (this.storage.isServer && session.user && !(session.user as any).__isUserNotAvailableProxy) {
      const suppressWarningRef = { value: this.suppressGetSessionWarning }
      session.user = insecureUserWarningProxy(session.user, suppressWarningRef)

      if (suppressWarningRef.value) {
        this.suppressGetSessionWarning = true
      }
    }

    return session
  }

  /**
   * Gets the current user details if there is an existing session. This method
   * performs a network request to the Supabase Auth server, so the returned
   * value is authentic and can be used to base authorization rules on.
   *
   * @param jwt Takes in an optional access token JWT. If no JWT is provided, the JWT from the current session is used.
   *
   * @category Auth
   *
   * @remarks
   * - This method fetches the user object from the database instead of local session.
   * - This method is useful for checking if the user is authorized because it validates the user's access token JWT on the server.
   * - Should always be used when checking for user authorization on the server. On the client, you can instead use `getSession().session.user` for faster results. `getSession` is insecure on the server.
   *
   * @example Get the logged in user with the current existing session
   * ```js
   * const { data: { user } } = await supabase.auth.getUser()
   * ```
   *
   * @exampleResponse Get the logged in user with the current existing session
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "confirmed_at": "2024-01-01T00:00:00Z",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {
   *         "email": "example@email.com",
   *         "email_verified": false,
   *         "phone_verified": false,
   *         "sub": "11111111-1111-1111-1111-111111111111"
   *       },
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *       "is_anonymous": false
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @example Get the logged in user with a custom access token jwt
   * ```js
   * const { data: { user } } = await supabase.auth.getUser(jwt)
   * ```
   */
  async getUser(jwt?: string): Promise<UserResponse> {
    if (jwt) {
      return await this._getUser(jwt)
    }

    await this.initializePromise

    let result: UserResponse
    if (this.lock != null) {
      // TODO(v3): remove legacy lock path
      result = await this._acquireLock(this.lockAcquireTimeout, async () => {
        return await this._getUser()
      })
    } else {
      result = await this._getUser()
    }

    if (result.data.user) {
      this.suppressGetSessionWarning = true
    }

    return result
  }

  private async _getUser(jwt?: string): Promise<UserResponse> {
    try {
      if (jwt) {
        return await _request(this.fetch, 'GET', `${this.url}/user`, {
          headers: this.headers,
          jwt: jwt,
          xform: _userResponse,
        })
      }

      return await this._useSession(async (result) => {
        const { data, error } = result
        if (error) {
          throw error
        }

        // returns an error if there is no access_token or custom authorization header
        if (!data.session?.access_token && !this.hasCustomAuthorizationHeader) {
          return { data: { user: null }, error: new AuthSessionMissingError() }
        }

        return await _request(this.fetch, 'GET', `${this.url}/user`, {
          headers: this.headers,
          jwt: data.session?.access_token ?? undefined,
          xform: _userResponse,
        })
      })
    } catch (error) {
      if (isAuthError(error)) {
        if (isAuthSessionMissingError(error)) {
          // JWT contains a `session_id` which does not correspond to an active
          // session in the database, indicating the user is signed out.

          await this._removeSession()
        }

        return this._returnResult({ data: { user: null }, error })
      }

      throw error
    }
  }

  /**
   * Updates user data for a logged in user.
   *
   * @category Auth
   *
   * @remarks
   * - In order to use the `updateUser()` method, the user needs to be signed in first.
   * - By default, email updates sends a confirmation link to both the user's current and new email.
   * To only send a confirmation link to the user's new email, disable **Secure email change** in your project's [email auth provider settings](/dashboard/project/_/auth/providers).
   *
   * @exampleDescription Update the email for an authenticated user
   * Sends a "Confirm Email Change" email to the new address. If **Secure Email Change** is enabled (default), confirmation is also required from the **old email** before the change is applied. To skip dual confirmation and apply the change after only the new email is verified, disable **Secure Email Change** in the [Email Auth Provider settings](/dashboard/project/_/auth/providers?provider=Email).
   *
   * @example Update the email for an authenticated user
   * ```js
   * const { data, error } = await supabase.auth.updateUser({
   *   email: 'new@email.com'
   * })
   * ```
   *
   * @exampleResponse Update the email for an authenticated user
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "confirmed_at": "2024-01-01T00:00:00Z",
   *       "new_email": "new@email.com",
   *       "email_change_sent_at": "2024-01-01T00:00:00Z",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {
   *         "email": "example@email.com",
   *         "email_verified": false,
   *         "phone_verified": false,
   *         "sub": "11111111-1111-1111-1111-111111111111"
   *       },
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z",
   *       "is_anonymous": false
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @exampleDescription Update the phone number for an authenticated user
   * Sends a one-time password (OTP) to the new phone number.
   *
   * @example Update the phone number for an authenticated user
   * ```js
   * const { data, error } = await supabase.auth.updateUser({
   *   phone: '123456789'
   * })
   * ```
   *
   * @example Update the password for an authenticated user
   * ```js
   * const { data, error } = await supabase.auth.updateUser({
   *   password: 'new password'
   * })
   * ```
   *
   * @exampleDescription Update the user's metadata
   * Updates the user's custom metadata.
   *
   * **Note**: The `data` field maps to the `auth.users.raw_user_meta_data` column in your Supabase database. When calling `getUser()`, the data will be available as `user.user_metadata`.
   *
   * @example Update the user's metadata
   * ```js
   * const { data, error } = await supabase.auth.updateUser({
   *   data: { hello: 'world' }
   * })
   * ```
   *
   * @exampleDescription Update the user's password with a nonce
   * If **Secure password change** is enabled in your [project's email provider settings](/dashboard/project/_/auth/providers), updating the user's password would require a nonce if the user **hasn't recently signed in**. The nonce is sent to the user's email or phone number. A user is deemed recently signed in if the session was created in the last 24 hours.
   *
   * @example Update the user's password with a nonce
   * ```js
   * const { data, error } = await supabase.auth.updateUser({
   *   password: 'new password',
   *   nonce: '123456'
   * })
   * ```
   */
  async updateUser(
    attributes: UserAttributes,
    options: {
      emailRedirectTo?: string | undefined
    } = {}
  ): Promise<UserResponse> {
    await this.initializePromise

    if (this.lock != null) {
      // TODO(v3): remove legacy lock path
      return await this._acquireLock(this.lockAcquireTimeout, async () => {
        return await this._updateUser(attributes, options)
      })
    }

    return await this._updateUser(attributes, options)
  }

  protected async _updateUser(
    attributes: UserAttributes,
    options: {
      emailRedirectTo?: string | undefined
    } = {}
  ): Promise<UserResponse> {
    let flowId: string | null = null
    try {
      return await this._useSession(async (result) => {
        const { data: sessionData, error: sessionError } = result
        if (sessionError) {
          throw sessionError
        }
        if (!sessionData.session) {
          throw new AuthSessionMissingError()
        }
        const session: Session = sessionData.session
        let codeChallenge: string | null = null
        let codeChallengeMethod: string | null = null
        if (this.flowType === 'pkce' && attributes.email != null) {
          ;[codeChallenge, codeChallengeMethod, flowId] = await this._getCodeChallengeAndMethod()
        }

        const { data, error: userError } = await _request(this.fetch, 'PUT', `${this.url}/user`, {
          headers: this.headers,
          redirectTo: this._maybeAppendFlowIdToRedirect(options?.emailRedirectTo, flowId),
          body: {
            ...attributes,
            code_challenge: codeChallenge,
            code_challenge_method: codeChallengeMethod,
          },
          jwt: session.access_token,
          xform: _userResponse,
        })
        if (userError) {
          throw userError
        }
        session.user = data.user as User
        await this._saveSession(session)
        await this._notifyAllSubscribers('USER_UPDATED', session)
        return this._returnResult({ data: { user: session.user }, error: null })
      })
    } catch (error) {
      await removePKCEVerifier(this.storage, this.storageKey, flowId)
      if (isAuthError(error)) {
        return this._returnResult({ data: { user: null }, error })
      }

      throw error
    }
  }

  /**
   * Sets the session data from the current session. If the current session is expired, setSession will take care of refreshing it to obtain a new session.
   * If the refresh token or access token in the current session is invalid, an error will be thrown.
   * @param currentSession The current session that minimally contains an access token and refresh token.
   *
   * @category Auth
   *
   * @remarks
   * - This method sets the session using an `access_token` and `refresh_token`.
   * - If successful, a `SIGNED_IN` event is emitted.
   *
   * @exampleDescription Set the session
   * Sets the session data from an access_token and refresh_token, then returns an auth response or error.
   *
   * @example Set the session
   * ```js
   *   const { data, error } = await supabase.auth.setSession({
   *     access_token,
   *     refresh_token
   *   })
   * ```
   *
   * @exampleResponse Set the session
   * ```json
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "confirmed_at": "2024-01-01T00:00:00Z",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {
   *         "email": "example@email.com",
   *         "email_verified": false,
   *         "phone_verified": false,
   *         "sub": "11111111-1111-1111-1111-111111111111"
   *       },
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "em