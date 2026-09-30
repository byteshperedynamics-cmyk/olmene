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

s = comps.get('workers_script-response', {})
print("workers_script-response properties:", sorted(s.get('properties', {}).keys()))

# script-and-version-settings-item — look for tag/id/script_name
s2 = comps.get('workers_script-and-version-settings-item', {})
print("\nsettings-item properties:", sorted(s2.get('properties', {}).keys()))
for k in ('script_tag', 'tag', 'id', 'script_name'):
    if k in s2.get('properties', {}):
        print(f"  {k}:", json.dumps(s2['properties'][k])[:200])

# build token create request
s3 = comps.get('builds_CreateBuildTokenRequest', {})
print("\nCreateBuildTokenRequest:", json.dumps(s3)[:400])
s4 = comps.get('builds_ListTokensResponse', {})
print("\nListTokensResponse:", json.dumps(s4)[:500])

# build_command / deploy_command — empty allowed?
for n in ['builds_build_command', 'builds_deploy_command', 'builds_root_directory']:
    sc = comps.get(n, {})
    print(f"\n{n}:", json.dumps(sc)[:300])
