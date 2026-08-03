<?php
/**
 * LinkFlow_Google — Google sign-in for the desktop client.
 *
 * The desktop app cannot run an OAuth flow inside its own webview (Google
 * blocks embedded webviews), so this opens the user's system browser instead:
 *
 *   1. start()    → redirect the browser to Google's consent screen.
 *   2. callback() → exchange the code, find/create the WordPress user, issue
 *                   a normal LinkFlow device token, and hand it back to the
 *                   desktop app via the `linkflow://auth-callback` custom URL
 *                   scheme, which the OS routes to the installed app.
 *
 * Credentials are reused from the "WP Microsoft Auth" plugin (WPMA_Settings /
 * WPMA_User), which already has a working Google Cloud OAuth client
 * configured for this site. This endpoint's own callback URL must be added
 * as an additional Authorized Redirect URI on that same OAuth client.
 *
 * @package LinkFlowDashboard
 */

defined( 'ABSPATH' ) || exit;

class LinkFlow_Google {

	const AUTH_BASE     = 'https://accounts.google.com/o/oauth2/v2/auth';
	const TOKEN_URL      = 'https://oauth2.googleapis.com/token';
	const USERINFO_URL   = 'https://www.googleapis.com/oauth2/v2/userinfo';
	const SCOPE           = 'openid email profile';
	const STATE_PREFIX    = 'linkflow_google_state_';
	const DEVICE_LABEL    = 'LinkFlow for Windows (Google)';

	/**
	 * Register the two REST routes this flow needs.
	 *
	 * @return void
	 */
	public static function register_routes() {
		register_rest_route(
			'linkflow/v1',
			'/desktop/google/start',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'start' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			'linkflow/v1',
			'/desktop/google/callback',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'callback' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/**
	 * Whether Google sign-in is usable right now (WP Microsoft Auth active and configured).
	 *
	 * @return bool
	 */
	private static function is_available() {
		return class_exists( 'WPMA_Settings' )
			&& class_exists( 'WPMA_User' )
			&& (bool) WPMA_Settings::get( 'google_enabled' )
			&& (string) WPMA_Settings::get( 'google_client_id', '' )
			&& WPMA_Settings::get_secret( 'google' );
	}

	/** The redirect_uri this flow always uses — must be registered in Google Cloud Console. */
	public static function get_callback_url() {
		return esc_url_raw( rest_url( 'linkflow/v1/desktop/google/callback' ) );
	}

	// ── Step 1: start ──────────────────────────────────────────────────────────

	/**
	 * Redirect the browser to Google's consent screen.
	 *
	 * @return void Always exits via redirect or an inline error page.
	 */
	public static function start() {
		if ( ! self::is_available() ) {
			self::html_error( __( 'Google sign-in is not configured on this site yet.', 'linkflow-dashboard' ) );
			return;
		}

		$state = wp_generate_password( 32, false, false );
		set_transient( self::STATE_PREFIX . $state, array( 'created' => time() ), 10 * MINUTE_IN_SECONDS );

		$params = array(
			'client_id'     => WPMA_Settings::get( 'google_client_id' ),
			'response_type' => 'code',
			'redirect_uri'  => self::get_callback_url(),
			'scope'         => self::SCOPE,
			'state'         => $state,
			'access_type'   => 'online',
			'prompt'        => 'select_account',
		);

		wp_redirect( self::AUTH_BASE . '?' . http_build_query( $params ) ); // phpcs:ignore WordPress.Security.SafeRedirect
		exit;
	}

	// ── Step 2: callback ──────────────────────────────────────────────────────

	/**
	 * Handle Google's redirect back, issue a device token, and hand off to the app.
	 *
	 * @return void Always exits via an HTML bounce page.
	 */
	public static function callback() {
		if ( ! empty( $_GET['error'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			self::html_error(
				sprintf(
					/* translators: %s: Google's error code. */
					__( 'Google sign-in was cancelled or failed: %s', 'linkflow-dashboard' ),
					sanitize_text_field( wp_unslash( $_GET['error'] ) ) // phpcs:ignore WordPress.Security.NonceVerification.Recommended
				)
			);
			return;
		}

		$state = isset( $_GET['state'] ) ? sanitize_text_field( wp_unslash( $_GET['state'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$transient_key = self::STATE_PREFIX . $state;
		$stored        = get_transient( $transient_key );
		delete_transient( $transient_key );

		if ( ! $state || ! $stored ) {
			self::html_error( __( 'This sign-in link expired or was already used. Please try again from LinkFlow.', 'linkflow-dashboard' ) );
			return;
		}

		$code = isset( $_GET['code'] ) ? sanitize_text_field( wp_unslash( $_GET['code'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( ! $code ) {
			self::html_error( __( 'No authorization code was returned by Google.', 'linkflow-dashboard' ) );
			return;
		}

		$token_data = self::exchange_code( $code );
		if ( is_wp_error( $token_data ) ) {
			self::html_error( $token_data->get_error_message() );
			return;
		}

		$claims = self::decode_id_token( $token_data['id_token'] ?? '' );
		if ( empty( $claims['email'] ) ) {
			$claims = self::fetch_userinfo( $token_data['access_token'] ?? '' );
		}

		if ( empty( $claims['email'] ) ) {
			self::html_error( __( 'Could not retrieve your email address from Google.', 'linkflow-dashboard' ) );
			return;
		}

		$email = sanitize_email( $claims['email'] );
		$sub   = sanitize_text_field( $claims['sub'] ?? '' );
		$name  = sanitize_text_field( $claims['name'] ?? '' );

		$user = $sub ? WPMA_User::get_by_google_sub( $sub ) : null;

		if ( ! $user ) {
			$user = WPMA_User::get_by_email( $email );
			if ( $user && $sub ) {
				WPMA_User::link_google_sub( $user->ID, $sub );
			}
		}

		if ( ! $user ) {
			$new_user_id = WPMA_User::create_from_sso(
				array(
					'email'        => $email,
					'display_name' => $name,
					'google_sub'   => $sub,
				)
			);

			if ( is_wp_error( $new_user_id ) ) {
				self::html_error( $new_user_id->get_error_message() );
				return;
			}

			$user = get_userdata( $new_user_id );
		}

		if ( ! $user ) {
			self::html_error( __( 'Could not find or create a LinkFlow account for this Google account.', 'linkflow-dashboard' ) );
			return;
		}

		$token = self::issue_device_token( $user->ID );

		self::bounce_to_app(
			array(
				'token'       => $token,
				'restUrl'     => esc_url_raw( rest_url( 'linkflow/v1/' ) ),
				'displayName' => $user->display_name,
				'email'       => $user->user_email,
				'userId'      => $user->ID,
			)
		);
	}

	// ── Token exchange ────────────────────────────────────────────────────────

	/**
	 * @param string $code Authorization code from Google.
	 * @return array|WP_Error
	 */
	private static function exchange_code( $code ) {
		$response = wp_remote_post(
			self::TOKEN_URL,
			array(
				'timeout' => 30,
				'body'    => array(
					'grant_type'    => 'authorization_code',
					'client_id'     => WPMA_Settings::get( 'google_client_id' ),
					'client_secret' => WPMA_Settings::get_secret( 'google' ),
					'code'          => $code,
					'redirect_uri'  => self::get_callback_url(),
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'linkflow_google_http_error', $response->get_error_message() );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! empty( $body['error'] ) ) {
			return new WP_Error( 'linkflow_google_token_error', $body['error_description'] ?? $body['error'] );
		}

		return is_array( $body ) ? $body : array();
	}

	/**
	 * Decode the JWT id_token payload without signature verification.
	 * Safe here because the token was obtained directly from Google's token
	 * endpoint over HTTPS server-to-server, never passed through the client.
	 *
	 * @param string $id_token JWT string.
	 * @return array
	 */
	private static function decode_id_token( $id_token ) {
		if ( ! $id_token ) {
			return array();
		}

		$parts = explode( '.', $id_token );
		if ( 3 !== count( $parts ) ) {
			return array();
		}

		$payload = strtr( $parts[1], '-_', '+/' );
		$payload .= str_repeat( '=', ( 4 - strlen( $payload ) % 4 ) % 4 );
		$decoded = base64_decode( $payload ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
		if ( false === $decoded ) {
			return array();
		}

		$claims = json_decode( $decoded, true );
		return is_array( $claims ) ? $claims : array();
	}

	/**
	 * @param string $access_token OAuth access token.
	 * @return array
	 */
	private static function fetch_userinfo( $access_token ) {
		if ( ! $access_token ) {
			return array();
		}

		$response = wp_remote_get(
			self::USERINFO_URL,
			array(
				'headers' => array( 'Authorization' => 'Bearer ' . $access_token ),
				'timeout' => 15,
			)
		);

		if ( is_wp_error( $response ) ) {
			return array();
		}

		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		return is_array( $data ) ? $data : array();
	}

	// ── Device token ──────────────────────────────────────────────────────────

	/**
	 * Issue a LinkFlow device token for this user, exactly like the
	 * password-based /desktop/session endpoint does.
	 *
	 * @param int $user_id WordPress user ID.
	 * @return string Raw 64-character hex device token.
	 */
	private static function issue_device_token( $user_id ) {
		global $wpdb;

		$token = bin2hex( random_bytes( 32 ) );
		$now   = current_time( 'mysql', true );

		$wpdb->insert(
			$wpdb->prefix . 'linkflow_devices',
			array(
				'user_id'      => $user_id,
				'label'        => self::DEVICE_LABEL,
				'token_hash'   => hash( 'sha256', $token ),
				'created_at'   => $now,
				'last_used_at' => $now,
				'expires_at'   => null,
			),
			array( '%d', '%s', '%s', '%s', '%s', '%s' )
		);

		return $token;
	}

	// ── Hand-off to the desktop app ──────────────────────────────────────────

	/**
	 * Render a small HTML page that navigates the browser to the
	 * `linkflow://auth-callback` custom URL scheme, which the OS routes to
	 * the installed desktop app.
	 *
	 * @param array $payload Data to pass through as query parameters.
	 * @return void Always exits.
	 */
	private static function bounce_to_app( array $payload ) {
		$target = 'linkflow://auth-callback?' . http_build_query( $payload );
		self::html_bounce(
			__( 'Signed in with Google', 'linkflow-dashboard' ),
			sprintf(
				/* translators: %s: "LinkFlow" app name. */
				__( 'Taking you back to %s…', 'linkflow-dashboard' ),
				'LinkFlow'
			),
			$target
		);
	}

	/**
	 * @param string $message User-facing error message.
	 * @return void Always exits.
	 */
	private static function html_error( $message ) {
		self::html_bounce( __( 'LinkFlow sign-in failed', 'linkflow-dashboard' ), $message, '' );
	}

	/**
	 * @param string $title    Page heading.
	 * @param string $message  Body text.
	 * @param string $redirect Optional custom-scheme URL to auto-navigate to.
	 * @return void Always exits.
	 */
	private static function html_bounce( $title, $message, $redirect ) {
		nocache_headers();
		status_header( $redirect ? 200 : 400 );
		header( 'Content-Type: text/html; charset=utf-8' );

		printf(
			'<!doctype html><html><head><meta charset="utf-8"><title>%1$s</title>%2$s<style>body{font:15px/1.5 -apple-system,Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:26rem;text-align:center;padding:2rem}a{color:#60a5fa}</style></head><body><main><h1>%1$s</h1><p>%3$s</p>%4$s</main></body></html>',
			esc_html( $title ),
			$redirect ? '<meta http-equiv="refresh" content="0;url=' . esc_attr( $redirect ) . '">' : '',
			esc_html( $message ),
			$redirect ? '<p><a href="' . esc_url( $redirect ) . '">' . esc_html__( 'Click here if LinkFlow does not open automatically.', 'linkflow-dashboard' ) . '</a></p>' : ''
		);
		exit;
	}
}
