#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        tauri_plugin_sql::Migration {
            version: 1,
            description: "create_initial_smartbiz_schema",
            sql: include_str!("../../../../packages/core/migrations/0001_initial.sql"),
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 2,
            description: "enforce_one_business_per_installation",
            sql: include_str!(
                "../../../../packages/core/migrations/0002_single_business_installation.sql"
            ),
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 3,
            description: "add_inventory_customers_billing",
            sql: include_str!("../../../../packages/core/migrations/0003_inventory_customers_billing.sql"),
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 4,
            description: "add_suppliers_and_purchase_receipts",
            sql: include_str!("../../../../packages/core/migrations/0004_suppliers_purchases.sql"),
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 5,
            description: "add_supplier_credits_payments_and_fifo_costs",
            sql: include_str!("../../../../packages/core/migrations/0005_purchasing_finance_costs.sql"),
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 6,
            description: "preserve_fifo_layers_through_stock_restoration",
            sql: include_str!("../../../../packages/core/migrations/0006_fifo_cost_layer_restoration.sql"),
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 7,
            description: "add_indian_gst_foundation",
            sql: include_str!("../../../../packages/core/migrations/0007_indian_gst_foundation.sql"),
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 8,
            description: "gst_purchase_itc",
            sql: include_str!("../../../../packages/core/migrations/0008_gst_purchase_itc.sql"),
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:smartbiz.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("failed to run SmartBiz POS desktop shell");
}
