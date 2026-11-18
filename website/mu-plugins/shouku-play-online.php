<?php
/**
 * Plugin Name: Shouku Play Online
 * Description: Adds a "Play online" section (and a button at the top) to every game page whose browser version exists in /play/<game>/. Delete this file to remove it.
 * Version: 1.0.0
 *
 * A game counts as playable online when public_html/play/<game slug>/index.html exists, so
 * publishing a new browser version is enough to make its section appear. The theme is not
 * changed: the section is added to the finished page just before the Download section.
 *
 * Source: https://github.com/shoukugames/shoukulauncher (website/)
 *
 * @package Shouku
 */

defined( 'ABSPATH' ) || exit;

/** Short notes for games that play a little differently in the browser. */
function shouku_play_notes() {
	return array(
		'beat-clap'   => array(
			'en' => 'Browsers can’t use the microphone here, so tap the screen or press Space to clap.',
			'ja' => 'ブラウザ版ではマイクを使いません。画面をタップするかスペースキーで手拍子します。',
		),
		'opennovella' => array(
			'en' => 'The browser version plays the demo story. The story editor needs the download.',
			'ja' => 'ブラウザ版ではデモの物語を遊べます。物語エディターはダウンロード版で使えます。',
		),
		'typestriker' => array(
			'en' => 'Best with a keyboard. On phones, use the on-screen keys and the ⌨ button.',
			'ja' => 'キーボードがおすすめです。スマホでは画面のキーと ⌨ ボタンを使います。',
		),
		'cyberdefence' => array(
			'en' => 'Best with a keyboard. On phones, use the on-screen keys and the ⌨ button.',
			'ja' => 'キーボードがおすすめです。スマホでは画面のキーと ⌨ ボタンを使います。',
		),
		'key-rush'    => array(
			'en' => 'Best with a keyboard. On touch screens, tap the keys on screen.',
			'ja' => 'キーボードがおすすめです。タッチ画面では画面のキーをタップします。',
		),
	);
}

/** Web address of the game's browser version, or '' when there is none. */
function shouku_play_url( $post ) {
	$slug = sanitize_title( $post->post_name );
	if ( '' === $slug || ! is_readable( ABSPATH . 'play/' . $slug . '/index.html' ) ) {
		return '';
	}
	return '/play/' . $slug . '/'; // Relative, so the language pack leaves it alone (no /ja/ copy exists).
}

/** A play triangle in the theme's icon style (the theme has no play icon). */
function shouku_play_icon() {
	return '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M7 4.500v15a1 1 0 0 0 1.500.860l12.300-7.500a1 1 0 0 0 0-1.720L8.500 3.640A1 1 0 0 0 7 4.500Z"/></svg>';
}

function shouku_play_is_ja() {
	return function_exists( 'shouku_lp_is_ja' ) && shouku_lp_is_ja();
}

function shouku_play_section( $post, $url ) {
	$ja    = shouku_play_is_ja();
	$title = get_the_title( $post );
	$notes = shouku_play_notes();
	$note  = isset( $notes[ $post->post_name ] ) ? $notes[ $post->post_name ][ $ja ? 'ja' : 'en' ] : '';
	$icon  = shouku_play_icon();
	$t     = $ja ? array(
		'eyebrow' => 'ダウンロード不要',
		'heading' => 'ブラウザで遊ぶ',
		'lead'    => sprintf( '%sをインストールせずに、今すぐブラウザで遊べます。', $title ),
		'button'  => '今すぐ遊ぶ',
		'points'  => array( 'パソコン・スマホ・タブレットで遊べます', '最初の読み込みには少し時間がかかります', 'セーブデータはこのブラウザに保存されます' ),
		'label'   => sprintf( '%sをブラウザで遊ぶ（新しいタブで開きます）', $title ),
	) : array(
		'eyebrow' => 'No download needed',
		'heading' => 'Play online',
		'lead'    => sprintf( 'Play %s right now in your web browser, with nothing to install.', $title ),
		'button'  => 'Play now',
		'points'  => array( 'Works on computers, phones and tablets', 'The first load takes a few seconds', 'Your progress is saved in this browser' ),
		'label'   => sprintf( 'Play %s in your browser (opens in a new tab)', $title ),
	);
	ob_start();
	?>
	<section class="game-section game-section--play" id="play">
		<div class="wrap">
			<p class="eyebrow eyebrow--dark reveal"><?php echo esc_html( $t['eyebrow'] ); ?></p>
			<h2 class="section-title reveal"><?php echo esc_html( $t['heading'] ); ?></h2>
			<div class="play-card reveal">
				<p class="play-card__lead"><?php echo esc_html( $t['lead'] ); ?></p>
				<a class="btn btn--sun btn--big" href="<?php echo esc_attr( $url ); ?>" target="_blank" rel="noopener" aria-label="<?php echo esc_attr( $t['label'] ); ?>"><?php echo $icon; // phpcs:ignore ?> <?php echo esc_html( $t['button'] ); ?></a>
				<ul class="play-card__points">
					<?php foreach ( $t['points'] as $point ) : ?>
						<li><?php echo esc_html( $point ); ?></li>
					<?php endforeach; ?>
				</ul>
				<?php if ( $note ) : ?>
					<p class="play-card__note"><?php echo esc_html( $note ); ?></p>
				<?php endif; ?>
			</div>
		</div>
	</section>
	<?php
	return ob_get_clean();
}

/* Add the section and the top button to the finished game page. */
add_action( 'template_redirect', function () {
	if ( ! is_singular( 'game' ) ) {
		return;
	}
	$post = get_queried_object();
	$url  = $post instanceof WP_Post ? shouku_play_url( $post ) : '';
	if ( '' === $url ) {
		return;
	}
	/* Built now: output handlers may not start buffers of their own. */
	$section = shouku_play_section( $post, $url );
	$button  = '<a class="btn btn--blue" href="#play">' . shouku_play_icon() . ' ' . esc_html( shouku_play_is_ja() ? 'ブラウザで遊ぶ' : 'Play online' ) . '</a>';
	ob_start( function ( $html ) use ( $section, $button ) {
		$dl  = '<section class="game-section game-section--dl" id="download">';
		$pos = strpos( $html, $dl );
		if ( false === $pos || false !== strpos( $html, 'id="play"' ) ) {
			return $html;
		}
		$html = substr_replace( $html, $section, $pos, 0 );

		/* "Play online" next to "Get the game" at the top. */
		$get = '<a class="btn btn--sun" href="#download">';
		$pos = strpos( $html, $get );
		if ( false !== $pos ) {
			$html = substr_replace( $html, $button, $pos, 0 );
		}
		return $html;
	} );
}, 1 ); // After the language pack's buffer (priority 0), so this runs first and the pack still sees the page.

add_action( 'wp_head', function () {
	if ( ! is_singular( 'game' ) ) {
		return;
	}
	?>
	<style id="shouku-play-online">
		.game-section--play { background: color-mix(in srgb, var(--accent) 10%, #fff); text-align: center; }
		.play-card { max-width: 720px; margin: 0 auto; padding: 32px 24px 26px; border: 6px solid #fff; border-radius: 34px; background: linear-gradient(#fff, #f4fbff); box-shadow: var(--shadow); }
		.play-card__lead { margin: 0 0 22px; font-size: 1.15rem; font-weight: 700; color: var(--ink); }
		.play-card .btn--big { padding: 16px 40px; font-size: 1.35rem; }
		.play-card__points { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px; margin: 26px 0 0; padding: 0; list-style: none; color: var(--ink-soft); font-size: .98rem; }
		.play-card__points li::before { content: "✓ "; color: var(--mint); font-weight: 900; }
		.play-card__note { margin: 16px auto 0; max-width: 560px; padding: 10px 16px; border-radius: 16px; background: var(--mist); color: var(--ink); font-size: .95rem; }
	</style>
	<?php
} );
