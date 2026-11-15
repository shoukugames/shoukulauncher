<?php
/**
 * Plugin Name: Shouku Launcher Page
 * Description: Adds the "Shouku Launcher" tab to the top right of the main menu and the download cards ([shouku_launcher_downloads]) used on the /shouku-launcher/ page. Delete this file to remove it.
 * Version: 1.1.1
 *
 * The page text itself lives in WordPress (Pages → Shouku Launcher); the Japanese version is in
 * shouku-language-pack/ja-content.php under 'shouku-launcher'. The two packages live in
 * wp-content/uploads/shouku-launcher/. To publish a new launcher version, upload the new files
 * there and change the version below. Windows and Linux have their own version numbers.
 * Windows ships as an MSI (Windows Installer) plus a portable ZIP; no self-extracting .exe.
 *
 * Source: https://github.com/shoukugames/shoukulauncher (website/)
 *
 * @package Shouku
 */

defined( 'ABSPATH' ) || exit;

define( 'SHOUKU_LAUNCHER_WINDOWS_VERSION', '1.1.1' );
define( 'SHOUKU_LAUNCHER_LINUX_VERSION', '1.0.0' );
define( 'SHOUKU_LAUNCHER_SLUG', 'shouku-launcher' );
define( 'SHOUKU_LAUNCHER_REPO', 'https://github.com/shoukugames/shoukulauncher' );

function shouku_launcher_is_ja() {
	return function_exists( 'shouku_lp_is_ja' ) && shouku_lp_is_ja();
}

/** The two packages: one per operating system. */
function shouku_launcher_files() {
	$win  = SHOUKU_LAUNCHER_WINDOWS_VERSION;
	$lin  = SHOUKU_LAUNCHER_LINUX_VERSION;
	$up   = wp_get_upload_dir();
	$dir  = trailingslashit( $up['basedir'] ) . 'shouku-launcher/';
	$url  = trailingslashit( $up['baseurl'] ) . 'shouku-launcher/';
	$list = array(
		'windows'     => "ShoukuLauncher-Setup-$win.msi",
		'windows_zip' => "shoukugames-$win-win-x64.zip",
		'linux'       => "shouku-launcher_{$lin}_amd64.deb",
	);
	$out  = array();
	foreach ( $list as $key => $name ) {
		$path        = $dir . $name;
		$out[ $key ] = array(
			'name' => $name,
			'url'  => $url . rawurlencode( $name ),
			'size' => is_readable( $path ) ? size_format( filesize( $path ), 0 ) : '',
		);
	}
	$out['sums'] = is_readable( $dir . 'SHA256SUMS.txt' ) ? $url . 'SHA256SUMS.txt' : '';
	return $out;
}

/* ---------- The tab, at the far right of the main menu ---------- */

add_filter( 'wp_nav_menu_items', function ( $items, $args ) {
	if ( empty( $args->theme_location ) || 'primary' !== $args->theme_location ) {
		return $items;
	}
	$current = is_page( SHOUKU_LAUNCHER_SLUG );
	return $items . sprintf(
		'<li class="menu-item launcher-tab%1$s"><a href="%2$s"%3$s>%4$s</a></li>',
		$current ? ' current-menu-item' : '',
		esc_url( home_url( '/' . SHOUKU_LAUNCHER_SLUG . '/' ) ),
		$current ? ' aria-current="page"' : '',
		shouku_launcher_is_ja() ? 'Shoukuランチャー' : 'Shouku Launcher'
	);
}, 20, 2 ); // After the language pack's English / 日本語 switch (priority 10).

/* ---------- Download cards ---------- */

add_shortcode( 'shouku_launcher_downloads', function () {
	$ja    = shouku_launcher_is_ja();
	$files = shouku_launcher_files();
	$icon  = function ( $name ) {
		return function_exists( 'shouku_icon' ) ? shouku_icon( $name ) : '';
	};
	$cards = array(
		'windows' => array(
			'title' => 'Windows',
			'what'  => $ja ? 'MSIインストーラー（Windows インストーラー）' : 'MSI installer (Windows Installer)',
			'ver'   => SHOUKU_LAUNCHER_WINDOWS_VERSION,
			'for'   => $ja ? 'Windows 10 / 11（64ビット）' : 'Windows 10 and 11 (64-bit)',
			'games' => $ja ? 'Windows用ゲーム（.exe）だけを表示します' : 'Shows Windows games (.exe) only',
		),
		'linux'   => array(
			'title' => 'Debian / Ubuntu',
			'what'  => $ja ? 'DEBパッケージ（dpkg / apt）' : 'DEB package (dpkg / apt)',
			'ver'   => SHOUKU_LAUNCHER_LINUX_VERSION,
			'for'   => $ja ? 'Debian・Ubuntuとその派生ディストリビューション（64ビット）' : 'Debian, Ubuntu and distributions based on them (64-bit)',
			'games' => $ja ? 'Linux用ゲーム（.deb）だけを表示します' : 'Shows Linux games (.deb) only',
		),
	);
	$html = '<div class="dl-grid launcher-dl">';
	foreach ( $cards as $key => $c ) {
		$f     = $files[ $key ];
		$ready = '' !== $f['size'];
		$html .= '<div class="dl dl--' . esc_attr( $key ) . ' ' . ( $ready ? 'is-ready' : 'is-empty' ) . '">';
		$html .= '<span class="dl__ico">' . $icon( $key ) . '</span>';
		$html .= '<h3 class="dl__name">' . esc_html( $c['title'] ) . ' <span class="launcher-dl__ver">v' . esc_html( $c['ver'] ) . '</span></h3>';
		$html .= '<p class="launcher-dl__what">' . esc_html( $c['what'] ) . '</p>';
		if ( $ready ) {
			$html .= '<p class="dl__file">' . esc_html( $f['name'] ) . ' <span>&middot; ' . esc_html( $f['size'] ) . '</span></p>';
			$html .= '<a class="btn btn--blue" href="' . esc_url( $f['url'] ) . '" download data-confetti>' . $icon( 'down' ) . ' ' . ( $ja ? 'ダウンロード' : 'Download' ) . '</a>';
			if ( 'windows' === $key && '' !== $files['windows_zip']['size'] ) {
				$z     = $files['windows_zip'];
				$html .= '<p class="launcher-dl__alt">' . sprintf(
					$ja ? 'または <a href="%1$s" download>ポータブル版ZIP</a>（%2$s・インストール不要、展開して実行）' : 'or the <a href="%1$s" download>portable ZIP</a> (%2$s, no install: extract and run)',
					esc_url( $z['url'] ),
					esc_html( $z['size'] )
				) . '</p>';
			}
		} else {
			$html .= '<p class="dl__file">' . ( $ja ? '近日公開' : 'Coming soon' ) . '</p>';
		}
		$html .= '<p class="launcher-dl__for">' . esc_html( $c['for'] ) . '<br><strong>' . esc_html( $c['games'] ) . '</strong></p>';
		$html .= '</div>';
	}
	$html .= '</div>';
	$html .= '<p class="launcher-dl__meta">' . sprintf(
		$ja ? 'Windows版 %1$s ・ Linux版 %4$s ・ <a href="%2$s">SHA-256チェックサム</a> ・ <a href="%3$s">ソースコード（GitHub）</a>' : 'Windows %1$s &middot; Linux %4$s &middot; <a href="%2$s">SHA-256 checksums</a> &middot; <a href="%3$s">Source code on GitHub</a>',
		esc_html( SHOUKU_LAUNCHER_WINDOWS_VERSION ),
		esc_url( $files['sums'] ? $files['sums'] : SHOUKU_LAUNCHER_REPO ),
		esc_url( SHOUKU_LAUNCHER_REPO ),
		esc_html( SHOUKU_LAUNCHER_LINUX_VERSION )
	) . '</p>';
	return $html;
} );

/*
 * The language pack swaps in the Japanese page body at priority 99, after WordPress has run
 * shortcodes (priority 11), so run them once more on this page.
 */
add_filter( 'the_content', function ( $content ) {
	return is_page( SHOUKU_LAUNCHER_SLUG ) ? do_shortcode( $content ) : $content;
}, 100 );

/* ---------- Styling ---------- */

add_action( 'wp_enqueue_scripts', function () {
	$css = '
.site-nav__list > .launcher-tab { margin-left: 8px; }
.site-nav__list > .launcher-tab > a { background: var(--sun); color: #5c3b00; font-weight: 600; white-space: nowrap; box-shadow: 0 4px 0 var(--sun-deep); }
.site-nav__list > .launcher-tab > a:hover, .site-nav__list > .launcher-tab:focus-within > a { background: #ffd56e; }
.site-nav__list > .launcher-tab.current-menu-item > a { background: var(--blue-deep); color: #fff; box-shadow: 0 4px 0 var(--ink); }
@media (max-width: 860px) { .site-nav__list > .launcher-tab { margin: 10px 0 6px 12px; align-self: flex-start; } }
.launcher-dl { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 18px; }
.launcher-dl .dl { text-align: center; }
.launcher-dl__what { margin: 0; font: 600 1.05rem/1.3 var(--display); color: var(--blue-deep); }
.launcher-dl__for { margin: 8px 0 0; font-size: .95rem; color: var(--ink-soft); }
.launcher-dl__for strong { color: var(--ink); }
.launcher-dl__ver { font-size: .8em; color: var(--ink-soft); font-weight: 500; }
.launcher-dl__alt { margin: 4px 0 0; font-size: .92rem; color: var(--ink-soft); }
.launcher-dl__meta { text-align: center; font-size: .95rem; color: var(--ink-soft); }
.launcher-shot { margin: 0 0 1.4em; }
.launcher-shot img { display: block; width: 100%; height: auto; border-radius: 18px; box-shadow: var(--shadow); }
.launcher-shot figcaption { margin-top: 8px; font-size: .9rem; text-align: center; color: var(--ink-soft); }
.launcher-shots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.prose pre.launcher-cmd { margin: .6em 0 1em; padding: 14px 18px; border-radius: 16px; background: var(--ink); color: #eaf7fd; overflow-x: auto; font-size: .95rem; }
.prose ol { margin: .8em 0; padding-left: 1.6em; }
.prose ol li { margin: 6px 0; padding-left: 4px; }
@media (max-width: 640px) { .launcher-dl, .launcher-shots { grid-template-columns: 1fr; } }
';
	wp_register_style( 'shouku-launcher', false, array( 'shouku' ), SHOUKU_LAUNCHER_WINDOWS_VERSION );
	wp_enqueue_style( 'shouku-launcher' );
	wp_add_inline_style( 'shouku-launcher', $css );
}, 30 );
