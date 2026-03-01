#!/usr/bin/env python3
import argparse
import importlib.util
import json
from pathlib import Path

PORTER = Path('/home/lobster/documents/porter/porter.py')


def load_porter():
    spec = importlib.util.spec_from_file_location('porter_mod', str(PORTER))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    ap = argparse.ArgumentParser(description='Run model coordination via Porter dispatchers')
    ap.add_argument('prompt', help='Prompt to coordinate across models')
    ap.add_argument('--backends', default='openclaw,claude,gemini,codex', help='Comma-separated backends')
    ap.add_argument('--timeout', type=int, default=30)
    args = ap.parse_args()

    backends = [b.strip().lower() for b in args.backends.split(',') if b.strip()]
    m = load_porter()
    res = m._run_coordination(args.prompt, backends=backends, timeout=max(10, min(300, args.timeout)))
    print(json.dumps({
        'ok': res.get('ok'),
        'run_id': res.get('run_id'),
        'ok_count': res.get('ok_count'),
        'results': {k: {'ok': v.get('ok'), 'model': v.get('model', ''), 'error': v.get('error', '')[:180]} for k, v in (res.get('results') or {}).items()},
        'coordination_log': str(m._coord_log_path()),
    }, indent=2))


if __name__ == '__main__':
    main()
