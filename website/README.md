# Launcher page on shoukugames.org

The **Shouku Launcher** tab (top right of the site menu) and the page at
<https://shoukugames.org/shouku-launcher/> (Japanese: `/ja/shouku-launcher/`).

| File | Goes to (on the server, under `public_html/`) | What it does |
|---|---|---|
| `mu-plugins/shouku-launcher.php` | `wp-content/mu-plugins/` | Adds the menu tab, the `[shouku_launcher_downloads]` cards and their styling |
| `page-en.html` | WordPress page `shouku-launcher` (via `create-page.php`) | English page text. After the first run it can also be edited in WordPress |
| `ja-content-entry.php` | Inserted into `wp-content/mu-plugins/shouku-language-pack/ja-content.php` | Japanese page text, used by the language pack |
| `create-page.php` | Run once with `php create-page.php ~/public_html` | Creates or updates the page |

The packages and the screenshots used on the page live in `wp-content/uploads/shouku-launcher/`:

```
ShoukuLauncher-Setup-<version>.exe
shouku-launcher_<version>_amd64.deb
SHA256SUMS.txt
store.jpg  game.jpg  library.jpg
```

## Publishing a new launcher version

1. `npm run dist && npm run check`
2. `cd dist && sha256sum shouku-launcher_*.deb ShoukuLauncher-Setup-*.exe > SHA256SUMS.txt`
3. Upload the two packages and `SHA256SUMS.txt` to `wp-content/uploads/shouku-launcher/`.
4. Change `SHOUKU_LAUNCHER_VERSION` in `mu-plugins/shouku-launcher.php` and upload it.
5. Update the version in the `apt install` command in the page text (English in WordPress,
   Japanese in `ja-content.php`).
