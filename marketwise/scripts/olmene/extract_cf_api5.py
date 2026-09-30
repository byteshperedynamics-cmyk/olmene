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

for name in ['workers_script-response-collection', 'workers_script-response',
             'workers_script-and-version-settings-response', 'workers_script-settings',
             'builds_UpsertRepoConnectionResponse', 'builds_CreateBuildTokenRequest',
             'builds_build_command', 'builds_deploy_command']:
    if name in comps:
        print(f"\n--- {name} ---")
        print(json.dumps(comps[name], indent=1)[:1000])
    else:
        print(f"--- {name}: MISSING ---")
