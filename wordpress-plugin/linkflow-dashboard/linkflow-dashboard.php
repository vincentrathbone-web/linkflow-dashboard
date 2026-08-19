<?php
/**
 * Plugin Name: LinkFlow Dashboard
 * Description: Cloud-backed personal link workspaces for WordPress and desktop clients.
 * Version: 0.4.32
 * Requires at least: 6.4
 * Requires PHP: 7.4
 * Author: Controll
 * License: GPL-2.0-or-later
 * Text Domain: linkflow-dashboard
 */

defined( 'ABSPATH' ) || exit;

define( 'LINKFLOW_DASHBOARD_VERSION', '0.4.32' );
define( 'LINKFLOW_DASHBOARD_DB_VERSION', '1' );
define( 'LINKFLOW_DASHBOARD_FILE', __FILE__ );
define( 'LINKFLOW_DASHBOARD_DIR', plugin_dir_path( __FILE__ ) );
define( 'LINKFLOW_DASHBOARD_URL', plugin_dir_url( __FILE__ ) );

require_once LINKFLOW_DASHBOARD_DIR . 'includes/class-linkflow-dashboard.php';
require_once LINKFLOW_DASHBOARD_DIR . 'includes/class-linkflow-google.php';
require_once LINKFLOW_DASHBOARD_DIR . 'includes/class-linkflow-settings.php';
require_once LINKFLOW_DASHBOARD_DIR . 'includes/class-linkflow-updates.php';

register_activation_hook( __FILE__, array( 'LinkFlow_Dashboard', 'activate' ) );
add_action( 'plugins_loaded', array( 'LinkFlow_Dashboard', 'instance' ) );
add_action( 'plugins_loaded', function () { new LinkFlow_Settings(); } );
