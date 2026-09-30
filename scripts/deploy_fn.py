#!/usr/bin/env python3
"""Deploy a Supabase edge function via the Management API deploy endpoint."""
import json
import sys
import urllib.request
import uuid

PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"


def deploy(slug: str, files: dict, verify_jwt: bool = False) -> None:
    """files: {virtual_path: local_content}"""
    boundary = uuid.uuid4().hex
    metadata = {
        "entrypoint_path": "index.ts",
        "name": slug,
        "verify_jwt": verify_jwt,
        "functions": [
            {"slug": slug, "name": slug, "verify_jwt": verify_jwt}
        ],
        "static_modules": [],
        "polyfills": [],
    }
    parts = []
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n'
        f'{json.dumps(metadata)}\r\n'.encode()
    )
    for path, content in files.items():
        if isinstance(content, str):
            content = content.encode()
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{path}"\r\n'
            f"Content-Type: application/typescript\r\n\r\n".encode()
            + content
            + b"\r\n"
        )
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)

    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/functions/deploy?slug={slug}",
        data=body,
        headers={
            "Authorization": f"Bearer {PAT}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            print(f"HTTP {r.status}")
            print(r.read().decode()[:2000])
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}")
        print(e.read().decode()[:2000])


if __name__ == "__main__":
    slug = sys.argv[1]
    src_path = sys.argv[2]
    verify = len(sys.argv) > 3 and sys.argv[3] == "jwt"
    with open(src_path) as f:
        deploy(slug, {"index.ts": f.read()}, verify_jwt=verify)
