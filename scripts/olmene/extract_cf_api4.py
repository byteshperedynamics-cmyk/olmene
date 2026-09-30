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

# scripts list response
p = spec['paths']['/accounts/{account_id}/workers/scripts']
print("=== GET /workers/scripts response ===")
print(json.dumps(p['get'].get('responses', {}).get('200', {}), indent=1)[:800])

# script settings response (may contain tag/id)
p2 = spec['paths']['/accounts/{account_id}/workers/scripts/{script_name}/settings']
print("\n=== GET script settings response ===")
print(json.dumps(p2['get'].get('responses', {}).get('200', {}), indent=1)[:800])

# ListScriptsResponseItem-ish schemas
for name in sorted(comps.keys()):
    if 'script' in name.lower() and ('list' in name.lower() or 'tag' in name.lower()):
        print(f"\n--- {name} ---")
        print(json.dumps(comps[name], indent=1)[:700])
