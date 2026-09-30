#!/usr/bin/env python3
"""Send a Standard-Webhooks-signed Polar test event to polar-webhook and
verify the subscription upsert + dedup behavior."""
import base64
import hashlib
import hmac
import json
import time
import urllib.request

FN_URL = "https://ffoevhldpppyfsfgufmx.supabase.co/functions/v1/polar-webhook"
SECRET = open("/home/z/my-project/scripts/polar_webhook_secret.txt").read().strip()
WEBHOOK_ID = "evt_test_" + hashlib.sha1(str(time.time()).encode()).hexdigest()[:12]

# subscription.updated payload for the REAL Polar subscription (Pro, trialing).
event = {
    "id": WEBHOOK_ID,
    "type": "subscription.updated",
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "data": {
        "id": "6d8ec756-8882-4861-9b9a-ceb314fe5a91",
        "status": "active",
        "customer_id": "cf42b1e9-6948-406e-b70e-5d0d61cb43a4",
        "product_id": "9f1761be-8e0c-4eb0-8992-45aad45d9758",
        "current_period_start": "2026-09-24T21:28:33.085107Z",
        "current_period_end": "2026-10-24T21:28:30.980575Z",
        "cancel_at_period_end": False,
        "customer": {
            "id": "cf42b1e9-6948-406e-b70e-5d0d61cb43a4",
            "email": "kalyntwork@gmail.com",
            "external_id": "471bef9b-a45e-4ced-bef5-b32e25f11309",
            "metadata": {"user_id": "471bef9b-a45e-4ced-bef5-b32e25f11309"},
        },
    },
}
raw = json.dumps(event, separators=(",", ":"))
ts = str(int(time.time()))

# Standard Webhooks: key = base64-decoded secret (after whsec_ prefix)
key_std = base64.b64decode(SECRET[len("whsec_"):])
sig_std = base64.b64encode(
    hmac.new(key_std, f"{ts}.{raw}".encode(), hashlib.sha256).digest()
).decode()
# Legacy Polar HMAC: key = UTF-8 bytes of the full secret string
sig_legacy = base64.b64encode(
    hmac.new(SECRET.encode(), f"{ts}.{raw}".encode(), hashlib.sha256).digest()
).decode()


def send(sig, label, wid=WEBHOOK_ID):
    req = urllib.request.Request(
        FN_URL,
        data=raw.encode(),
        headers={
            "Content-Type": "application/json",
            "webhook-id": wid,
            "webhook-timestamp": ts,
            "webhook-signature": f"v1,{sig}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"[{label}] HTTP {r.status}: {r.read().decode()[:200]}")
    except urllib.error.HTTPError as e:
        print(f"[{label}] HTTP {e.code}: {e.read().decode()[:200]}")


print("event id:", WEBHOOK_ID)
# 1. Standard Webhooks signature (new scheme) — should upsert
send(sig_std, "std-scheme")
# 2. Same event id again — should dedupe
send(sig_std, "dedup")
# 3. Legacy Polar HMAC signature — should also verify (event id differs)
send(sig_legacy, "legacy-scheme", wid=WEBHOOK_ID + "-b")
# 4. Garbage signature — should 401
send("AAAA" + "A" * 20, "bad-sig", wid=WEBHOOK_ID + "-c")
