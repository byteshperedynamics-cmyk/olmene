import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  STATE_COOKIE,
  authorizeUrl,
  decodeState,
  encodeState,
  exchangeForIdToken,
  isHashedNonce,
  pkceChallenge,
  readCookie,
  safeLocale,
  safeNextPath,
} from "../google-signin";
import { GET as start } from "../../../app/api/auth/google/route";
import { GET as callback } from "../../../app/api/auth/google/callback/route";

const NONCE = "a".repeat(64);

describe("google sign-in helpers", () => {
  test("next path stays in-app", () => {
    expect(safeNextPath("/app/checkout/?plan=pro")).toBe("/app/checkout/?plan=pro");
    expect(safeNextPath("https://evil.example/")).toBe("/app/");
    expect(safeNextPath("//evil.example/")).toBe("/app/");
    expect(safeNextPath("/\\evil.example")).toBe("/app/");
    expect(safeNextPath(null)).toBe("/app/");
  });

  test("nonce must be a sha256 hex digest", () => {
    expect(isHashedNonce(NONCE)).toBe(true);
    expect(isHashedNonce("A".repeat(64))).toBe(false);
    expect(isHashedNonce("abc")).toBe(false);
    expect(isHashedNonce(null)).toBe(false);
  });

  test("locale hint is sanitised", () => {
    expect(safeLocale("el")).toBe("el");
    expect(safeLocale("zh-CN")).toBe("zh-CN");
    expect(safeLocale("en&x=1")).toBeNull();
  });

  test("state cookie round-trips and rejects junk", () => {
    const s = { state: "st", verifier: "ver", next: "/app/new/" };
    expect(decodeState(encodeState(s))).toEqual(s);
    expect(decodeState(encodeState({ ...s, next: "//evil" }))).toEqual({ ...s, next: "/app/" });
    expect(decodeState("not-base64-json")).toBeNull();
    expect(decodeState(null)).toBeNull();
  });

  test("PKCE challenge is RFC 7636 S256", async () => {
    // Appendix B test vector.
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  test("authorize URL asks only for openid email profile, with nonce and PKCE", () => {
    const u = new URL(authorizeUrl({ clientId: "cid", redirectUri: "https://olmene.com/api/auth/google/callback/", state: "s", challenge: "c", nonce: NONCE, hl: "el" }));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("nonce")).toBe(NONCE);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("prompt")).toBe("select_account");
    expect(u.searchParams.get("hl")).toBe("el");
    expect(u.searchParams.get("access_type")).toBeNull();
  });

  test("code exchange sends secret + verifier and returns the id_token", async () => {
    let sent = "";
    const f = (async (_url: string, init: RequestInit) => {
      sent = String(init.body);
      return new Response(JSON.stringify({ id_token: "jwt", access_token: "x" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await exchangeForIdToken({ id: "cid", secret: "sec" }, "code1", "ver1", "https://r/", f)).toBe("jwt");
    const p = new URLSearchParams(sent);
    expect(p.get("client_secret")).toBe("sec");
    expect(p.get("code_verifier")).toBe("ver1");
    expect(p.get("grant_type")).toBe("authorization_code");
    const failing = (async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeForIdToken({ id: "cid", secret: "sec" }, "c", "v", "https://r/", failing)).rejects.toThrow("400");
  });
});

describe("google sign-in routes", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.APP_URL = "https://olmene.com";
  });
  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
  });

  test("start: not configured → back to login with a clear reason", async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    const res = await start(new Request(`https://olmene.com/api/auth/google/?nonce=${NONCE}`));
    expect(res.headers.get("location")).toBe("https://olmene.com/login/?auth_error=google_unavailable");
  });

  test("start: bad nonce is refused", async () => {
    const res = await start(new Request("https://olmene.com/api/auth/google/?nonce=x"));
    expect(res.headers.get("location")).toBe("https://olmene.com/login/?auth_error=google_failed");
  });

  test("start → callback: state cookie, code exchange, token handed to /login/ fragment", async () => {
    const res = await start(new Request(`https://olmene.com/api/auth/google/?nonce=${NONCE}&next=%2Fapp%2Fcheckout%2F%3Fplan%3Dpro&hl=de`));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.searchParams.get("redirect_uri")).toBe("https://olmene.com/api/auth/google/callback/");
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/api/auth/google/");
    const cookie = setCookie.split(";")[0];
    const st = decodeState(readCookie(cookie, STATE_COOKIE));
    expect(st?.next).toBe("/app/checkout/?plan=pro");
    expect(loc.searchParams.get("state")).toBe(st!.state);
    expect(loc.searchParams.get("code_challenge")).toBe(await pkceChallenge(st!.verifier));

    globalThis.fetch = (async () => new Response(JSON.stringify({ id_token: "header.payload.sig" }))) as unknown as typeof fetch;
    const cb = await callback(
      new Request(`https://olmene.com/api/auth/google/callback/?code=abc&state=${st!.state}`, { headers: { cookie } }),
    );
    expect(cb.status).toBe(303);
    const back = new URL(cb.headers.get("location")!);
    expect(back.origin + back.pathname).toBe("https://olmene.com/login/");
    const frag = new URLSearchParams(back.hash.slice(1));
    expect(frag.get("google_id_token")).toBe("header.payload.sig");
    expect(frag.get("next")).toBe("/app/checkout/?plan=pro");
    expect(cb.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("callback: state mismatch, missing cookie, cancel and failed exchange", async () => {
    const cookie = `${STATE_COOKIE}=${encodeState({ state: "good", verifier: "v", next: "/app/" })}`;
    const call = (q: string, c?: string) =>
      callback(new Request(`https://olmene.com/api/auth/google/callback/?${q}`, { headers: c ? { cookie: c } : {} })).then((r) => r.headers.get("location"));
    expect(await call("code=a&state=evil", cookie)).toBe("https://olmene.com/login/?auth_error=google_failed");
    expect(await call("code=a&state=good")).toBe("https://olmene.com/login/?auth_error=google_failed");
    expect(await call("error=access_denied", cookie)).toBe("https://olmene.com/login/?auth_error=google_cancelled");
    globalThis.fetch = (async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;
    expect(await call("code=a&state=good", cookie)).toBe("https://olmene.com/login/?auth_error=google_failed");
  });
});
