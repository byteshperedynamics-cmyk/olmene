#!/usr/bin/env python3
"""Task 24 — insert newly translated keys into every language dictionary.

Reads scripts/i18n_new/{lang}.json (flat key -> translation produced by the
translation agents) and rebuilds each dictionary in EXACT en.json key order,
so key-set AND key-order parity hold by construction. Fails loudly if a new
key is missing a translation or an old key would be lost.
"""
import json
import sys
from pathlib import Path

ROOT = Path("/home/z/my-project")
EN = ROOT / "src/i18n/dictionaries/en.json"
DICTS = ROOT / "src/i18n/dictionaries"
NEW_DIR = ROOT / "scripts/i18n_new"

LANGS = ["zh", "hi", "es", "fr", "ar", "bn", "pt", "ru", "ur", "id", "de", "ja", "tr", "el"]

def main():
    en = json.loads(EN.read_text(encoding="utf-8"))
    en_keys = list(en.keys())
    new_keys = [k for k in en_keys if k.startswith(("nav.howItWorks", "nav.proof", "nav.faq", "cc.", "pc.perReport", "pc.pro.", "pc.cta.", "pc.onetime.", "ph.cta.outcome", "compare.proof", "sample.badge"))]
    print(f"en.json keys: {len(en_keys)}; expecting {len(new_keys)} new keys per language")

    for lang in LANGS:
        src = NEW_DIR / f"{lang}.json"
        if not src.exists():
            sys.exit(f"MISSING translations for {lang}: {src}")
        new = json.loads(src.read_text(encoding="utf-8"))
        missing = [k for k in new_keys if k not in new or not str(new[k]).strip()]
        if missing:
            sys.exit(f"{lang}: missing/empty translations: {missing}")
        extra = [k for k in new if k not in en_keys]
        if extra:
            sys.exit(f"{lang}: unknown keys: {extra}")

        dpath = DICTS / f"{lang}.json"
        old = json.loads(dpath.read_text(encoding="utf-8"))
        rebuilt = {}
        for k in en_keys:
            if k in new:
                rebuilt[k] = new[k]
            elif k in old:
                rebuilt[k] = old[k]
            else:
                sys.exit(f"{lang}: key {k} has neither translation nor existing value")
        lost = [k for k in old if k not in rebuilt]
        if lost:
            sys.exit(f"{lang}: would LOSE existing keys: {lost}")
        dpath.write_text(json.dumps(rebuilt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{lang}: {len(rebuilt)} keys written ({len(new)} new inserted)")

    print("ALL DONE")

if __name__ == "__main__":
    main()
