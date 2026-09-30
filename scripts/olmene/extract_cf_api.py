#!/usr/bin/env python3
"""Extract specific path definitions from Cloudflare OpenAPI schema."""
import yaml, sys, json

class LenientLoader(yaml.SafeLoader):
    pass

def unknown(loader, suffix, node):
    if isinstance(node, yaml.ScalarNode):
        return loader.construct_scalar(node)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node)
    if isinstance(node, yaml.MappingNode):
        return loader.construct_mapping(node)
    return None

LenientLoader.add_multi_constructor('tag:yaml.org,2002:', unknown)

TARGETS = [
    '/accounts/{account_id}/builds/repos/connections',
    '/accounts/{account_id}/builds/triggers',
    '/accounts/{account_id}/builds/workers',
    '/accounts/{account_id}/workers/domains',
    '/accounts/{account_id}/builds/repos/{provider_type}/{provider_account_id}/{repo_id}/config_autofill',
]

with open('/tmp/cf_openapi.yaml') as f:
    spec = yaml.load(f, Loader=LenientLoader)

paths = spec.get('paths', {})
out = {}
for t in TARGETS:
    if t in paths:
        out[t] = paths[t]
    else:
        print(f"MISSING: {t}", file=sys.stderr)

with open('/tmp/cf_paths.yaml', 'w') as f:
    yaml.safe_dump(out, f, width=100)

for t, ops in out.items():
    print(f"\n{'='*70}\n{t}")
    for method, op in ops.items():
        if method == 'parameters' or not isinstance(op, dict):
            continue
        print(f"  [{method.upper()}] {op.get('summary','')[:90]}")
        rb = op.get('requestBody', {})
        if rb:
            for ct, c in rb.get('content', {}).items():
                print(f"    body({ct}): {json.dumps(c.get('schema', {}))[:600]}")

# Resolve component schemas
print("\n\n########## COMPONENT SCHEMAS ##########")
comps = spec.get('components', {}).get('schemas', {})
for name in ['builds_UpsertRepoConnectionRequest', 'builds_CreateTriggerRequest',
             'builds_CreateWorkerRequest', 'workers_Domain']:
    if name in comps:
        print(f"\n--- {name} ---")
        print(json.dumps(comps[name], indent=1)[:2500])
    else:
        print(f"--- {name}: MISSING ---")
