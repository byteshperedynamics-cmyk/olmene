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

for path in ['/accounts/{account_id}/builds/workers/{script_name}/deploy_hooks',
             '/accounts/{account_id}/builds/workers/{script_name}/deploy_hooks/{deploy_hook_uuid}']:
    p = spec['paths'].get(path, {})
    print(f"=== {path} ===")
    for m, op in p.items():
        if isinstance(op, dict) and m != 'parameters':
            print(f"  [{m.upper()}] {op.get('summary','')[:80]}")
            rb = op.get('requestBody', {})
            if rb: print("   body:", json.dumps(rb)[:400])
            r = op.get('responses', {}).get('200' if m != 'delete' else '200', {})
            print("   resp:", json.dumps(r)[:400])

for n in ['builds_CreateDeployHookRequest', 'builds_DeployHook']:
    if n in comps:
        print(f"\n--- {n} ---\n{json.dumps(comps[n], indent=1)[:800]}")
