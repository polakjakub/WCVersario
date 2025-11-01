<?php
/**
 * Plugin Name: WCVersario
 * Description: Umožňuje hromadné nastavení variant produktu WooCommerce pomocí tabulky.
 * Version: 1.0.0
 * Author: OpenAI Assistant
 * Text Domain: wcversario
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

if ( ! class_exists( 'WCVersario_Plugin' ) ) {
    class WCVersario_Plugin {

        public function __construct() {
            add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_assets' ) );
            add_filter( 'woocommerce_product_data_tabs', array( $this, 'add_product_data_tab' ), 100 );
            add_action( 'woocommerce_product_data_panels', array( $this, 'render_product_data_panel' ) );
            add_action( 'woocommerce_product_data_panels', array( $this, 'render_modal_container' ) );
            add_action( 'wp_ajax_wcversario_get_product_data', array( $this, 'ajax_get_product_data' ) );
            add_action( 'wp_ajax_wcversario_save_variations', array( $this, 'ajax_save_variations' ) );
        }

        /**
         * Enqueue admin scripts and styles.
         */
        public function enqueue_admin_assets( $hook ) {
            if ( 'post.php' !== $hook && 'post-new.php' !== $hook ) {
                return;
            }

            $screen = get_current_screen();
            if ( empty( $screen ) || 'product' !== $screen->id ) {
                return;
            }

            wp_enqueue_style(
                'wcversario-admin',
                plugin_dir_url( __FILE__ ) . 'assets/css/admin.css',
                array(),
                '1.0.0'
            );

            wp_enqueue_script(
                'wcversario-admin',
                plugin_dir_url( __FILE__ ) . 'assets/js/admin.js',
                array( 'jquery', 'wp-util' ),
                '1.0.0',
                true
            );

            wp_localize_script(
                'wcversario-admin',
                'wcversarioAdmin',
                array(
                    'nonce'      => wp_create_nonce( 'wcversario_admin' ),
                    'i18n'       => array(
                        'modalTitle'        => __( 'Varianty tabulkou', 'wcversario' ),
                        'firstAttribute'    => __( 'První vlastnost', 'wcversario' ),
                        'secondAttribute'   => __( 'Druhá vlastnost', 'wcversario' ),
                        'selectPlaceholder' => __( 'Vyberte…', 'wcversario' ),
                        'noAttributes'      => __( 'Produkt nemá atributy použité pro varianty.', 'wcversario' ),
                        'selectAttributes'  => __( 'Vyberte dvě vlastnosti, které chcete upravit.', 'wcversario' ),
                        'confirmChanges'    => __( 'Potvrdit změny', 'wcversario' ),
                        'changesHeading'    => __( 'Přehled změn', 'wcversario' ),
                        'noChanges'         => __( 'Žádné změny.', 'wcversario' ),
                        'existing'          => __( 'existuje', 'wcversario' ),
                        'willCreate'        => __( 'bude vytvořeno', 'wcversario' ),
                        'willDelete'        => __( 'bude odstraněno', 'wcversario' ),
                        'differentAttributes' => __( 'Vyberte dvě různé vlastnosti.', 'wcversario' ),
                        'requiresVariable'  => __( 'Tato funkce je dostupná pouze pro variabilní produkty.', 'wcversario' ),
                        'loading'           => __( 'Načítám…', 'wcversario' ),
                        'error'             => __( 'Nastala chyba. Zkuste to prosím znovu.', 'wcversario' ),
                        'invalidSelection'  => __( 'Vyberte prosím možnosti pro obě vlastnosti.', 'wcversario' ),
                    ),
                    'ajaxUrl'    => admin_url( 'admin-ajax.php' ),
                )
            );
        }

        /**
         * Register custom product data tab.
         *
         * @param array $tabs Existing product data tabs.
         * @return array
         */
        public function add_product_data_tab( $tabs ) {
            $tabs['wcversario'] = array(
                'label'    => __( 'Varianty tabulkou', 'wcversario' ),
                'target'   => 'wcversario_options_panel',
                'class'    => array( 'show_if_variable' ),
                'priority' => 1000,
            );

            return $tabs;
        }

        /**
         * Render trigger button within a WooCommerce options panel.
         */
        public function render_product_data_panel() {
            global $post;

            $product_id = ! empty( $post ) ? $post->ID : 0;

            echo '<div id="wcversario_options_panel" class="panel woocommerce_options_panel hidden wcversario-options-panel">';
            echo '  <div class="options_group wcversario-options">';
            echo '      <p class="form-field">';
            echo '          <button type="button" class="button button-secondary wcversario-open" data-product-id="' . esc_attr( $product_id ) . '">' . esc_html__( 'Nastavit tabulkou', 'wcversario' ) . '</button>';
            echo '      </p>';
            echo '      <p class="wcversario-helper">' . esc_html__( 'Dostupné pouze pro produkty s variantami.', 'wcversario' ) . '</p>';
            echo '  </div>';
            echo '</div>';
        }

        /**
         * Render modal container markup.
         */
        public function render_modal_container() {
            echo '<div id="wcversario-modal" class="wcversario-modal" aria-hidden="true">';
            echo '  <div class="wcversario-modal__backdrop"></div>';
            echo '  <div class="wcversario-modal__dialog" role="dialog" aria-modal="true">';
            echo '      <div class="wcversario-modal__header">';
            echo '          <h2 class="wcversario-modal__title"></h2>';
            echo '          <button type="button" class="wcversario-modal__close" aria-label="' . esc_attr__( 'Zavřít', 'wcversario' ) . '">&times;</button>';
            echo '      </div>';
            echo '      <div class="wcversario-modal__content"></div>';
            echo '  </div>';
            echo '</div>';
        }

        /**
         * Handle AJAX request for product data.
         */
        public function ajax_get_product_data() {
            check_ajax_referer( 'wcversario_admin', 'nonce' );

            $product_id = isset( $_POST['product_id'] ) ? absint( $_POST['product_id'] ) : 0;

            if ( ! $product_id ) {
                wp_send_json_error( array( 'message' => __( 'Neplatné ID produktu.', 'wcversario' ) ) );
            }

            $product = wc_get_product( $product_id );

            if ( ! $product || 'variable' !== $product->get_type() ) {
                wp_send_json_error( array( 'message' => __( 'Produkt není typu s variantami.', 'wcversario' ) ) );
            }

            $attributes = array();
            foreach ( $product->get_attributes() as $attribute ) {
                if ( ! $attribute->get_variation() ) {
                    continue;
                }

                $terms = array();
                if ( $attribute->is_taxonomy() ) {
                    $attribute_terms = $attribute->get_terms();
                    if ( ! empty( $attribute_terms ) ) {
                        foreach ( $attribute_terms as $term ) {
                            $terms[] = array(
                                'slug' => $term->slug,
                                'name' => $term->name,
                            );
                        }
                    }
                } else {
                    foreach ( $attribute->get_options() as $option ) {
                        $terms[] = array(
                            'slug' => sanitize_title( $option ),
                            'name' => $option,
                        );
                    }
                }

                $attributes[] = array(
                    'name'         => $attribute->get_name(),
                    'label'        => wc_attribute_label( $attribute->get_name() ),
                    'terms'        => $terms,
                    'is_taxonomy'  => $attribute->is_taxonomy(),
                );
            }

            if ( empty( $attributes ) ) {
                wp_send_json_error( array( 'message' => __( 'Produkt nemá atributy použité pro varianty.', 'wcversario' ) ) );
            }

            $variations = array();
            foreach ( $product->get_children() as $variation_id ) {
                $variation = wc_get_product( $variation_id );
                if ( ! $variation ) {
                    continue;
                }

                $variation_attributes = array();
                foreach ( $variation->get_attributes() as $attr_key => $attr_value ) {
                    $clean_key = str_replace( 'attribute_', '', $attr_key );
                    $variation_attributes[ $clean_key ] = $attr_value;
                }

                $variations[] = array(
                    'id'         => $variation_id,
                    'attributes' => $variation_attributes,
                    'status'     => $variation->get_status(),
                );
            }

            wp_send_json_success(
                array(
                    'attributes' => $attributes,
                    'variations' => $variations,
                )
            );
        }

        /**
         * Handle AJAX request to save variation changes.
         */
        public function ajax_save_variations() {
            check_ajax_referer( 'wcversario_admin', 'nonce' );

            $product_id = isset( $_POST['product_id'] ) ? absint( $_POST['product_id'] ) : 0;

            $create_raw = isset( $_POST['create'] ) ? wp_unslash( $_POST['create'] ) : array();
            $delete_raw = isset( $_POST['delete'] ) ? wp_unslash( $_POST['delete'] ) : array();

            if ( is_string( $create_raw ) ) {
                $create = json_decode( $create_raw, true );
            } else {
                $create = $create_raw;
            }

            if ( is_string( $delete_raw ) ) {
                $delete = json_decode( $delete_raw, true );
            } else {
                $delete = $delete_raw;
            }

            if ( ! is_array( $create ) ) {
                $create = array();
            }

            if ( ! is_array( $delete ) ) {
                $delete = array();
            }

            if ( ! $product_id ) {
                wp_send_json_error( array( 'message' => __( 'Neplatné ID produktu.', 'wcversario' ) ) );
            }

            $product = wc_get_product( $product_id );

            if ( ! $product || 'variable' !== $product->get_type() ) {
                wp_send_json_error( array( 'message' => __( 'Produkt není typu s variantami.', 'wcversario' ) ) );
            }

            $created = array();
            $deleted = array();

            if ( ! empty( $create ) && is_array( $create ) ) {
                foreach ( $create as $combination ) {
                    if ( empty( $combination['attributes'] ) || ! is_array( $combination['attributes'] ) ) {
                        continue;
                    }

                    $variation_id = $this->create_variation( $product_id, $combination['attributes'] );
                    if ( $variation_id ) {
                        $created[] = $variation_id;
                    }
                }
            }

            if ( ! empty( $delete ) && is_array( $delete ) ) {
                foreach ( $delete as $variation_id ) {
                    $variation_id = absint( $variation_id );
                    if ( $variation_id && 'product_variation' === get_post_type( $variation_id ) ) {
                        wp_delete_post( $variation_id, true );
                        $deleted[] = $variation_id;
                    }
                }
            }

            if ( class_exists( 'WC_Product_Variable' ) ) {
                if ( method_exists( 'WC_Product_Variable', 'sync' ) ) {
                    WC_Product_Variable::sync( $product_id );
                }

                if ( method_exists( 'WC_Product_Variable', 'sync_stock_status' ) ) {
                    WC_Product_Variable::sync_stock_status( $product_id );
                }
            }

            wc_delete_product_transients( $product_id );

            wp_send_json_success(
                array(
                    'created' => $created,
                    'deleted' => $deleted,
                )
            );
        }

        /**
         * Create a product variation.
         *
         * @param int   $product_id Product ID.
         * @param array $attributes Attributes map (attribute slug => term slug).
         *
         * @return int|false Variation ID on success, false otherwise.
         */
        protected function create_variation( $product_id, $attributes ) {
            $variation_post = array(
                'post_title'  => get_the_title( $product_id ) . ' variation',
                'post_name'   => 'product-' . $product_id . '-variation-' . wp_generate_password( 6, false ),
                'post_status' => 'publish',
                'post_parent' => $product_id,
                'post_type'   => 'product_variation',
                'menu_order'  => -1,
            );

            $variation_id = wp_insert_post( $variation_post );

            if ( is_wp_error( $variation_id ) || ! $variation_id ) {
                return false;
            }

            $variation = new WC_Product_Variation( $variation_id );

            $variation_attributes = array();
            foreach ( $attributes as $key => $value ) {
                $attribute_key                        = 'attribute_' . sanitize_title( $key );
                $variation_attributes[ $attribute_key ] = wc_clean( $value );
            }

            $variation->set_attributes( $variation_attributes );
            $variation->set_status( 'publish' );
            $variation->save();

            return $variation_id;
        }
    }
}

new WCVersario_Plugin();
