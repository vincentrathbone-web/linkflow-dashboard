<?php
/**
 * LinkFlow application, data, and REST integration.
 *
 * @package LinkFlowDashboard
 */

defined( 'ABSPATH' ) || exit;

class LinkFlow_Dashboard {
	/** @var LinkFlow_Dashboard|null */
	private static $instance = null;

	/** @var string */
	private $workspaces_table;

	/** @var string */
	private $revisions_table;

	/** @var string */
	private $devices_table;

	/** @var array Temporary request authentication diagnostics. */
	private $auth_diagnostic = array( 'state' => 'not_evaluated' );

	/** @var int|null The devices_table row ID for the current request's device token, if any. */
	private $authenticated_device_id = null;


	/**
	 * Get the plugin singleton.
	 *
	 * @return LinkFlow_Dashboard
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Create the required storage tables.
	 *
	 * @return void
	 */
	public static function activate() {
		global $wpdb;

		if ( self::has_current_schema() && self::required_tables_exist() ) {
			return;
		}

		$charset_collate = $wpdb->get_charset_collate();
		$workspaces     = $wpdb->prefix . 'linkflow_workspaces';
		$revisions      = $wpdb->prefix . 'linkflow_workspace_revisions';
		$devices        = $wpdb->prefix . 'linkflow_devices';

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		dbDelta(
			"CREATE TABLE {$workspaces} (
				user_id bigint(20) unsigned NOT NULL,
				workspace longtext NOT NULL,
				version bigint(20) unsigned NOT NULL DEFAULT 1,
				updated_at datetime NOT NULL,
				PRIMARY KEY  (user_id)
			) {$charset_collate};"
		);

		dbDelta(
			"CREATE TABLE {$devices} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				user_id bigint(20) unsigned NOT NULL,
				label varchar(100) NOT NULL,
				token_hash char(64) NOT NULL,
				created_at datetime NOT NULL,
				last_used_at datetime NOT NULL,
				expires_at datetime NULL,
				PRIMARY KEY  (id),
				UNIQUE KEY token_hash (token_hash),
				KEY user_id (user_id)
			) {$charset_collate};"
		);

		dbDelta(
			"CREATE TABLE {$revisions} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				user_id bigint(20) unsigned NOT NULL,
				version bigint(20) unsigned NOT NULL,
				workspace longtext NOT NULL,
				created_at datetime NOT NULL,
				PRIMARY KEY  (id),
				KEY user_version (user_id, version)
			) {$charset_collate};"
		);

		if ( ! self::required_tables_exist() ) {
			wp_die(
				esc_html__( 'LinkFlow could not create its required database tables. Please check the WordPress database user permissions and try activating the plugin again.', 'linkflow-dashboard' ),
				esc_html__( 'LinkFlow activation failed', 'linkflow-dashboard' ),
				array( 'response' => 500 )
			);
		}

		// Database migrations are independent of package releases. Recording this only
		// after every table exists prevents a partial setup from being marked complete.
		update_option( 'linkflow_dashboard_db_version', LINKFLOW_DASHBOARD_DB_VERSION, false );
	}

	/**
	 * Determine whether the installed schema matches the current schema revision.
	 *
	 * @return bool
	 */
	private static function has_current_schema() {
		return LINKFLOW_DASHBOARD_DB_VERSION === (string) get_option( 'linkflow_dashboard_db_version', '' );
	}

	/**
	 * Confirm that all plugin-owned storage tables are present.
	 *
	 * @return bool
	 */
	private static function required_tables_exist() {
		global $wpdb;

		$tables = array(
			$wpdb->prefix . 'linkflow_workspaces',
			$wpdb->prefix . 'linkflow_workspace_revisions',
			$wpdb->prefix . 'linkflow_devices',
		);

		foreach ( $tables as $table ) {
			$found_table = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) );
			if ( $table !== $found_table ) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Set up WordPress hooks.
	 */
	private function __construct() {
		global $wpdb;

		$this->workspaces_table = $wpdb->prefix . 'linkflow_workspaces';
		$this->revisions_table  = $wpdb->prefix . 'linkflow_workspace_revisions';
		$this->devices_table    = $wpdb->prefix . 'linkflow_devices';

		if ( ! self::has_current_schema() ) {
			self::activate();
		}

		add_shortcode( 'linkflow_dashboard', array( $this, 'render_app' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'prepare_dashboard_page' ), 1000 );
		add_action( 'rest_api_init', array( $this, 'register_rest_routes' ) );
		add_filter( 'determine_current_user', array( $this, 'authenticate_device_token' ), 20 );
		add_filter( 'script_loader_tag', array( $this, 'make_app_script_a_module' ), 10, 3 );
		add_filter( 'rest_pre_serve_request', array( $this, 'allow_tauri_origin' ), 10, 4 );
	}

	/**
	 * Force the Vite bundle to run as an ES module.
	 *
	 * WordPress versions before native module-script support ignore the script
	 * metadata set in enqueue_app(). Executing a Vite bundle as a classic script
	 * leaks its top-level declarations into window and can collide with wp.
	 *
	 * @param string $tag    Script element HTML.
	 * @param string $handle Script handle.
	 * @param string $src    Script URL.
	 * @return string
	 */
	public function make_app_script_a_module( $tag, $handle, $src ) {
		if ( 'linkflow-dashboard-app' !== $handle ) {
			return $tag;
		}

		return sprintf(
			'<script id="%1$s-js" type="module" src="%2$s"></script>',
			esc_attr( $handle ),
			esc_url( $src )
		);
	}

	/**
	 * Render the React application shell.
	 *
	 * @return string
	 */
	public function render_app() {
		if ( ! is_user_logged_in() ) {
			return sprintf(
				'<p>%s <a href="%s">%s</a></p>',
				esc_html__( 'Please sign in to access your LinkFlow workspace.', 'linkflow-dashboard' ),
				esc_url( wp_login_url( get_permalink() ) ),
				esc_html__( 'Sign in', 'linkflow-dashboard' )
			);
		}

		$this->enqueue_app();

		// wp_add_inline_script() does not reliably attach to a type="module"
		// script on this WordPress core version: the module tag prints but the
		// attached inline content is silently dropped. Print the config as a
		// plain classic inline script tied to this shortcode's own output
		// instead, which the browser always runs before a deferred module
		// script regardless of DOM position.
		$config = array(
			'restUrl'   => esc_url_raw( rest_url( 'linkflow/v1/' ) ),
			'nonce'     => wp_create_nonce( 'wp_rest' ),
			'logoutUrl' => wp_logout_url( home_url( '/' ) ),
			'user'      => array(
				'id'          => get_current_user_id(),
				'displayName' => wp_get_current_user()->display_name,
				'email'       => wp_get_current_user()->user_email,
			),
		);

		return sprintf(
			'<script>window.linkflowConfig = %s;</script><div id="linkflow-dashboard-root"></div>',
			wp_json_encode( $config )
		);
	}

	/**
	 * Load LinkFlow early enough for wp_head and isolate its page from Elementor CSS.
	 *
	 * @return void
	 */
	public function prepare_dashboard_page() {
		if ( ! $this->is_dashboard_page() ) {
			return;
		}

		$this->block_elementor_styles();
		$this->enqueue_app();
	}

	/**
	 * Detect a singular page containing the LinkFlow shortcode.
	 *
	 * @return bool
	 */
	private function is_dashboard_page() {
		if ( ! is_singular() ) {
			return false;
		}

		$post = get_post();
		if ( ! $post instanceof WP_Post ) {
			return false;
		}

		if ( has_shortcode( $post->post_content, 'linkflow_dashboard' ) ) {
			return true;
		}

		$elementor_data = get_post_meta( $post->ID, '_elementor_data', true );
		return is_string( $elementor_data ) && false !== strpos( $elementor_data, 'linkflow_dashboard' );
	}

	/**
	 * Prevent Elementor's generic frontend and per-document styles from overriding
	 * the React application's button and form-control utility classes.
	 *
	 * @return void
	 */
	private function block_elementor_styles() {
		$blocked_theme_handles = array(
			'hello-elementor-css',
			'hello-elementor-theme-style',
			'hello-elementor-header-footer-css',
			'e-theme-ui-light',
		);
		$styles = wp_styles();
		foreach ( $styles->queue as $handle ) {
			if ( 0 === strpos( $handle, 'elementor-' ) || in_array( $handle, $blocked_theme_handles, true ) ) {
				wp_dequeue_style( $handle );
			}
		}
	}

	/**
	 * Enqueue the Vite manifest assets and runtime configuration.
	 *
	 * @return void
	 */
	private function enqueue_app() {
		$manifest_path = LINKFLOW_DASHBOARD_DIR . 'build/.vite/manifest.json';
		if ( ! file_exists( $manifest_path ) ) {
			return;
		}

		$manifest = json_decode( file_get_contents( $manifest_path ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$entry    = is_array( $manifest ) && isset( $manifest['index.html'] ) ? $manifest['index.html'] : null;
		if ( ! is_array( $entry ) || empty( $entry['file'] ) ) {
			return;
		}

		// Isolation wrapper (all: initial / isolation: isolate / contain) for
		// #linkflow-dashboard-root — see css/isolation.css. Enqueued as a
		// dependency of every bundle stylesheet below so it is always printed
		// first regardless of registration order, which is what lets the
		// bundle's own `important` Tailwind utilities win the cascade without
		// needing higher-specificity selectors.
		wp_enqueue_style(
			'linkflow-dashboard-isolation',
			LINKFLOW_DASHBOARD_URL . 'css/isolation.css',
			array(),
			LINKFLOW_DASHBOARD_VERSION
		);

		// Material Symbols is a ligature font: the app's icon markup is plain
		// text (e.g. "close", "search") that only renders as a glyph once this
		// font has loaded. The desktop build gets it from a <link> in
		// index.html, but WordPress never loads that file — it enqueues the
		// built bundle directly — so without this the icon text renders
		// literally instead of as icons.
		wp_enqueue_style(
			'linkflow-dashboard-material-symbols',
			'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap',
			array(),
			null
		);

		if ( ! empty( $entry['css'] ) && is_array( $entry['css'] ) ) {
			foreach ( $entry['css'] as $index => $css_file ) {
				$style_handle = 'linkflow-dashboard-' . absint( $index );
				wp_enqueue_style(
					$style_handle,
					LINKFLOW_DASHBOARD_URL . 'build/' . ltrim( $css_file, '/' ),
					array( 'linkflow-dashboard-isolation' ),
					LINKFLOW_DASHBOARD_VERSION
				);
				wp_add_inline_style(
					$style_handle,
					'#linkflow-dashboard-root button, #linkflow-dashboard-root input, #linkflow-dashboard-root select, #linkflow-dashboard-root textarea { font: inherit; letter-spacing: inherit; text-transform: none; }'
				);
			}
		}

		wp_enqueue_script(
			'linkflow-dashboard-app',
			LINKFLOW_DASHBOARD_URL . 'build/' . ltrim( $entry['file'], '/' ),
			array(),
			LINKFLOW_DASHBOARD_VERSION,
			true
		);

		wp_script_add_data( 'linkflow-dashboard-app', 'type', 'module' );
	}

	/**
	 * Register user-scoped REST endpoints.
	 *
	 * @return void
	 */
	public function register_rest_routes() {
		$permission = array( $this, 'can_access_workspace' );

		register_rest_route(
			'linkflow/v1',
			'/desktop/session',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'create_desktop_session' ),
				'permission_callback' => '__return_true',
			)
		);

		LinkFlow_Google::register_routes();
		LinkFlow_Updates::register_routes();

		register_rest_route(
			'linkflow/v1',
			'/desktop/devices',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_devices' ),
				'permission_callback' => $permission,
			)
		);

		register_rest_route(
			'linkflow/v1',
			'/desktop/session',
			array(
				'methods'             => WP_REST_Server::DELETABLE,
				'callback'            => array( $this, 'sign_out' ),
				'permission_callback' => $permission,
			)
		);

		register_rest_route(
			'linkflow/v1',
			'/desktop/devices/(?P<id>\d+)',
			array(
				'methods'             => WP_REST_Server::DELETABLE,
				'callback'            => array( $this, 'revoke_device' ),
				'permission_callback' => $permission,
			)
		);

		register_rest_route(
			'linkflow/v1',
			'/me',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_current_user' ),
				'permission_callback' => $permission,
			)
		);

		register_rest_route(
			'linkflow/v1',
			'/daily-inspiration',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_daily_inspiration' ),
				'permission_callback' => $permission,
			)
		);


		register_rest_route(
			'linkflow/v1',
			'/workspace',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_workspace' ),
					'permission_callback' => $permission,
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'save_workspace' ),
					'permission_callback' => $permission,
				),
			)
		);

		register_rest_route(
			'linkflow/v1',
			'/workspace/revisions',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_revisions' ),
				'permission_callback' => $permission,
			)
		);

		register_rest_route(
			'linkflow/v1',
			'/workspace/revisions/(?P<version>\d+)/restore',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'restore_revision' ),
				'permission_callback' => $permission,
			)
		);
	}

	/**
	 * Allow cookie-authenticated web users and app-password desktop users.
	 *
	 * @return bool|WP_Error
	 */
	public function can_access_workspace() {
		if ( is_user_logged_in() ) {
			return true;
		}

		return new WP_Error(
			'linkflow_not_authenticated',
			__( 'LinkFlow could not authenticate this request.', 'linkflow-dashboard' ),
			array(
				'status'      => 401,
				'diagnostics' => $this->request_diagnostics(),
			)
		);
	}

	/**
	 * Authenticate a LinkFlow desktop bearer token for this REST namespace only.
	 *
	 * @param int|false $user_id Existing authenticated user ID.
	 * @return int|false
	 */
	public function authenticate_device_token( $user_id ) {
		if ( $user_id ) {
			$this->auth_diagnostic = array(
				'state'  => 'accepted_existing_wordpress_user',
				'mode'   => 'wordpress_cookie_or_existing_authentication',
				'userId' => absint( $user_id ),
			);
			return $user_id;
		}

		$request_uri = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';
		if ( ! defined( 'REST_REQUEST' ) || ! REST_REQUEST || false === strpos( $request_uri, '/linkflow/v1/' ) ) {
			return $user_id;
		}

		$token = isset( $_SERVER['HTTP_X_LINKFLOW_TOKEN'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_LINKFLOW_TOKEN'] ) ) : '';
		$mode  = $token ? 'x-linkflow-token' : 'none';
		if ( empty( $token ) ) {
			$header = isset( $_SERVER['HTTP_AUTHORIZATION'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_AUTHORIZATION'] ) ) : '';
			$token  = 0 === stripos( $header, 'Bearer ' ) ? trim( substr( $header, 7 ) ) : '';
			$mode   = $token ? 'authorization-bearer' : 'none';
		}
		if ( empty( $token ) ) {
			$this->auth_diagnostic = array(
				'state'              => 'refused_missing_token',
				'mode'               => $mode,
				'tokenHeaderPresent' => false,
			);
			return $user_id;
		}
		if ( ! preg_match( '/^[a-f0-9]{64}$/', $token ) ) {
			$this->auth_diagnostic = array(
				'state'              => 'refused_malformed_token',
				'mode'               => $mode,
				'tokenHeaderPresent' => true,
				'tokenLength'        => strlen( $token ),
				'expectedFormat'     => '64 lowercase hexadecimal characters',
			);
			return $user_id;
		}

		global $wpdb;
		$hash = hash( 'sha256', $token );
		$row  = $wpdb->get_row( $wpdb->prepare( "SELECT id, user_id, last_used_at FROM {$this->devices_table} WHERE token_hash = %s AND ( expires_at IS NULL OR expires_at > UTC_TIMESTAMP() )", $hash ), ARRAY_A );
		if ( ! is_array( $row ) ) {
			$this->auth_diagnostic = array(
				'state'              => 'refused_unknown_revoked_or_expired_token',
				'mode'               => $mode,
				'tokenHeaderPresent' => true,
				'tokenFormatValid'   => true,
			);
			return $user_id;
		}

		if ( empty( $row['last_used_at'] ) || strtotime( $row['last_used_at'] ) < ( time() - HOUR_IN_SECONDS ) ) {
			$wpdb->update( $this->devices_table, array( 'last_used_at' => current_time( 'mysql', true ) ), array( 'id' => absint( $row['id'] ) ), array( '%s' ), array( '%d' ) );
		}

		$this->auth_diagnostic = array(
			'state'              => 'accepted_device_token',
			'mode'               => $mode,
			'tokenHeaderPresent' => true,
			'tokenFormatValid'   => true,
			'deviceId'           => absint( $row['id'] ),
			'userId'             => absint( $row['user_id'] ),
			'lastUsedAt'         => $row['last_used_at'],
		);

		$this->authenticated_device_id = absint( $row['id'] );

		return absint( $row['user_id'] );
	}

	/**
	 * Exchange a normal WordPress login for a LinkFlow-only device token.
	 *
	 * @param WP_REST_Request $request Request data.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_desktop_session( WP_REST_Request $request ) {
		if ( ! is_ssl() ) {
			return new WP_Error( 'linkflow_https_required', __( 'Desktop sign-in requires HTTPS.', 'linkflow-dashboard' ), array( 'status' => 400 ) );
		}

		$credentials = $request->get_json_params();
		$username    = is_array( $credentials ) && isset( $credentials['username'] ) ? sanitize_text_field( $credentials['username'] ) : '';
		$password    = is_array( $credentials ) && isset( $credentials['password'] ) ? (string) $credentials['password'] : '';
		$label       = is_array( $credentials ) && isset( $credentials['deviceLabel'] ) ? sanitize_text_field( $credentials['deviceLabel'] ) : 'Windows desktop';
		$limit_key   = 'linkflow_login_' . md5( strtolower( $username ) . '|' . $this->request_ip() );

		if ( get_transient( $limit_key ) ) {
			return new WP_Error( 'linkflow_login_limited', __( 'Too many sign-in attempts. Please wait a few minutes and try again.', 'linkflow-dashboard' ), array( 'status' => 429 ) );
		}

		$user = wp_authenticate( $username, $password );
		if ( is_wp_error( $user ) ) {
			set_transient( $limit_key, 1, 5 * MINUTE_IN_SECONDS );
			return new WP_Error( 'linkflow_invalid_login', __( 'Invalid username, email address, or password.', 'linkflow-dashboard' ), array( 'status' => 401 ) );
		}

		$token = bin2hex( random_bytes( 32 ) );
		$now   = current_time( 'mysql', true );
		global $wpdb;
		$result = $wpdb->insert(
			$this->devices_table,
			array(
				'user_id'      => $user->ID,
				'label'        => substr( $label ? $label : 'Windows desktop', 0, 100 ),
				'token_hash'   => hash( 'sha256', $token ),
				'created_at'   => $now,
				'last_used_at' => $now,
				'expires_at'   => null,
			),
			array( '%d', '%s', '%s', '%s', '%s', '%s' )
		);
		if ( false === $result ) {
			return new WP_Error( 'linkflow_device_create_failed', __( 'Unable to create this desktop session.', 'linkflow-dashboard' ), array( 'status' => 500 ) );
		}

		return $this->diagnostic_response(
			array(
				'token'       => $token,
				'deviceId'    => absint( $wpdb->insert_id ),
				'restUrl'     => esc_url_raw( rest_url( 'linkflow/v1/' ) ),
				'user'        => array( 'id' => $user->ID, 'displayName' => $user->display_name, 'email' => $user->user_email ),
			),
			201,
			array(
				'operation'      => 'create_desktop_session',
				'credentialAuth' => 'accepted',
				'createdDeviceId'=> absint( $wpdb->insert_id ),
				'createdUserId'  => absint( $user->ID ),
				'databaseResult' => $result,
			)
		);
	}

	/**
	 * Sign out of the cloud workspace: revoke the device token used for this
	 * request, so the client's saved credential can no longer authenticate.
	 *
	 * A device-token request always resolves to exactly one devices_table row
	 * (set by authenticate_device_token()); a cookie-authenticated hosted-page
	 * request has no device row to revoke and this is a harmless no-op.
	 *
	 * @return WP_REST_Response
	 */
	public function sign_out() {
		if ( null !== $this->authenticated_device_id ) {
			global $wpdb;
			$wpdb->delete(
				$this->devices_table,
				array( 'id' => $this->authenticated_device_id, 'user_id' => get_current_user_id() ),
				array( '%d', '%d' )
			);
		}

		return new WP_REST_Response( null, 204 );
	}

	/**
	 * Get the signed-in user's registered desktop devices.
	 *
	 * @return WP_REST_Response
	 */
	public function get_devices() {
		global $wpdb;
		$devices = $wpdb->get_results( $wpdb->prepare( "SELECT id, label, created_at, last_used_at, expires_at FROM {$this->devices_table} WHERE user_id = %d ORDER BY last_used_at DESC", get_current_user_id() ), ARRAY_A );
		return new WP_REST_Response( array( 'devices' => $devices ), 200 );
	}

	/**
	 * Revoke one of the signed-in user's desktop devices.
	 *
	 * @param WP_REST_Request $request Request data.
	 * @return WP_REST_Response|WP_Error
	 */
	public function revoke_device( WP_REST_Request $request ) {
		global $wpdb;
		$result = $wpdb->delete( $this->devices_table, array( 'id' => absint( $request['id'] ), 'user_id' => get_current_user_id() ), array( '%d', '%d' ) );
		if ( ! $result ) {
			return new WP_Error( 'linkflow_device_not_found', __( 'The desktop device could not be found.', 'linkflow-dashboard' ), array( 'status' => 404 ) );
		}
		return new WP_REST_Response( null, 204 );
	}

	/**
	 * Get a non-identifying request IP for short-lived rate limiting.
	 *
	 * @return string
	 */
	private function request_ip() {
		return isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';
	}

	/**
	 * Build a secret-free snapshot of the current REST request.
	 *
	 * @param array $extra Endpoint-specific diagnostic values.
	 * @return array
	 */
	private function request_diagnostics( $extra = array() ) {
		$request_id = isset( $_SERVER['HTTP_X_LINKFLOW_REQUEST_ID'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_LINKFLOW_REQUEST_ID'] ) ) : '';
		$base       = array(
			'requestId'     => $request_id,
			'pluginVersion' => LINKFLOW_DASHBOARD_VERSION,
			'serverTimeUtc' => gmdate( 'c' ),
			'requestMethod' => isset( $_SERVER['REQUEST_METHOD'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) : '',
			'requestUri'    => isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '',
			'userId'        => get_current_user_id(),
			'authentication'=> $this->auth_diagnostic,
		);

		return array_merge( $base, $extra );
	}

	/**
	 * Return a REST response with temporary LinkFlow diagnostics and no-cache headers.
	 *
	 * @param array $data Response body.
	 * @param int   $status HTTP status.
	 * @param array $diagnostics Endpoint-specific diagnostic values.
	 * @param int   $workspace_version Current workspace version, when applicable.
	 * @return WP_REST_Response
	 */
	private function diagnostic_response( $data, $status = 200, $diagnostics = array(), $workspace_version = null ) {
		$data['diagnostics'] = $this->request_diagnostics( $diagnostics );
		$response            = new WP_REST_Response( $data, $status );
		$response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );
		$response->header( 'Pragma', 'no-cache' );
		$response->header( 'X-LinkFlow-Plugin-Version', LINKFLOW_DASHBOARD_VERSION );
		$response->header( 'X-LinkFlow-Server-Time', gmdate( 'c' ) );
		$response->header( 'X-LinkFlow-User-ID', (string) get_current_user_id() );
		if ( null !== $workspace_version ) {
			$response->header( 'X-LinkFlow-Workspace-Version', (string) absint( $workspace_version ) );
		}

		return $response;
	}

	/**
	 * Return the authenticated account information.
	 *
	 * @return WP_REST_Response
	 */
	public function get_current_user() {
		$user = wp_get_current_user();
		return $this->diagnostic_response(
			array(
				'id'          => $user->ID,
				'displayName' => $user->display_name,
				'email'       => $user->user_email,
			),
			200,
			array( 'operation' => 'verify_authenticated_user' )
		);
	}


	/**
	 * Curated "verse of the day" style references, in the spirit of the YouVersion
	 * feature this stands in for. Only the references are curated here; the actual
	 * verse text is fetched live from bible-api.com so we're not redistributing
	 * copyrighted translation text ourselves.
	 *
	 * @var string[]
	 */
	private static $daily_verse_references = array(
		'Joshua 1:9', 'Psalm 23:1', 'Psalm 27:1', 'Psalm 34:18', 'Psalm 37:4',
		'Psalm 46:1', 'Psalm 55:22', 'Psalm 56:3', 'Psalm 62:1', 'Psalm 90:17',
		'Psalm 118:24', 'Psalm 119:105', 'Psalm 121:1-2', 'Psalm 138:8', 'Psalm 143:8',
		'Proverbs 3:5-6', 'Proverbs 16:3', 'Proverbs 16:9', 'Proverbs 18:10', 'Proverbs 31:25',
		'Isaiah 40:31', 'Isaiah 41:10', 'Isaiah 43:2', 'Isaiah 26:3', 'Isaiah 54:10',
		'Jeremiah 29:11', 'Lamentations 3:22-23', 'Zephaniah 3:17',
		'Matthew 6:33', 'Matthew 6:34', 'Matthew 11:28', 'Matthew 19:26',
		'Mark 11:24', 'Luke 1:37', 'John 3:16', 'John 14:27', 'John 16:33',
		'Romans 8:28', 'Romans 8:31', 'Romans 12:2', 'Romans 15:13',
		'1 Corinthians 13:4-7', '2 Corinthians 4:16-18', '2 Corinthians 5:17', '2 Corinthians 12:9',
		'Galatians 6:9', 'Ephesians 2:10', 'Ephesians 3:20', 'Philippians 4:6-7', 'Philippians 4:13',
		'Philippians 4:19', 'Colossians 3:23', '1 Thessalonians 5:16-18',
		'2 Timothy 1:7', 'Hebrews 11:1', 'Hebrews 12:1', 'James 1:2-3', 'James 1:17',
		'1 Peter 5:7', '1 John 4:18', 'Joshua 1:9',
	);

	/**
	 * Serve today's motivational quote or Bible verse, fetched server-side and
	 * cached for the day. Server-side fetching avoids exposing any third-party
	 * API directly to the browser (CORS, keys) and keeps both clients in sync
	 * on one cached value.
	 *
	 * @param WP_REST_Request $request Request data.
	 * @return WP_REST_Response
	 */
	public function get_daily_inspiration( WP_REST_Request $request ) {
		$type       = 'verse' === $request->get_param( 'type' ) ? 'verse' : 'quote';
		$today      = current_time( 'Y-m-d' );
		$cache_key  = 'linkflow_daily_' . $type . '_' . $today;
		$cached     = get_transient( $cache_key );

		if ( is_array( $cached ) ) {
			return new WP_REST_Response( $cached, 200 );
		}

		$result = 'verse' === $type
			? $this->fetch_daily_verse( $today )
			: $this->fetch_daily_quote();

		if ( is_array( $result ) ) {
			set_transient( $cache_key, $result, DAY_IN_SECONDS );
			return new WP_REST_Response( $result, 200 );
		}

		return new WP_REST_Response( array( 'text' => '', 'source' => null ), 200 );
	}

	/**
	 * Fetch today's quote from ZenQuotes (no API key required).
	 *
	 * @return array|null
	 */
	private function fetch_daily_quote() {
		$response = wp_remote_get(
			'https://zenquotes.io/api/today',
			array( 'timeout' => 6 )
		);
		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			return null;
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $body ) || empty( $body[0]['q'] ) ) {
			return null;
		}

		return array(
			'type'      => 'quote',
			'text'      => sanitize_text_field( $body[0]['q'] ),
			'author'    => sanitize_text_field( $body[0]['a'] ?? 'Unknown' ),
			'reference' => null,
			'source'    => 'ZenQuotes',
			'sourceUrl' => 'https://zenquotes.io/',
		);
	}

	/**
	 * Fetch today's verse, preferring the official YouVersion "Verse of the Day"
	 * (when a YVP app key is configured) and falling back to a curated reference
	 * resolved against bible-api.com, which needs no key at all.
	 *
	 * @param string $today Y-m-d date used to pick and cache the day's reference.
	 * @return array|null
	 */
	private function fetch_daily_verse( $today ) {
		$app_key = LinkFlow_Settings::get_youversion_app_key();
		if ( $app_key ) {
			$result = $this->fetch_daily_verse_from_youversion( $today, $app_key );
			if ( is_array( $result ) ) {
				return $result;
			}
		}

		return $this->fetch_daily_verse_from_bible_api( $today );
	}

	/**
	 * Fetch the official YouVersion Verse of the Day via the YouVersion Platform
	 * API (https://developers.youversion.com/) using the app key configured on
	 * the Settings → LinkFlow admin page (stored in the WordPress database;
	 * never sent to the client).
	 *
	 * Bible version 3034 is the Berean Standard Bible, whose publisher dedicates
	 * the text to the public domain, so its content can be shown here freely.
	 *
	 * @param string $today   Y-m-d date used to pick the day-of-year.
	 * @param string $app_key Configured YouVersion app key.
	 * @return array|null
	 */
	private function fetch_daily_verse_from_youversion( $today, $app_key ) {
		$headers     = array( 'X-YVP-App-Key' => $app_key );
		$day_of_year = (int) gmdate( 'z', strtotime( $today ) ) + 1;

		$votd_response = wp_remote_get(
			'https://api.youversion.com/v1/verse_of_the_days/' . $day_of_year,
			array( 'timeout' => 6, 'headers' => $headers )
		);
		if ( is_wp_error( $votd_response ) || 200 !== wp_remote_retrieve_response_code( $votd_response ) ) {
			return null;
		}
		$votd = json_decode( wp_remote_retrieve_body( $votd_response ), true );
		if ( ! is_array( $votd ) || empty( $votd['passage_id'] ) ) {
			return null;
		}

		$passage_response = wp_remote_get(
			'https://api.youversion.com/v1/bibles/3034/passages/' . rawurlencode( $votd['passage_id'] ) . '?format=text',
			array( 'timeout' => 6, 'headers' => $headers )
		);
		if ( is_wp_error( $passage_response ) || 200 !== wp_remote_retrieve_response_code( $passage_response ) ) {
			return null;
		}
		$passage = json_decode( wp_remote_retrieve_body( $passage_response ), true );
		if ( ! is_array( $passage ) || empty( $passage['content'] ) ) {
			return null;
		}

		return array(
			'type'      => 'verse',
			'text'      => sanitize_textarea_field( trim( $passage['content'] ) ),
			'author'    => null,
			'reference' => sanitize_text_field( $passage['reference'] ?? $votd['passage_id'] ),
			'source'    => 'YouVersion (Berean Standard Bible)',
			'sourceUrl' => 'https://www.bible.com/verse-of-the-day',
		);
	}

	/**
	 * Fetch today's verse text from bible-api.com (no API key required), for a
	 * reference chosen deterministically by day-of-year from a curated list.
	 *
	 * @param string $today Y-m-d date used to pick and cache the day's reference.
	 * @return array|null
	 */
	private function fetch_daily_verse_from_bible_api( $today ) {
		$day_of_year = (int) gmdate( 'z', strtotime( $today ) );
		$reference   = self::$daily_verse_references[ $day_of_year % count( self::$daily_verse_references ) ];

		$response = wp_remote_get(
			'https://bible-api.com/' . rawurlencode( $reference ),
			array( 'timeout' => 6 )
		);
		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			return null;
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $body ) || empty( $body['text'] ) ) {
			return null;
		}

		return array(
			'type'      => 'verse',
			'text'      => sanitize_textarea_field( trim( $body['text'] ) ),
			'author'    => null,
			'reference' => sanitize_text_field( $body['reference'] ?? $reference ),
			'source'    => sanitize_text_field( $body['translation_name'] ?? 'World English Bible' ),
			'sourceUrl' => 'https://bible-api.com/',
		);
	}

	/**
	 * Get the user's current workspace.
	 *
	 * @return WP_REST_Response
	 */
	public function get_workspace() {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT workspace, version, updated_at FROM {$this->workspaces_table} WHERE user_id = %d", get_current_user_id() ),
			ARRAY_A
		);

		if ( ! is_array( $row ) ) {
			return $this->diagnostic_response(
				array( 'workspace' => null, 'version' => 0 ),
				200,
				array(
					'operation'       => 'pull_workspace',
					'databaseRowFound'=> false,
					'sectionCount'    => 0,
					'linkCount'       => 0,
				),
				0
			);
		}

		$workspace = json_decode( $row['workspace'], true );

		return $this->diagnostic_response(
			array(
				'workspace' => $workspace,
				'version'   => absint( $row['version'] ),
				'updatedAt' => $row['updated_at'],
			),
			200,
			array(
				'operation'        => 'pull_workspace',
				'databaseRowFound' => true,
				'storedBytes'      => strlen( $row['workspace'] ),
				'jsonDecoded'      => is_array( $workspace ),
				'sectionCount'     => is_array( $workspace ) && isset( $workspace['sections'] ) && is_array( $workspace['sections'] ) ? count( $workspace['sections'] ) : null,
				'linkCount'        => is_array( $workspace ) && isset( $workspace['links'] ) && is_array( $workspace['links'] ) ? count( $workspace['links'] ) : null,
				'databaseVersion'  => absint( $row['version'] ),
				'databaseUpdatedAt'=> $row['updated_at'],
			),
			absint( $row['version'] )
		);
	}

	/**
	 * Save the user's workspace with optimistic concurrency.
	 *
	 * @param WP_REST_Request $request Request data.
	 * @return WP_REST_Response|WP_Error
	 */
	public function save_workspace( WP_REST_Request $request ) {
		global $wpdb;

		$user_id          = get_current_user_id();
		$expected_version = absint( $request->get_header( 'x-linkflow-version' ) );
		$current          = $wpdb->get_row(
			$wpdb->prepare( "SELECT version, workspace FROM {$this->workspaces_table} WHERE user_id = %d", $user_id ),
			ARRAY_A
		);
		$current_version  = is_array( $current ) ? absint( $current['version'] ) : 0;
		// A client that predates a given workspace field (todos/timesheet/panelLayout
		// as of this writing) simply omits it from its POST body — that must NOT be
		// read as "clear this field," or an older client's ordinary save would wipe
		// data a newer client had written. sanitize_workspace() falls back to this
		// previously-stored value for any field missing from the incoming payload.
		$previous_workspace = is_array( $current ) && ! empty( $current['workspace'] ) ? json_decode( $current['workspace'], true ) : null;

		$workspace = $this->sanitize_workspace( $request->get_json_params(), is_array( $previous_workspace ) ? $previous_workspace : null );
		if ( is_wp_error( $workspace ) ) {
			$error_code = $workspace->get_error_code();
			$error_data = $workspace->get_error_data( $error_code );
			$workspace->add_data(
				array_merge(
					is_array( $error_data ) ? $error_data : array(),
					array( 'diagnostics' => $this->request_diagnostics( array( 'operation' => 'push_workspace', 'validation' => 'refused' ) ) )
				),
				$error_code
			);
			return $workspace;
		}

		if ( $expected_version !== $current_version ) {
			return new WP_Error(
				'linkflow_conflict',
				__( 'This workspace was updated on another device. Refresh before saving again.', 'linkflow-dashboard' ),
				array(
					'status'         => 409,
					'currentVersion' => $current_version,
					'diagnostics'    => $this->request_diagnostics(
						array(
							'operation'       => 'push_workspace',
							'writeDecision'   => 'refused_version_conflict',
							'expectedVersion' => $expected_version,
							'currentVersion'  => $current_version,
							'sectionCount'    => count( $workspace['sections'] ),
							'linkCount'       => count( $workspace['links'] ),
						)
					),
				)
			);
		}

		$new_version = $current_version + 1;
		$encoded     = wp_json_encode( $workspace );
		$now         = current_time( 'mysql', true );

		if ( 0 === $current_version ) {
			$result = $wpdb->insert(
				$this->workspaces_table,
				array( 'user_id' => $user_id, 'workspace' => $encoded, 'version' => $new_version, 'updated_at' => $now ),
				array( '%d', '%s', '%d', '%s' )
			);
		} else {
			$result = $wpdb->update(
				$this->workspaces_table,
				array( 'workspace' => $encoded, 'version' => $new_version, 'updated_at' => $now ),
				array( 'user_id' => $user_id ),
				array( '%s', '%d', '%s' ),
				array( '%d' )
			);
		}

		if ( false === $result ) {
			return new WP_Error(
				'linkflow_save_failed',
				__( 'Unable to save the workspace.', 'linkflow-dashboard' ),
				array(
					'status'      => 500,
					'diagnostics' => $this->request_diagnostics(
						array(
							'operation'       => 'push_workspace',
							'writeDecision'   => 'database_write_failed',
							'writeMode'       => 0 === $current_version ? 'insert' : 'update',
							'expectedVersion' => $expected_version,
							'currentVersion'  => $current_version,
							'newVersion'      => $new_version,
							'encodedBytes'    => strlen( $encoded ),
							'databaseError'   => $wpdb->last_error,
						)
					),
				)
			);
		}

		$revision_result = $wpdb->insert(
			$this->revisions_table,
			array( 'user_id' => $user_id, 'version' => $new_version, 'workspace' => $encoded, 'created_at' => $now ),
			array( '%d', '%d', '%s', '%s' )
		);
		$this->prune_revisions( $user_id );

		return $this->diagnostic_response(
			array( 'version' => $new_version, 'updatedAt' => $now ),
			200,
			array(
				'operation'          => 'push_workspace',
				'writeDecision'      => 'accepted_and_persisted',
				'writeMode'          => 0 === $current_version ? 'insert' : 'update',
				'expectedVersion'    => $expected_version,
				'previousVersion'    => $current_version,
				'newVersion'         => $new_version,
				'workspaceWriteRows' => $result,
				'revisionWriteRows'  => $revision_result,
				'encodedBytes'       => strlen( $encoded ),
				'sectionCount'       => count( $workspace['sections'] ),
				'linkCount'          => count( $workspace['links'] ),
				'databaseUpdatedAt'  => $now,
			),
			$new_version
		);
	}

	/**
	 * Return retained recovery points without their full payload.
	 *
	 * @return WP_REST_Response
	 */
	public function get_revisions() {
		global $wpdb;

		$rows = $wpdb->get_results(
			$wpdb->prepare( "SELECT version, created_at FROM {$this->revisions_table} WHERE user_id = %d ORDER BY version DESC LIMIT 20", get_current_user_id() ),
			ARRAY_A
		);
		return new WP_REST_Response( array( 'revisions' => $rows ), 200 );
	}

	/**
	 * Restore a historical snapshot as a new revision.
	 *
	 * @param WP_REST_Request $request Request data.
	 * @return WP_REST_Response|WP_Error
	 */
	public function restore_revision( WP_REST_Request $request ) {
		global $wpdb;

		$version = absint( $request['version'] );
		$row     = $wpdb->get_row(
			$wpdb->prepare( "SELECT workspace FROM {$this->revisions_table} WHERE user_id = %d AND version = %d", get_current_user_id(), $version ),
			ARRAY_A
		);
		if ( ! is_array( $row ) ) {
			return new WP_Error( 'linkflow_revision_not_found', __( 'The requested workspace revision no longer exists.', 'linkflow-dashboard' ), array( 'status' => 404 ) );
		}

		$restore_request = new WP_REST_Request( WP_REST_Server::EDITABLE, '/linkflow/v1/workspace' );
		$restore_request->set_body( $row['workspace'] );
		$restore_request->set_header( 'Content-Type', 'application/json' );
		$restore_request->set_header( 'x-linkflow-version', (string) $this->current_version() );
		return $this->save_workspace( $restore_request );
	}

	/**
	 * Permit the Tauri desktop WebView to call the hosted REST API.
	 *
	 * @param bool            $served Whether the request has already been served.
	 * @param WP_HTTP_Response $result REST response.
	 * @param WP_REST_Request  $request REST request.
	 * @param WP_REST_Server   $server REST server.
	 * @return bool
	 */
	public function allow_tauri_origin( $served, $result, $request, $server ) {
		$origin = get_http_origin();
		if ( in_array( $origin, array( 'tauri://localhost', 'http://tauri.localhost' ), true ) ) {
			header( 'Access-Control-Allow-Origin: ' . $origin ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			header( 'Access-Control-Allow-Headers: Authorization, Content-Type, X-LinkFlow-Token, X-LinkFlow-Version, X-LinkFlow-Request-ID, X-WP-Nonce' );
			header( 'Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS' );
			header( 'Access-Control-Expose-Headers: X-LinkFlow-Plugin-Version, X-LinkFlow-Server-Time, X-LinkFlow-User-ID, X-LinkFlow-Workspace-Version' );
		}

		return $served;
	}

	/**
	 * Validate the untrusted workspace document.
	 *
	 * @param mixed $workspace Submitted data.
	 * @return array|WP_Error
	 */
	private function sanitize_workspace( $workspace, $previous = null ) {
		if ( ! is_array( $workspace ) || ! isset( $workspace['sections'], $workspace['links'], $workspace['theme'] ) || ! is_array( $workspace['sections'] ) || ! is_array( $workspace['links'] ) || ! is_array( $workspace['theme'] ) ) {
			return new WP_Error( 'linkflow_invalid_workspace', __( 'A workspace must contain sections, links, and theme settings.', 'linkflow-dashboard' ), array( 'status' => 400 ) );
		}

		// todos/timesheet/panelLayout are optional at the top level (unlike
		// sections/links/theme) so a workspace saved before each feature shipped
		// still round-trips cleanly. Critically, "missing from this request" falls
		// back to whatever was already stored for the user (via $previous), not a
		// hardcoded empty default — otherwise a save from a client that predates one
		// of these fields (an old desktop build, say) would silently wipe it out for
		// every other client sharing the same account. An explicit empty array IS
		// still respected as "the user cleared this," since isset() distinguishes
		// "key absent" from "key present but empty."
		$previous_todos        = is_array( $previous ) && isset( $previous['todos'] ) && is_array( $previous['todos'] ) ? $previous['todos'] : array();
		$previous_timesheet    = is_array( $previous ) && isset( $previous['timesheet'] ) && is_array( $previous['timesheet'] ) ? $previous['timesheet'] : array();
		$previous_panel_layout = is_array( $previous ) && isset( $previous['panelLayout'] ) && is_array( $previous['panelLayout'] ) ? $previous['panelLayout'] : array();

		$raw_todos        = isset( $workspace['todos'] ) && is_array( $workspace['todos'] ) ? $workspace['todos'] : $previous_todos;
		$raw_timesheet    = isset( $workspace['timesheet'] ) && is_array( $workspace['timesheet'] ) ? $workspace['timesheet'] : $previous_timesheet;
		$raw_sessions     = isset( $raw_timesheet['sessions'] ) && is_array( $raw_timesheet['sessions'] ) ? $raw_timesheet['sessions'] : array();
		$raw_panel_layout = isset( $workspace['panelLayout'] ) && is_array( $workspace['panelLayout'] ) ? $workspace['panelLayout'] : $previous_panel_layout;
		$raw_widgets      = isset( $raw_panel_layout['widgets'] ) && is_array( $raw_panel_layout['widgets'] ) ? $raw_panel_layout['widgets'] : array();

		if (
			count( $workspace['sections'] ) > 100 || count( $workspace['links'] ) > 5000 ||
			count( $raw_todos ) > 500 || count( $raw_sessions ) > 2000 || count( $raw_widgets ) > 20
		) {
			return new WP_Error( 'linkflow_workspace_too_large', __( 'This workspace exceeds its supported size.', 'linkflow-dashboard' ), array( 'status' => 400 ) );
		}

		$sections = array();
		foreach ( $workspace['sections'] as $section ) {
			if ( ! is_array( $section ) || empty( $section['id'] ) || empty( $section['name'] ) ) {
				return new WP_Error( 'linkflow_invalid_section', __( 'Every section needs an ID and a name.', 'linkflow-dashboard' ), array( 'status' => 400 ) );
			}
			$sections[] = array(
				'id'            => sanitize_key( $section['id'] ),
				'name'          => sanitize_text_field( $section['name'] ),
				'icon'          => sanitize_key( isset( $section['icon'] ) ? $section['icon'] : 'folder' ),
				'isExpanded'    => ! empty( $section['isExpanded'] ),
				'allowCollapse' => ! empty( $section['allowCollapse'] ),
				'defaultState'  => isset( $section['defaultState'] ) && 'collapsed' === $section['defaultState'] ? 'collapsed' : 'expanded',
				'order'         => isset( $section['order'] ) ? absint( $section['order'] ) : count( $sections ) + 1,
			);
		}

		$section_ids = wp_list_pluck( $sections, 'id' );
		$links       = array();
		foreach ( $workspace['links'] as $link ) {
			if ( ! is_array( $link ) || empty( $link['id'] ) || empty( $link['name'] ) || empty( $link['url'] ) || empty( $link['sectionId'] ) || ! in_array( sanitize_key( $link['sectionId'] ), $section_ids, true ) ) {
				return new WP_Error( 'linkflow_invalid_link', __( 'Every link needs a valid section, name, and URL.', 'linkflow-dashboard' ), array( 'status' => 400 ) );
			}
			$raw_url = trim( (string) $link['url'] );
			// Older local workspaces can contain a bare domain (for example,
			// "portal.example.com"). Preserve that data safely by upgrading it
			// to HTTPS before applying the strict HTTP(S) validation below.
			if ( ! preg_match( '#^[a-z][a-z0-9+.-]*://#i', $raw_url ) ) {
				$raw_url = 'https://' . ltrim( $raw_url, '/' );
			}
			$url = esc_url_raw( $raw_url );
			$url_parts = wp_parse_url( $url );
			if (
				empty( $url ) ||
				false === $url_parts ||
				empty( $url_parts['host'] ) ||
				empty( $url_parts['scheme'] ) ||
				! in_array( strtolower( $url_parts['scheme'] ), array( 'http', 'https' ), true )
			) {
				return new WP_Error(
					'linkflow_invalid_url',
					sprintf(
						/* translators: %s: Link name. */
						__( 'The URL saved for "%s" is not a valid HTTP or HTTPS address.', 'linkflow-dashboard' ),
						sanitize_text_field( $link['name'] )
					),
					array( 'status' => 400, 'linkId' => sanitize_key( $link['id'] ) )
				);
			}
			$links[] = array(
				'id'          => sanitize_key( $link['id'] ),
				'name'        => sanitize_text_field( $link['name'] ),
				'url'         => $url,
				'sectionId'   => sanitize_key( $link['sectionId'] ),
				'icon'        => sanitize_key( isset( $link['icon'] ) ? $link['icon'] : 'link' ),
				'description' => sanitize_textarea_field( isset( $link['description'] ) ? $link['description'] : '' ),
				'category'    => sanitize_text_field( isset( $link['category'] ) ? $link['category'] : '' ),
				'isFavorite'  => ! empty( $link['isFavorite'] ),
				'isArchived'  => ! empty( $link['isArchived'] ),
				'clickCount'  => isset( $link['clickCount'] ) ? absint( $link['clickCount'] ) : 0,
				'createdAt'   => isset( $link['createdAt'] ) ? sanitize_text_field( $link['createdAt'] ) : gmdate( 'c' ),
			);
		}

		$theme = $workspace['theme'];
		if ( empty( $theme['accentColor'] ) || ! preg_match( '/^#[a-fA-F0-9]{6}$/', $theme['accentColor'] ) ) {
			return new WP_Error( 'linkflow_invalid_theme', __( 'The accent colour must be a six-digit hexadecimal value.', 'linkflow-dashboard' ), array( 'status' => 400 ) );
		}

		$iso_datetime_pattern = '/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/';

		$todos = array();
		foreach ( $raw_todos as $todo ) {
			if ( ! is_array( $todo ) || empty( $todo['id'] ) || ! isset( $todo['text'] ) || '' === trim( (string) $todo['text'] ) ) {
				return new WP_Error( 'linkflow_invalid_todo', __( 'Every task needs an ID and text.', 'linkflow-dashboard' ), array( 'status' => 400 ) );
			}
			$priority = isset( $todo['priority'] ) && in_array( $todo['priority'], array( 'low', 'medium', 'high' ), true ) ? $todo['priority'] : null;
			$due_date = null;
			if ( ! empty( $todo['dueDate'] ) && preg_match( $iso_datetime_pattern, (string) $todo['dueDate'] ) ) {
				$due_date = sanitize_text_field( $todo['dueDate'] );
			}
			$todos[] = array(
				'id'        => sanitize_key( $todo['id'] ),
				'text'      => sanitize_text_field( mb_substr( (string) $todo['text'], 0, 500 ) ),
				'done'      => ! empty( $todo['done'] ),
				'priority'  => $priority,
				'dueDate'   => $due_date,
				'createdAt' => isset( $todo['createdAt'] ) ? sanitize_text_field( $todo['createdAt'] ) : gmdate( 'c' ),
			);
		}

		$sessions = array();
		foreach ( $raw_sessions as $session ) {
			if (
				! is_array( $session ) || empty( $session['id'] ) ||
				empty( $session['start'] ) || empty( $session['end'] ) ||
				! preg_match( $iso_datetime_pattern, (string) $session['start'] ) ||
				! preg_match( $iso_datetime_pattern, (string) $session['end'] )
			) {
				return new WP_Error( 'linkflow_invalid_session', __( 'Every timesheet session needs a valid start and end time.', 'linkflow-dashboard' ), array( 'status' => 400 ) );
			}
			$sessions[] = array(
				'id'              => sanitize_key( $session['id'] ),
				'start'           => sanitize_text_field( $session['start'] ),
				'end'             => sanitize_text_field( $session['end'] ),
				'durationSeconds' => isset( $session['durationSeconds'] ) ? absint( $session['durationSeconds'] ) : 0,
				'activity'        => ! empty( $session['activity'] ) ? sanitize_textarea_field( mb_substr( (string) $session['activity'], 0, 1000 ) ) : '',
			);
		}
		$current_session_start = null;
		if ( ! empty( $raw_timesheet['currentSessionStart'] ) && preg_match( $iso_datetime_pattern, (string) $raw_timesheet['currentSessionStart'] ) ) {
			$current_session_start = sanitize_text_field( $raw_timesheet['currentSessionStart'] );
		}

		// sessionStartedAt/pausedElapsedMs (added for the pause/resume timer)
		// follow the same "missing falls back to what was previously stored"
		// rule as the top-level todos/timesheet/panelLayout fields above — an
		// older desktop client that predates pausing would otherwise send a
		// timesheet object without these two keys at all on its very next
		// unrelated save, silently discarding a paused-but-not-yet-logged
		// session on a newer client sharing the same account.
		$session_started_at = null;
		if ( array_key_exists( 'sessionStartedAt', $raw_timesheet ) ) {
			if ( ! empty( $raw_timesheet['sessionStartedAt'] ) && preg_match( $iso_datetime_pattern, (string) $raw_timesheet['sessionStartedAt'] ) ) {
				$session_started_at = sanitize_text_field( $raw_timesheet['sessionStartedAt'] );
			}
		} elseif ( ! empty( $previous_timesheet['sessionStartedAt'] ) ) {
			$session_started_at = sanitize_text_field( $previous_timesheet['sessionStartedAt'] );
		}

		$paused_elapsed_ms = 0;
		if ( array_key_exists( 'pausedElapsedMs', $raw_timesheet ) ) {
			$paused_elapsed_ms = max( 0, isset( $raw_timesheet['pausedElapsedMs'] ) ? (int) $raw_timesheet['pausedElapsedMs'] : 0 );
		} elseif ( isset( $previous_timesheet['pausedElapsedMs'] ) ) {
			$paused_elapsed_ms = max( 0, (int) $previous_timesheet['pausedElapsedMs'] );
		}

		$timesheet = array(
			'currentSessionStart' => $current_session_start,
			'sessionStartedAt'    => $session_started_at,
			'pausedElapsedMs'     => $paused_elapsed_ms,
			'sessions'            => $sessions,
			'weeklyTargetHours'   => min( 168, max( 0, isset( $raw_timesheet['weeklyTargetHours'] ) ? (float) $raw_timesheet['weeklyTargetHours'] : 40 ) ),
		);

		// Mirrors WIDGET_MIN_ROWS/WIDGET_MAX_ROWS in
		// linkflow-dashboard/src/components/widgets/gridConstants.ts — keep in sync.
		$widgets = array();
		foreach ( $raw_widgets as $widget ) {
			if ( ! is_array( $widget ) || empty( $widget['id'] ) || ! in_array( $widget['id'], array( 'todo', 'timesheet' ), true ) ) {
				return new WP_Error( 'linkflow_invalid_widget', __( 'Every panel-layout widget needs a valid ID.', 'linkflow-dashboard' ), array( 'status' => 400 ) );
			}
			$height_units = null;
			if ( isset( $widget['heightUnits'] ) && null !== $widget['heightUnits'] ) {
				$height_units = min( 60, max( 6, absint( $widget['heightUnits'] ) ) );
			}
			$widgets[] = array(
				'id'          => $widget['id'],
				'column'      => isset( $widget['column'] ) && 'right' === $widget['column'] ? 'right' : 'left',
				'order'       => isset( $widget['order'] ) ? absint( $widget['order'] ) : count( $widgets ),
				'heightUnits' => $height_units,
			);
		}
		$panel_layout = array( 'widgets' => $widgets );

		return array(
			'sections'    => $sections,
			'links'       => $links,
			'panelLayout' => $panel_layout,
			'todos'       => $todos,
			'timesheet'   => $timesheet,
			'theme'       => array(
				'preset'         => isset( $theme['preset'] ) && in_array( $theme['preset'], array( 'light', 'dark', 'glass' ), true ) ? $theme['preset'] : 'light',
				'accentColor'    => $theme['accentColor'],
				'bgBlur'         => min( 100, max( 0, isset( $theme['bgBlur'] ) ? absint( $theme['bgBlur'] ) : 0 ) ),
				'showCanvasImage' => ! empty( $theme['showCanvasImage'] ),
				'canvasImageUrl' => isset( $theme['canvasImageUrl'] ) ? esc_url_raw( $theme['canvasImageUrl'] ) : '',
				'cardOpacity'    => min( 1, max( 0.2, isset( $theme['cardOpacity'] ) ? (float) $theme['cardOpacity'] : 0.85 ) ),
				'fontPairId'     => isset( $theme['fontPairId'] ) ? sanitize_key( $theme['fontPairId'] ) : '',
				'headingWeight'  => min( 900, max( 300, isset( $theme['headingWeight'] ) ? absint( $theme['headingWeight'] ) : 700 ) ),
				'headingScale'   => min( 1.2, max( 0.85, isset( $theme['headingScale'] ) ? (float) $theme['headingScale'] : 1 ) ),
				'linkTextScale'  => min( 1.2, max( 0.85, isset( $theme['linkTextScale'] ) ? (float) $theme['linkTextScale'] : 1 ) ),
				'bgOverlayOpacity' => min( 1, max( 0, isset( $theme['bgOverlayOpacity'] ) ? (float) $theme['bgOverlayOpacity'] : 0.65 ) ),
			),
		);
	}

	/**
	 * Get the current workspace version.
	 *
	 * @return int
	 */
	private function current_version() {
		global $wpdb;
		return absint( $wpdb->get_var( $wpdb->prepare( "SELECT version FROM {$this->workspaces_table} WHERE user_id = %d", get_current_user_id() ) ) );
	}

	/**
	 * Keep a bounded recovery history per user.
	 *
	 * @param int $user_id WordPress user ID.
	 * @return void
	 */
	private function prune_revisions( $user_id ) {
		global $wpdb;
		$ids = $wpdb->get_col(
			$wpdb->prepare( "SELECT id FROM {$this->revisions_table} WHERE user_id = %d ORDER BY id DESC LIMIT 20, 1000", $user_id )
		);
		if ( empty( $ids ) ) {
			return;
		}

		$placeholders = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
		$query        = $wpdb->prepare( "DELETE FROM {$this->revisions_table} WHERE id IN ({$placeholders})", $ids ); // phpcs:ignore WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare
		$wpdb->query( $query ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
	}
}
