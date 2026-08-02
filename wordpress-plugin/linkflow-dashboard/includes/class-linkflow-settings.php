<?php
/**
 * LinkFlow_Settings — a small wp-admin settings screen for server-side API
 * keys the plugin needs (currently just the YouVersion Platform app key used
 * for the official Verse of the Day). Kept separate from the workspace data
 * REST API: this is the one piece of LinkFlow configuration an admin sets
 * through the ordinary WordPress dashboard rather than through the app.
 *
 * @package LinkFlowDashboard
 */

defined( 'ABSPATH' ) || exit;

class LinkFlow_Settings {

	const OPTION_YOUVERSION_APP_KEY = 'linkflow_youversion_app_key';

	/**
	 * Set up WordPress hooks.
	 */
	public function __construct() {
		add_action( 'admin_menu', array( $this, 'register_settings_page' ) );
		add_action( 'admin_init', array( $this, 'register_setting' ) );
	}

	/**
	 * Get the configured YouVersion app key, if any.
	 *
	 * @return string
	 */
	public static function get_youversion_app_key() {
		return trim( (string) get_option( self::OPTION_YOUVERSION_APP_KEY, '' ) );
	}

	/**
	 * Add "LinkFlow" under Settings.
	 *
	 * @return void
	 */
	public function register_settings_page() {
		add_options_page(
			__( 'LinkFlow Settings', 'linkflow-dashboard' ),
			__( 'LinkFlow', 'linkflow-dashboard' ),
			'manage_options',
			'linkflow-dashboard-settings',
			array( $this, 'render_settings_page' )
		);
	}

	/**
	 * Register the setting with the Settings API.
	 *
	 * @return void
	 */
	public function register_setting() {
		register_setting(
			'linkflow_dashboard_settings',
			self::OPTION_YOUVERSION_APP_KEY,
			array(
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
				'default'           => '',
			)
		);

		add_settings_section(
			'linkflow_dashboard_integrations',
			__( 'Daily Inspiration', 'linkflow-dashboard' ),
			function () {
				echo '<p>' . esc_html__( 'Optional. Powers the "Verse of the Day" bubble on the Dashboard with YouVersion\'s official daily verse. Leave blank to use a free, keyless fallback verse feed instead.', 'linkflow-dashboard' ) . '</p>';
			},
			'linkflow-dashboard-settings'
		);

		add_settings_field(
			self::OPTION_YOUVERSION_APP_KEY,
			__( 'YouVersion App Key', 'linkflow-dashboard' ),
			array( $this, 'render_youversion_field' ),
			'linkflow-dashboard-settings',
			'linkflow_dashboard_integrations'
		);
	}

	/**
	 * Render the app-key input.
	 *
	 * @return void
	 */
	public function render_youversion_field() {
		$value = self::get_youversion_app_key();
		printf(
			'<input type="password" autocomplete="off" name="%1$s" id="%1$s" value="%2$s" class="regular-text" placeholder="%3$s" />',
			esc_attr( self::OPTION_YOUVERSION_APP_KEY ),
			esc_attr( $value ),
			esc_attr__( 'Paste the App Key from platform.youversion.com', 'linkflow-dashboard' )
		);
		echo '<p class="description">' . esc_html__( 'Free, non-commercial app key from the YouVersion Platform Portal. Stored in the WordPress database; never sent to the browser.', 'linkflow-dashboard' ) . '</p>';
	}

	/**
	 * Render the settings page.
	 *
	 * @return void
	 */
	public function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'LinkFlow Settings', 'linkflow-dashboard' ); ?></h1>
			<form method="post" action="options.php">
				<?php
				settings_fields( 'linkflow_dashboard_settings' );
				do_settings_sections( 'linkflow-dashboard-settings' );
				submit_button();
				?>
			</form>
		</div>
		<?php
	}
}
