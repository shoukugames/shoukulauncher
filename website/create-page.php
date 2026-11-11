<?php
/**
 * Creates or updates the "Shouku Launcher" page from page-en.html.
 *
 * Run on the server from this folder:  php create-page.php /path/to/public_html
 *
 * @package Shouku
 */

if ( 'cli' !== PHP_SAPI ) {
	exit( 1 );
}
$root = isset( $argv[1] ) ? rtrim( $argv[1], '/' ) : getenv( 'HOME' ) . '/public_html';
$_SERVER['HTTP_HOST']   = 'shoukugames.org';
$_SERVER['REQUEST_URI'] = '/';
require $root . '/wp-load.php';

kses_remove_filters(); // Keep the page's classes and attributes exactly as written.

$content = file_get_contents( __DIR__ . '/page-en.html' );
$page    = get_page_by_path( 'shouku-launcher', OBJECT, 'page' );
$data    = array(
	'post_type'      => 'page',
	'post_status'    => 'publish',
	'post_name'      => 'shouku-launcher',
	'post_title'     => 'Shouku Launcher',
	'post_excerpt'   => 'One app to find, install, update and play every Shouku game.',
	'post_content'   => $content,
	'comment_status' => 'closed',
	'ping_status'    => 'closed',
	'post_author'    => 1,
);
if ( $page ) {
	$data['ID'] = $page->ID;
	$id         = wp_update_post( $data, true );
} else {
	$id = wp_insert_post( $data, true );
}
if ( is_wp_error( $id ) ) {
	fwrite( STDERR, $id->get_error_message() . "\n" );
	exit( 1 );
}
echo ( $page ? 'Updated' : 'Created' ) . " page $id: " . get_permalink( $id ) . "\n";
