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

for path in ['/accounts/{account_id}/builds/workers/{external_script_id}/builds',
             '/accounts/{account_id}/builds/builds',
             '/accounts/{account_id}/builds/builds/latest']:
    p = spec['paths'].get(path, {})
    print(f"=== {path} ===")
    for m, op in p.items():
        if isinstance(op, dict) and m != 'parameters':
            print(f"  [{m.upper()}] {op.get('summary','')[:80]}")
            params = [q.get('name') for q in op.get('parameters', []) if isinstance(q, dict)]
            print("   params:", params)
            rb = op.get('requestBody', {})
            if rb: print("   body:", json.dumps(rb)[:300])
