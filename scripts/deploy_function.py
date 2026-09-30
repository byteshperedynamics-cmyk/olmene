#!/usr/bin/env python3
"""Deploy one edge function's single-file bundle via the Management API.

Usage: SUPABASE_ACCESS_TOKEN=... python3 scripts/deploy_function.py <slug> <file>
Preserves verify_jwt=false (matching all current deployments of this slug).
"""
import json
import os
import sys
import urllib.error
import urllib.request
import uuid

PAT = os.environ["SUPABASE_ACCESS_TOKEN"]
REF = "ffoevhldpppyfsfgufmx"


def deploy(slug: str, path: str, verify_jwt: bool = False) -> None:
    content = open(path, "rb").read()
    boundary = uuid.uuid4().hex
    metadata = {
        "entrypoint_path": "index.ts",
        "name": slug,
        "verify_jwt": verify_jwt,
        "functions": [{"slug": slug, "name": slug, "verify_jwt": verify_jwt}],
        "static_modules": [],
        "polyfills": [],
    }
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n'
        f'{json.dumps(metadata)}\r\n'.encode(),
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="index.ts"\r\n'
        f"Content-Type: application/typescript\r\n\r\n".encode() + content + b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/functions/deploy?slug={slug}",
        data=b"".join(parts),
        headers={
            "Authorization": f"Bearer {PAT}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            print(f"HTTP {r.status}: {r.read().decode()[:300]}")
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()[:500]}")
        sys.exit(1)


if __name__ == "__main__":
    deploy(sys.argv[1], sys.argv[2])
