#!/usr/bin/env python3
"""Build (and optionally upload) the themed browser-play pages: https://shoukugames.org/play/<slug>/

Each game gets a page in the website's look (shell.html: header pill, back link, full screen button)
with the game running in a frame from play/<slug>/game/. pygbag games also get a themed loading
card with a Play button (pygbag_loader.html) in place of pygbag's default loading screen.

    python3 build_play.py                    build every game into the stage folder
    python3 build_play.py chemtris geograsp  only these
    python3 build_play.py --deploy [slug...] build and upload (previous version -> ~/backups on the server)

The games' browser builds come from WEB_PORTS (default ../../../web-ports), path per game in games.json.
"""
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB_PORTS = os.environ.get("WEB_PORTS", os.path.normpath(os.path.join(HERE, "../../../web-ports")))
STAGE = os.environ.get("PLAY_STAGE", os.path.join(HERE, "stage"))
SSH = os.environ.get("PLAY_SSH", "shoukugames@shoukugames.org")
MARK = "<!-- shouku: themed loader -->"


def fill(template, game):
    values = {
        "SLUG": game["slug"], "ACCENT": game["accent"], "IMAGE": game["image"],
        "W": str(game["w"]), "H": str(game["h"]), "FIT": game.get("fit", "native"),
        "TITLE_EN": game["title_en"].replace("&", "&amp;").replace("<", "&lt;"),
        "TITLE_EN_JS": json.dumps(game["title_en"]), "TITLE_JA_JS": json.dumps(game["title_ja"]),
    }
    for key, value in values.items():
        template = template.replace("{{" + key + "}}", value)
    assert "{{" not in template, template[template.index("{{"):][:40]
    return template


def theme_pygbag(index_html, game):
    with open(index_html, encoding="utf-8") as handle:
        page = handle.read()
    if "pythons.js" not in page or MARK in page:
        return False
    with open(os.path.join(HERE, "pygbag_loader.html"), encoding="utf-8") as handle:
        loader = fill(handle.read(), game)
    page = page.replace('platform.document.body.style.background = "#7f7f7f"',
                        'platform.document.body.style.background = "#0d2a44"')
    page = page.replace("background-color:powderblue;", "background-color:#0d2a44;")
    page = page.replace("</body>", loader + "</body>", 1)
    with open(index_html, "w", encoding="utf-8") as handle:
        handle.write(page)
    return True


def build(game):
    src = os.path.join(WEB_PORTS, game["src"])
    if not os.path.isfile(os.path.join(src, "index.html")):
        raise SystemExit(f"{game['slug']}: no index.html in {src}")
    out = os.path.join(STAGE, game["slug"])
    shutil.rmtree(out, ignore_errors=True)
    shutil.copytree(src, os.path.join(out, "game"), ignore=shutil.ignore_patterns(".git"))
    themed = theme_pygbag(os.path.join(out, "game", "index.html"), game)
    with open(os.path.join(HERE, "shell.html"), encoding="utf-8") as handle:
        page = fill(handle.read(), game)
    with open(os.path.join(out, "index.html"), "w", encoding="utf-8") as handle:
        handle.write(page)
    return out, themed


def deploy(out, slug):
    remote = f"""set -e
P=~/public_html/play; mkdir -p $P; chmod 755 $P
rm -rf $P/.{slug}-new; mkdir $P/.{slug}-new; tar -xzf - -C $P/.{slug}-new
find $P/.{slug}-new -type d -exec chmod 755 {{}} +; find $P/.{slug}-new -type f -exec chmod 644 {{}} +
if [ -d $P/{slug} ]; then B=~/backups/play-{slug}-$(date +%Y%m%d-%H%M%S); mkdir -p ~/backups; mv $P/{slug} $B; echo "  previous version -> $B"; fi
mv $P/.{slug}-new $P/{slug}"""
    tar = subprocess.Popen(["tar", "-C", out, "-czf", "-", "."], stdout=subprocess.PIPE)
    subprocess.run(["ssh", SSH, remote], stdin=tar.stdout, check=True)
    tar.wait()


def main(argv):
    upload = "--deploy" in argv
    wanted = [a for a in argv if not a.startswith("--")]
    with open(os.path.join(HERE, "games.json"), encoding="utf-8") as handle:
        games = json.load(handle)
    unknown = set(wanted) - {g["slug"] for g in games}
    if unknown:
        raise SystemExit(f"unknown game(s): {', '.join(sorted(unknown))}")
    for game in games:
        if wanted and game["slug"] not in wanted:
            continue
        out, themed = build(game)
        print(f"{game['slug']}: built{' (pygbag loader themed)' if themed else ''}")
        if upload:
            deploy(out, game["slug"])
            print(f"  live: https://shoukugames.org/play/{game['slug']}/")


if __name__ == "__main__":
    main(sys.argv[1:])
