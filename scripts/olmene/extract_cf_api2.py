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
for name in ['builds_CreateWorkerGitRepositoryInput', 'builds_CreateWorkerBuildSettingsInput',
             'builds_RepoConnection', 'builds_external_script_id', 'builds_repo_id',
             'builds_SCMProviderType', 'builds_build_token_uuid']:
    if name in comps:
        s = json.dumps(comps[name], indent=1)
        print(f"\n--- {name} ---\n{s[:1800]}")
    else:
        print(f"--- {name}: MISSING ---")

# Response schema of repos/connections
p = spec['paths']['/accounts/{account_id}/builds/repos/connections']
print("\n--- repos/connections GET responses ---")
print(json.dumps(p['get'].get('responses', {}), indent=1)[:1200])

# Response schema of workers/domains PUT
p2 = spec['paths']['/accounts/{account_id}/workers/domains']
print("\n--- workers/domains PUT responses ---")
print(json.dumps(p2['put'].get('responses', {}), indent=1)[:800])

# Check POST /builds/builds (manual build trigger?)
p3 = spec['paths'].get('/accounts/{account_id}/builds/builds', {})
print("\n--- builds/builds methods ---")
for m, op in p3.items():
    if isinstance(op, dict):
        print(f"[{m}] {op.get('summary','')[:80]}")
        rb = op.get('requestBody', {})
        if rb:
            print("  body:", json.dumps(rb)[:300])
