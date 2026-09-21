#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
repo_tidy.py — organise the Abhyas repo without breaking it.

USAGE
    python repo_tidy.py audit              # read-only: show current layout
    python repo_tidy.py tidy --apply       # move .gs files into ./gas/
    python repo_tidy.py purge --apply      # remove stale backup folders
    python repo_tidy.py check              # run tests/check.js + link verification
    python repo_tidy.py restore            # undo the last tidy

OPTIONS
    --apply        Actually perform the action. Default is dry-run.
    --root PATH    Repo root. Default: current working directory.
    --no-git       Do plain file moves; do not call git.
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# ── ANSI colours (work on Windows 10+ Terminal; harmless elsewhere) ─────
class C:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"

def _enable_ansi():
    if os.name == "nt":
        os.system("")   # triggers VT processing on modern Windows terminals

# ── File classification ─────────────────────────────────────────────────
# Files that MUST stay at the repository root. Moving any of these breaks
# the browser (relative <script>/<link> paths) or the service worker scope.

KEEP_AT_ROOT = {
    # HTML shell
    "index.html", "user.html", "admin.html", "privacy.html", "terms.html",
    # JS loaded by <script src="..."> in the pages
    "app.js", "objective.js", "subjective.js", "cloud-sync.js",
    "shared.js", "config.js", "version.js", "chapters-loader.js",
    "chapters-data.js", "subjective_chapters.js", "subjective-data.js",
    "pdf-viewer.js", "content-index.js", "firebase-config.js",
    # CSS
    "design-system.css",
    # Service worker — MUST be at the root for its ./ scope
    "sw.js",
    # Meta and icons
    "manifest.json", "robots.txt", "sitemap.xml", "CNAME",
    "favicon.png", "icon-192.png", "icon-512.png",
    "README.md", "Readme.md",
    ".gitignore", "package.json",
}

# Files that belong in ./gas/ (they are pasted into the Apps Script editor
# by hand; their on-disk location has no bearing on the browser or tests).
GAS_FILES = {"code.gs", "setup.gs", "debug.gs",
             "private-files.gs", "content-index.gs"}

# Folders that must not be touched by tidy.
PROTECTED_DIRS = {".git", "vendor", "tests", ".github", "gas"}

# Folders and files that are safe to delete with `purge`.
PURGE_PATTERNS = [
    re.compile(r"^\.patch-backup-\d+\.\d+$"),
    re.compile(r"^\.fix-backup-\d+"),
    re.compile(r"^\.finish-fix-backup-\d+"),
    re.compile(r"^\.repo-tidy-backup-\d+"),
]
PURGE_FILE_PATTERNS = [re.compile(r"\.bak$"), re.compile(r"\.orig$")]


def colour(msg, col):
    return f"{col}{msg}{C.RESET}"


def say(msg=""):
    print(msg)


# ── Git awareness ───────────────────────────────────────────────────────

def in_git(root: Path) -> bool:
    return (root / ".git").exists() and shutil.which("git") is not None


def git_tracked(root: Path, rel: str) -> bool:
    try:
        r = subprocess.run(["git", "ls-files", "--error-unmatch", rel],
                           cwd=root, capture_output=True, text=True)
        return r.returncode == 0
    except Exception:
        return False


def git_move(root: Path, src: str, dst: str, dry: bool) -> bool:
    if dry:
        return True
    try:
        r = subprocess.run(["git", "mv", src, dst],
                           cwd=root, capture_output=True, text=True)
        return r.returncode == 0
    except Exception:
        return False


# ── Layout inspection ───────────────────────────────────────────────────

def find_repo_root(start: Path) -> Path:
    for p in [start] + list(start.parents):
        if (p / ".git").exists():
            return p
    return start


def classify(root: Path):
    """Return {category: [names]} for every file and folder in root."""
    cats = {
        "keep": [],           # must stay at root
        "gas": [],            # should move to gas/
        "protected": [],      # vendor, tests, .github, .git
        "junk": [],           # backups, .bak files
        "unknown": [],        # anything else — we will not touch it
    }
    for entry in sorted(os.listdir(root)):
        p = root / entry
        if entry in PROTECTED_DIRS:
            cats["protected"].append(entry)
            continue
        if any(rx.match(entry) for rx in PURGE_PATTERNS):
            cats["junk"].append(entry)
            continue
        if p.is_file() and any(rx.search(entry) for rx in PURGE_FILE_PATTERNS):
            cats["junk"].append(entry)
            continue
        if p.is_dir():
            cats["unknown"].append(entry)
            continue
        if entry in KEEP_AT_ROOT:
            cats["keep"].append(entry)
        elif entry in GAS_FILES:
            cats["gas"].append(entry)
        else:
            cats["unknown"].append(entry)
    return cats


def fmt_size(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def file_size(p: Path):
    try:
        return fmt_size(p.stat().st_size)
    except OSError:
        return "?"


# ── Commands ────────────────────────────────────────────────────────────

def cmd_audit(root: Path, _args):
    say(colour(f"Repo:  {root}", C.BOLD))
    say()
    cats = classify(root)

    def show(title, names, col=C.CYAN):
        if not names:
            return
        say(colour(f"  {title}", col))
        for n in names:
            p = root / n
            if p.is_dir():
                size = "(dir)"
            else:
                size = file_size(p)
            say(f"    {n:<32} {C.DIM}{size}{C.RESET}")
        say()

    show(f"Keep at root ({len(cats['keep'])})", cats["keep"], C.GREEN)
    show(f"Should move to gas/ ({len(cats['gas'])})", cats["gas"], C.YELLOW)
    show(f"Protected ({len(cats['protected'])})", cats["protected"], C.DIM)
    show(f"Junk — safe to purge ({len(cats['junk'])})", cats["junk"], C.RED)
    show(f"Unknown — will not touch ({len(cats['unknown'])})", cats["unknown"], C.MAGENTA)

    # Case-insensitive collisions (Windows cannot tell README.md from Readme.md;
    # git on Linux treats them as different files, which causes real bugs).
    lower = {}
    for entry in os.listdir(root):
        key = entry.lower()
        lower.setdefault(key, []).append(entry)
    collisions = {k: v for k, v in lower.items() if len(v) > 1}
    if collisions:
        say(colour("  Case collisions:", C.RED))
        for k, v in collisions.items():
            say(f"    {k}  ←  {v}")
        say()

    if cats["gas"]:
        say(colour(f"Run  python repo_tidy.py tidy --apply  to move "
                   f"{len(cats['gas'])} .gs file(s) into ./gas/", C.CYAN))
    if cats["junk"]:
        say(colour(f"Run  python repo_tidy.py purge --apply  to remove "
                   f"{len(cats['junk'])} stale item(s)", C.CYAN))
    say()


def _backup_root(root: Path) -> Path:
    ts = time.strftime("%Y%m%d-%H%M%S")
    return root / f".repo-tidy-backup-{ts}"


def cmd_tidy(root: Path, args):
    dry = not args.apply
    cats = classify(root)

    if not cats["gas"] and not _has_readme_collision(root):
        say(colour("Nothing to tidy. Run `audit` to see the layout.", C.YELLOW))
        return 0

    backup = _backup_root(root)
    gas_dir = root / "gas"
    moved = 0
    skipped = 0

    if cats["gas"]:
        say(colour(f"Moving {len(cats['gas'])} .gs file(s) into ./gas/", C.BOLD))
        if not dry:
            gas_dir.mkdir(exist_ok=True)
            backup.mkdir(exist_ok=True)
        for name in cats["gas"]:
            src = root / name
            dst = gas_dir / name
            if dst.exists():
                say(f"  {C.YELLOW}skip{C.RESET} {name}  (already in gas/)")
                skipped += 1
                continue
            say(f"  {C.GREEN}move{C.RESET} {name}  ->  gas/{name}")
            if not dry:
                shutil.copy2(src, backup / name)
                if args.no_git or not in_git(root) or not git_tracked(root, name):
                    shutil.move(str(src), str(dst))
                else:
                    if not git_move(root, name, str(dst.relative_to(root)), dry=False):
                        shutil.move(str(src), str(dst))
            moved += 1
    # README handling removed on 2026-09-21. Windows treats README.md and
    # Readme.md as the same file, and the merge logic above could delete
    # the file entirely. If you ever need to rename the README, do it by
    # hand with: git mv Readme.md README.md

    say()
    if dry:
        say(colour("Dry run. Nothing was written.", C.YELLOW))
        say(f"Run again with  --apply  to do it. "
            f"Backups will land in {backup.name}/.")
    else:
        say(colour(f"Done. {moved} moved, {skipped} skipped.", C.GREEN))
        say(f"Backup: {backup.relative_to(root)}/")
    return 0


def _has_readme_collision(root: Path) -> bool:
    return (root / "README.md").exists() and (root / "Readme.md").exists()


def cmd_purge(root: Path, args):
    dry = not args.apply
    cats = classify(root)
    junk = cats["junk"]
    if not junk:
        say(colour("Nothing to purge.", C.YELLOW))
        return 0
    say(colour(f"Removing {len(junk)} stale item(s)", C.BOLD))
    removed = 0
    for name in junk:
        p = root / name
        kind = "dir " if p.is_dir() else "file"
        say(f"  {C.RED}rm{C.RESET} {kind} {name}")
        if not dry:
            try:
                if p.is_dir():
                    shutil.rmtree(p)
                else:
                    p.unlink()
                removed += 1
            except OSError as ex:
                say(f"    {C.YELLOW}could not remove: {ex}{C.RESET}")
    say()
    if dry:
        say(colour("Dry run. Nothing was removed.", C.YELLOW))
    else:
        say(colour(f"Removed {removed} item(s).", C.GREEN))
    return 0


def cmd_check(root: Path, _args):
    say(colour("Checking for broken references", C.BOLD))
    ok = True

    # 1. node tests/check.js if it exists
    tests = root / "tests" / "check.js"
    if tests.exists():
        if shutil.which("node"):
            say("  running node tests/check.js")
            r = subprocess.run(["node", str(tests.relative_to(root))],
                               cwd=root, capture_output=True)
            out = (r.stdout or b"").decode("utf-8", errors="replace")
            for ln in out.splitlines()[-15:]:
                say(f"    {ln}")
            if r.returncode != 0:
                ok = False
                say(colour("  tests failed", C.RED))
            else:
                say(colour("  tests passed", C.GREEN))
        else:
            say(colour("  node not installed; skipping tests", C.YELLOW))
    else:
        say(colour("  tests/check.js not found", C.YELLOW))

    # 2. Verify HTML <script>/<link> targets exist
    htmls = [f for f in KEEP_AT_ROOT if f.endswith(".html")]
    missing = []
    for html in htmls:
        p = root / html
        if not p.exists():
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(r'(?:src|href)="([^"#?]+)', text):
            u = m.group(1)
            if u.startswith(("http", "//", "data:", "mailto:", "tel:")):
                continue
            target = root / u.lstrip("/")
            if not target.exists():
                missing.append(f"{html} -> {u}")
    if missing:
        ok = False
        say(colour(f"  {len(missing)} broken reference(s):", C.RED))
        for m in missing:
            say(f"    {m}")
    else:
        say(colour("  every <script>/<link> target exists", C.GREEN))

    # 3. sw.js SHELL entries exist
    sw = root / "sw.js"
    if sw.exists():
        text = sw.read_text(encoding="utf-8", errors="replace")
        m = re.search(r"const SHELL\s*=\s*\[(.*?)\];", text, re.S)
        if m:
            entries = re.findall(r"'\./([^']+)'", m.group(1))
            bad = [e for e in entries if e and not (root / e).exists()]
            if bad:
                ok = False
                say(colour(f"  {len(bad)} sw.js SHELL entry(ies) missing:", C.RED))
                for b in bad:
                    say(f"    ./{b}")
            else:
                say(colour("  every sw.js SHELL entry exists", C.GREEN))

    say()
    return 0 if ok else 1


def cmd_restore(root: Path, args):
    backups = sorted(
        [d for d in root.iterdir()
         if d.is_dir() and d.name.startswith(".repo-tidy-backup-")],
        reverse=True,
    )
    if not backups:
        say(colour("No .repo-tidy-backup-* folder found.", C.YELLOW))
        return 0
    latest = backups[0]
    say(colour(f"Restoring from {latest.name}/", C.BOLD))
    for src in latest.iterdir():
        if not src.is_file():
            continue
        dst = root / src.name
        say(f"  restore {src.name}")
        if args.apply:
            shutil.copy2(src, dst)
    say()
    if args.apply:
        say(colour("Restored. Delete the backup folder when you are happy.",
                   C.GREEN))
    else:
        say(colour("Dry run. Add --apply to actually restore.", C.YELLOW))
    return 0


# ── CLI ─────────────────────────────────────────────────────────────────

def main():
    _enable_ansi()
    ap = argparse.ArgumentParser(
        description="Organise the Abhyas repo without breaking it.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("command", choices=["audit", "tidy", "purge", "check", "restore"])
    ap.add_argument("--apply", action="store_true",
                    help="perform the action (default: dry run for tidy/purge/restore)")
    ap.add_argument("--root", type=Path, default=None,
                    help="repo root (default: current directory, walked up to find .git)")
    ap.add_argument("--no-git", action="store_true",
                    help="use plain file moves; do not call git mv")
    args = ap.parse_args()

    start = args.root if args.root else Path.cwd()
    root = find_repo_root(start)
    if not root.is_dir():
        say(colour(f"Not a directory: {root}", C.RED))
        return 1

    say(colour("repo_tidy.py", C.BOLD))
    say(colour("=" * 60, C.DIM))

    if args.command == "audit":
        return cmd_audit(root, args)
    if args.command == "tidy":
        return cmd_tidy(root, args)
    if args.command == "purge":
        return cmd_purge(root, args)
    if args.command == "check":
        return cmd_check(root, args)
    if args.command == "restore":
        return cmd_restore(root, args)
    return 0


if __name__ == "__main__":
    sys.exit(main())