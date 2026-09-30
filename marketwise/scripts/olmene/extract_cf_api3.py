#!/usr/bin/env python3
import yaml, json

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

with open('/tmp/cf_openapi.yaml') as f:
    spec = yaml.load(f, Loader=LenientLoader)

comps = spec['components']['schemas']
for name in ['builds_CreateWorkerGitRepositoryFunfettiInput', 'builds_CreateWorkerGitRepositoryGrantInput']:
    if name in comps:
        print(f"\n--- {name} ---\n{json.dumps(comps[name], indent=1)[:1500]}")

for path in ['/accounts/{account_id}/builds/repos/connections',
             '/accounts/{account_id}/builds/repos/connections/{repo_connection_uuid}',
             '/accounts/{account_id}/builds/workers',
             '/accounts/{account_id}/builds/tokens',
             '/accounts/{account_id}/builds/workers/{script_tag}']:
    p = spec['paths'].get(path)
    print(f"\n=== {path} ===")
    if not p:
        print("  NOT FOUND")
        continue
    for m, op in p.items():
        if isinstance(op, dict) and m != 'parameters':
            print(f"  [{m.upper()}] {op.get('summary','')[:70]}")
            rb = op.get('requestBody', {})
            if rb: print("   body:", json.dumps(rb)[:250])
            resp = op.get('responses', {}).get('200', {})
            print("   resp:", json.dumps(resp)[:350])
