<?php
/**
 * LinkFlow_Updates — proxies GitHub Releases so the private
 * vincentrathbone-web/linkflow-dashboard repo can still power the Tauri
 * updater's "check for updates" flow.
 *
 * Tauri's updater plugin makes a plain, unauthenticated HTTPS request to the
 * endpoint URL configured in tauri.conf.json, and downloads the installer
 * from the URL inside that response with no extra headers. Release assets on
 * a *private* GitHub repo are not reachable that way — GitHub returns 404 to
 * an unauthenticated request. This class does the authenticated GitHub API
 * calls server-side (using a token configured under Settings → LinkFlow) and
 * exposes two plain, public, unauthenticated endpoints that the desktop app
 * can hit exactly the way the updater plugin expects. The token itself never
 * reaches the client.
 *
 * @package LinkFlowDashboard
 */

defined( 'ABSPATH' ) || exit;

class LinkFlow_Updates {

	const GITHUB_REPO = 'vincentrathbone-web/linkflow-dashboard';
	const CACHE_KEY    = 'linkflow_latest_github_release';

	/**
	 * Register the update-check and asset-download routes.
	 *
	 * @return void
	 */
	public static function register_routes() {
		register_rest_route(
			'linkflow/v1',
			'/desktop/latest-release',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'check_for_update' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			'linkflow/v1',
			'/desktop/latest-release/download',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'download_asset' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/**
	 * The Tauri updater's expected response: 204 if the caller's current
	 * version is already the latest, or 200 with a version/notes/platforms
	 * manifest if a newer release exists.
	 *
	 * @param WP_REST_Request $request Request data.
	 * @return WP_REST_Response
	 */
	public static function check_for_update( WP_REST_Request $request ) {
		$release = self::get_latest_release();
		if ( ! is_array( $release ) ) {
			return new WP_REST_Response( null, 204 );
		}

		$latest_version  = ltrim( (string) $release['tag_name'], 'v' );
		$current_version = (string) $request->get_param( 'current_version' );

		if ( ! $current_version || version_compare( $latest_version, $current_version, '<=' ) ) {
			return new WP_REST_Response( null, 204 );
		}

		$installer = self::find_asset( $release, '-setup.exe' );
		$signature = self::find_asset( $release, '-setup.exe.sig' );
		if ( ! $installer || ! $signature ) {
			return new WP_REST_Response( null, 204 );
		}

		$signature_contents = self::fetch_asset_contents( $signature['id'] );
		if ( false === $signature_contents ) {
			return new WP_REST_Response( null, 204 );
		}

		return new WP_REST_Response(
			array(
				'version'   => $latest_version,
				'notes'     => (string) ( $release['body'] ?? '' ),
				'pub_date'  => (string) ( $release['published_at'] ?? gmdate( 'c' ) ),
				'platforms' => array(
					'windows-x86_64' => array(
						'signature' => trim( $signature_contents ),
						'url'       => add_query_arg(
							'asset',
							rawurlencode( $installer['name'] ),
							rest_url( 'linkflow/v1/desktop/latest-release/download' )
						),
					),
				),
			),
			200
		);
	}

	/**
	 * Stream a single release asset's bytes, authenticated server-side.
	 *
	 * @param WP_REST_Request $request Request data.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function download_asset( WP_REST_Request $request ) {
		$asset_name = sanitize_file_name( (string) $request->get_param( 'asset' ) );
		$release    = self::get_latest_release();
		if ( ! is_array( $release ) ) {
			return new WP_Error( 'linkflow_no_release', __( 'No release is available.', 'linkflow-dashboard' ), array( 'status' => 404 ) );
		}

		$asset = self::find_asset( $release, '', $asset_name );
		if ( ! $asset ) {
			return new WP_Error( 'linkflow_asset_not_found', __( 'The requested release asset was not found.', 'linkflow-dashboard' ), array( 'status' => 404 ) );
		}

		$contents = self::fetch_asset_contents( $asset['id'], true );
		if ( false === $contents ) {
			return new WP_Error( 'linkflow_asset_fetch_failed', __( 'Unable to download the release asset from GitHub.', 'linkflow-dashboard' ), array( 'status' => 502 ) );
		}

		nocache_headers();
		header( 'Content-Type: application/octet-stream' );
		header( 'Content-Disposition: attachment; filename="' . $asset['name'] . '"' );
		header( 'Content-Length: ' . strlen( $contents ) );
		echo $contents; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		exit;
	}

	/**
	 * Fetch (and cache) the latest GitHub release's metadata.
	 *
	 * @return array|null
	 */
	private static function get_latest_release() {
		$token = LinkFlow_Settings::get_github_release_token();
		if ( ! $token ) {
			return null;
		}

		$cached = get_transient( self::CACHE_KEY );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		$response = wp_remote_get(
			'https://api.github.com/repos/' . self::GITHUB_REPO . '/releases/latest',
			array(
				'timeout' => 10,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Accept'        => 'application/vnd.github+json',
					'User-Agent'    => 'LinkFlow-Dashboard-WordPress-Plugin',
				),
			)
		);
		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			return null;
		}

		$release = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $release ) || empty( $release['tag_name'] ) ) {
			return null;
		}

		set_transient( self::CACHE_KEY, $release, 30 * MINUTE_IN_SECONDS );
		return $release;
	}

	/**
	 * Find a release asset either by an exact name or a filename suffix.
	 *
	 * @param array  $release Release metadata from the GitHub API.
	 * @param string $suffix  Filename suffix to match, e.g. "-setup.exe".
	 * @param string $exact   Optional exact filename to match instead.
	 * @return array|null
	 */
	private static function find_asset( array $release, $suffix, $exact = '' ) {
		if ( empty( $release['assets'] ) || ! is_array( $release['assets'] ) ) {
			return null;
		}

		foreach ( $release['assets'] as $asset ) {
			if ( empty( $asset['name'] ) ) {
				continue;
			}
			if ( $exact && $asset['name'] === $exact ) {
				return $asset;
			}
			if ( $suffix && self::ends_with( $asset['name'], $suffix ) ) {
				return $asset;
			}
		}

		return null;
	}

	/**
	 * @param string $haystack Full string.
	 * @param string $needle   Suffix to check for.
	 * @return bool
	 */
	private static function ends_with( $haystack, $needle ) {
		$length = strlen( $needle );
		return 0 === $length || substr( $haystack, -$length ) === $needle;
	}

	/**
	 * Download a single asset's raw bytes from the GitHub API.
	 *
	 * @param int  $asset_id GitHub release asset ID.
	 * @param bool $binary   Whether this is expected to be a binary payload.
	 * @return string|false
	 */
	private static function fetch_asset_contents( $asset_id, $binary = false ) {
		$token = LinkFlow_Settings::get_github_release_token();
		if ( ! $token ) {
			return false;
		}

		$response = wp_remote_get(
			'https://api.github.com/repos/' . self::GITHUB_REPO . '/releases/assets/' . absint( $asset_id ),
			array(
				'timeout' => $binary ? 30 : 10,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Accept'        => 'application/octet-stream',
					'User-Agent'    => 'LinkFlow-Dashboard-WordPress-Plugin',
				),
			)
		);
		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			return false;
		}

		return wp_remote_retrieve_body( $response );
	}
}
