#!/usr/bin/env python3
import os
import re
import json
import time
import subprocess
import sys
from pathlib import Path

ROOT = Path('/home/lobster/projects/porter')
WORKLIST = ROOT / '.planning' / 'skill-rewrite-worklist.md'
PROGRESS = ROOT / '.planning' / 'skill-rewrite-progress.md'
LOG = ROOT / '.planning' / 'skill-rewrite-log.md'
SKILLS = ROOT / 'skills'
QUEUE_STATE = ROOT / '.planning' / 'skill-rewrite-driver-state.json'

BAR_WIDTH = 50
BATCH_SIZE = 3
SLEEP_SECONDS = 5

DONE_RE = re.compile(r'^\d+\.\s+([a-z0-9\-_]+)\s*$', re.M)
QUEUE_RE = re.compile(r'^\d+\.\s+([a-z0-9\-_]+)\s*$', re.M)


def load_queue():
    text = WORKLIST.read_text()
    return QUEUE_RE.findall(text)


def load_completed_from_progress():
    if not PROGRESS.exists():
        return []
    text = PROGRESS.read_text()
    completed_match = re.search(r'^Completed:\s*(\d+)\s*$', text, re.M)
    completed_count = int(completed_match.group(1)) if completed_match else 0
    queue = load_queue()
    return queue[:completed_count]


def count_completed_by_fs(queue):
    # treat a skill as completed if its SKILL.md was rewritten and progress file already lists it
    done = set(load_completed_from_progress())
    return [s for s in queue if s in done]


def next_skills(queue, done):
    remaining = [s for s in queue if s not in set(done)]
    return remaining[:BATCH_SIZE]


def progress_bar(n, total):
    filled = int((n / total) * BAR_WIDTH)
    return '[' + '█' * filled + '░' * (BAR_WIDTH - filled) + ']'


def write_progress(queue, done, current):
    total = len(queue)
    completed = len(done)
    recent = done[-8:]
    lines = [
        '# Skill Rewrite Progress',
        '',
        f'Total skills: {total}',
        f'Completed: {completed}',
        f'Current: {current if current else "none"}',
        'Last completed:'
    ]
    for i, skill in enumerate(recent, 1):
        lines.append(f'{i}. {skill}')
    lines += [
        '',
        f'Progress bar: {progress_bar(completed, total)}',
        '',
        'Mode: python driver orchestration',
        'Scope: skill-pack files only',
        ''
    ]
    PROGRESS.write_text('\n'.join(lines))


def append_log(n, total, skill, nxt):
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open('a') as f:
        f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} | {n}/{total} | completed {skill} | next {nxt}\n")


def run_skill(skill):
    prompt = f'''You are continuing the Porter skill rewrite program in /home/lobster/projects/porter.
Only edit files under skills/{skill}/.
Rewrite these files to world-class quality:
- skills/{skill}/SKILL.md
- skills/{skill}/prompt.md
- skills/{skill}/examples/README.md
- skills/{skill}/guides/qa-checklist.md
- skills/{skill}/meta/skill.json
Use web research where useful. Do not change Porter code. Keep boundaries sharp, examples practical, QA rigorous, metadata useful.
When finished, print exactly: DONE {skill}
'''
    cmd = ['codex', 'exec', '--full-auto', prompt]
    print(f"START {skill}", flush=True)
    proc = subprocess.Popen(
        cmd,
        cwd=str(ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
    )
    lines = []
    assert proc.stdout is not None
    for line in proc.stdout:
        sys.stdout.write(f"[{skill}] {line}")
        sys.stdout.flush()
        lines.append(line)
    code = proc.wait()
    out = ''.join(lines)
    print(f"END {skill} exit={code}", flush=True)
    return code, out, ''


def main():
    queue = load_queue()
    done = count_completed_by_fs(queue)
    while True:
        batch = next_skills(queue, done)
        if not batch:
            write_progress(queue, done, None)
            print(f"{len(done)}/{len(queue)} {progress_bar(len(done), len(queue))} done: all | current: none")
            return
        for skill in batch:
            code, out, err = run_skill(skill)
            if code != 0 or f'DONE {skill}' not in out:
                print(f'FAILED {skill}\nSTDOUT:\n{out}\nSTDERR:\n{err}', flush=True)
                return
            done.append(skill)
            remaining = [s for s in queue if s not in set(done)]
            current = remaining[0] if remaining else None
            write_progress(queue, done, current)
            append_log(len(done), len(queue), skill, current or 'none')
            print(f"{len(done)}/{len(queue)} {progress_bar(len(done), len(queue))} done: {skill} | current: {current or 'none'}", flush=True)
            time.sleep(SLEEP_SECONDS)

if __name__ == '__main__':
    main()
