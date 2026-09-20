#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
vendor-assets.py - self-host third-party assets so the app works fully offline.

Downloads (from the npm registry, exact versions) into ./vendor/ :
    pdf.js 3.11.174, pdf-lib 1.17.1, KaTeX 0.16.9 (+ fonts), canvas-confetti 1.9.3,
    Inter and JetBrains Mono (latin) as woff2
then points index.html / user.html / admin.html / subjective.js at the local copies
and adds them to the service-worker precache list (sw.js).

Safe to re-run. Nothing is changed unless every download succeeds.
Usage:  python vendor-assets.py
"""
import io
import os
import re
import sys
import tarfile
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
REG = "https://registry.npmjs.org/"
PKGS = {
    "pdfjs": REG + "pdfjs-dist/-/pdfjs-dist-3.11.174.tgz",
    "pdflib": REG + "pdf-lib/-/pdf-lib-1.17.1.tgz",
    "katex": REG + "katex/-/katex-0.16.9.tgz",
    "confetti": REG + "canvas-confetti/-/canvas-confetti-1.9.3.tgz",
    "inter": REG + "@fontsource/inter/-/inter-5.0.20.tgz",
    "mono": REG + "@fontsource/jetbrains-mono/-/jetbrains-mono-5.0.20.tgz",
}
INTER_WEIGHTS = [400, 500, 600, 700, 800]
MONO_WEIGHTS = [400, 500, 700]


def load_tar(url):
    req = urllib.request.Request(url, headers={"User-Agent": "abhyas-vendor/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = r.read()
    return tarfile.open(fileobj=io.BytesIO(data), mode="r:gz")


def member(tar, name):
    f = tar.extractfile(name)
    if f is None:
        raise KeyError(name)
    return f.read()


def gather():
    out = {}
    print("Downloading (about 20 MB, once) ...")

    t = load_tar(PKGS["pdfjs"])
    out["vendor/pdfjs/pdf.min.js"] = member(t, "package/build/pdf.min.js")
    out["vendor/pdfjs/pdf.worker.min.js"] = member(t, "package/build/pdf.worker.min.js")
    print("  pdf.js ok")

    t = load_tar(PKGS["pdflib"])
    out["vendor/pdf-lib/pdf-lib.min.js"] = member(t, "package/dist/pdf-lib.min.js")
    print("  pdf-lib ok")

    t = load_tar(PKGS["katex"])
    out["vendor/katex/katex.min.js"] = member(t, "package/dist/katex.min.js")
    out["vendor/katex/katex.min.css"] = member(t, "package/dist/katex.min.css")
    out["vendor/katex/auto-render.min.js"] = member(t, "package/dist/contrib/auto-render.min.js")
    for name in t.getnames():
        if name.startswith("package/dist/fonts/") and name.endswith(".woff2"):
            out["vendor/katex/fonts/" + os.path.basename(name)] = member(t, name)
    print("  KaTeX ok")

    t = load_tar(PKGS["confetti"])
    out["vendor/confetti/confetti.browser.js"] = member(t, "package/dist/confetti.browser.js")
    print("  confetti ok")

    css = []
    t = load_tar(PKGS["inter"])
    for w in INTER_WEIGHTS:
        fn = "inter-latin-%d-normal.woff2" % w
        out["vendor/fonts/" + fn] = member(t, "package/files/" + fn)
        css.append("@font-face{font-family:'Inter';font-style:normal;font-weight:%d;font-display:swap;src:url(%s) format('woff2');}" % (w, fn))
    t = load_tar(PKGS["mono"])
    for w in MONO_WEIGHTS:
        fn = "jetbrains-mono-latin-%d-normal.woff2" % w
        out["vendor/fonts/" + fn] = member(t, "package/files/" + fn)
        css.append("@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:%d;font-display:swap;src:url(%s) format('woff2');}" % (w, fn))
    out["vendor/fonts/fonts.css"] = ("/* Inter + JetBrains Mono, latin, self-hosted */\n" + "\n".join(css) + "\n").encode("utf-8")
    print("  fonts ok")
    return out


def read_text(rel):
    p = os.path.join(HERE, rel)
    if not os.path.exists(p):
        return None, False
    with open(p, "rb") as fh:
        raw = fh.read().decode("utf-8")
    return raw.replace("\r\n", "\n"), ("\r\n" in raw)


def write_text(rel, text, crlf):
    with open(os.path.join(HERE, rel), "wb") as fh:
        fh.write((text.replace("\n", "\r\n") if crlf else text).encode("utf-8"))


def sub_file(rel, subs):
    text, crlf = read_text(rel)
    if text is None:
        return 0
    n = 0
    for pat, rep in subs:
        text, c = re.subn(pat, lambda m, r=rep: r, text)
        n += c
    if n:
        write_text(rel, text, crlf)
    return n


def main():
    try:
        files = gather()
    except Exception as ex:
        print("\nCould not download everything (%s)." % ex)
        print("Nothing was changed. Check your internet connection and run again.")
        return 1

    for rel, data in files.items():
        p = os.path.join(HERE, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as fh:
            fh.write(data)
    print("Wrote %d files into vendor/" % len(files))

    fonts_link = (r'<link href="https://fonts\.googleapis\.com/css2[^"]*"\s+rel="stylesheet">',
                  '<link rel="stylesheet" href="vendor/fonts/fonts.css">')
    changed = 0
    changed += sub_file("index.html", [fonts_link])
    changed += sub_file("admin.html", [
        fonts_link,
        (r'src="https://cdnjs\.cloudflare\.com/ajax/libs/pdf\.js/3\.11\.174/pdf\.min\.js"', 'src="vendor/pdfjs/pdf.min.js"'),
        (r'src="https://cdnjs\.cloudflare\.com/ajax/libs/pdf-lib/1\.17\.1/pdf-lib\.min\.js"', 'src="vendor/pdf-lib/pdf-lib.min.js"'),
        (r'"https://cdnjs\.cloudflare\.com/ajax/libs/pdf\.js/3\.11\.174/pdf\.worker\.min\.js"', '"vendor/pdfjs/pdf.worker.min.js"'),
    ])
    changed += sub_file("user.html", [
        fonts_link,
        (r'href="https://cdnjs\.cloudflare\.com/ajax/libs/KaTeX/0\.16\.9/katex\.min\.css"', 'href="vendor/katex/katex.min.css"'),
        (r'src="https://cdnjs\.cloudflare\.com/ajax/libs/KaTeX/0\.16\.9/katex\.min\.js"', 'src="vendor/katex/katex.min.js"'),
        (r'src="https://cdnjs\.cloudflare\.com/ajax/libs/KaTeX/0\.16\.9/contrib/auto-render\.min\.js"', 'src="vendor/katex/auto-render.min.js"'),
        (r'src="https://cdn\.jsdelivr\.net/npm/canvas-confetti@1\.9\.3/dist/confetti\.browser\.min\.js"', 'src="vendor/confetti/confetti.browser.js"'),
    ])
    changed += sub_file("subjective.js", [
        (r"https://cdnjs\.cloudflare\.com/ajax/libs/pdf-lib/1\.17\.1/pdf-lib\.min\.js", "vendor/pdf-lib/pdf-lib.min.js"),
    ])

    # service worker precache list
    text, crlf = read_text("sw.js")
    if text is not None and "'./vendor/katex/katex.min.js'" not in text:
        extra = ["./vendor/pdf-lib/pdf-lib.min.js", "./vendor/katex/katex.min.js",
                 "./vendor/katex/katex.min.css", "./vendor/katex/auto-render.min.js",
                 "./vendor/confetti/confetti.browser.js", "./vendor/fonts/fonts.css"]
        extra += sorted("./" + k for k in files if k.startswith("vendor/katex/fonts/") or
                        (k.startswith("vendor/fonts/") and k.endswith(".woff2")))
        marker = "'./vendor/pdfjs/pdf.worker.min.js'"
        if marker in text:
            block = marker + ",\n" + ",\n".join("  '%s'" % e for e in extra)
            write_text("sw.js", text.replace(marker, block, 1), crlf)
            changed += 1
        else:
            print("Note: could not find the pdf.js line in sw.js SHELL; add the vendor files there by hand.")

    print("Updated references in %d place(s)." % changed)
    print("\nDone. Reload the site once so the service worker caches the new files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
