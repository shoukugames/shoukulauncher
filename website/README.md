# Launcher page on shoukugames.org

The **Shouku Launcher** tab (top right of the site menu) and the page at
<https://shoukugames.org/shouku-launcher/> (Japanese: `/ja/shouku-launcher/`).

| File | Goes to (on the server, under `public_html/`) | What it does |
|---|---|---|
| `mu-plugins/shouku-launcher.php` | `wp-content/mu-plugins/` | Adds the menu tab, the `[shouku_launcher_downloads]` cards and their styling |
| `mu-plugins/shouku-play-online.php` | `wp-content/mu-plugins/` | Adds a **Play online** section and top button to every game page whose browser version exists at `public_html/play/<game slug>/index.html` (English and Japanese) |
| `page-en.html` | WordPress page `shouku-launcher` (via `create-page.php`) | English page text. After the first run it can also be edited in WordPress |
| `ja-content-entry.php` | Inserted into `wp-content/mu-plugins/shouku-language-pack/ja-content.php` | Japanese page text, used by the language pack |
| `create-page.php` | Run once with `php create-page.php ~/public_html` | Creates or updates the page |

The packages and the screenshots used on the page live in `wp-content/uploads/shouku-launcher/`:

```
ShoukuLauncher-Setup-<windows version>.msi
shoukugames-<windows version>-win-x64.zip
shouku-launcher_<linux version>_amd64.deb
SHA256SUMS.txt
store.jpg  game.jpg  library.jpg
```

## Publishing a new launcher version

1. `npm run dist && npm run check`
2. `cd dist && sha256sum shouku-launcher_*.deb ShoukuLauncher-*.msi shoukugames-*.zip > SHA256SUMS.txt`
3. Upload the new packages and `SHA256SUMS.txt` to `wp-content/uploads/shouku-launcher/`.
4. Change `SHOUKU_LAUNCHER_WINDOWS_VERSION` and/or `SHOUKU_LAUNCHER_LINUX_VERSION` in
   `mu-plugins/shouku-launcher.php` and upload it.
5. Update the file names in the page text (English in WordPress, Japanese in `ja-content.php`):
   the `.msi` name in the Windows steps and the `apt install` command.

## Browser versions of the games

Each game's browser build lives in `public_html/play/<game slug>/` (the slug is the end of the game
page's address, e.g. `/games/chemtris/` → `/play/chemtris/`). As soon as a folder there has an
`index.html`, `shouku-play-online.php` shows the *Play online* section on that game's page; there is
nothing else to switch on. Notes for games that play differently in a browser (Beat Clap without a
microphone, OpenNovella's demo story, the typing games) are in `shouku_play_notes()`.

### The play page (`play/`)

`/play/<game slug>/` is a page in the site's look: the header pill, the game's accent colour, a
*Game page* back link and a *Full screen* button, with the game in a framed window loaded from
`/play/<game slug>/game/`. Japanese game pages link to `?lang=ja`, which makes the page Japanese.

- `play/shell.html` is that page; `play/games.json` holds each game's titles, accent colour,
  screenshot, screen size, where its browser build is (in `web-ports/`) and how it fits the frame:
  `native` games (pygame/pygbag) size themselves to the window, `scale` games (fixed 1280×720 web
  pages) run at their own size and are scaled to fit.
- `play/pygbag_loader.html` replaces pygbag's default loading screen in the pygame games with a
  themed loading card and a **Play** button (the click browsers require before a game may play sound).
- `python3 play/build_play.py --deploy [slug ...]` builds the pages into `play/stage/` and uploads
  them; the previous version of each game goes to `~/backups/play-<slug>-<date>` on the server.
  Run it again after rebuilding a game's browser version. Without `--deploy` it only builds.
