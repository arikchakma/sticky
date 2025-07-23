use log::error;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::fs::create_dir_all;
use std::time::Duration;
use tauri::async_runtime::Mutex;
use tauri::plugin::TauriPlugin;
use tauri::{Manager, Runtime};

use crate::migrate::migrate_db;

pub struct SqliteConnection(pub Mutex<Pool<SqliteConnectionManager>>);

impl SqliteConnection {
    pub(crate) fn new(pool: Pool<SqliteConnectionManager>) -> Self {
        Self(Mutex::new(pool))
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("sticky_models")
        .setup(|app_handle, _api| {
            let app_path = app_handle.path().app_data_dir().unwrap();
            create_dir_all(app_path.clone())
                .expect("Problem creating App directory!");

            let db_file_path = app_path.join("db.sqlite");

            let manager = SqliteConnectionManager::file(db_file_path);
            let pool = Pool::builder()
                .max_size(100) // Up from 10 (just in case)
                .connection_timeout(Duration::from_secs(10)) // Down from 30
                .build(manager)
                .unwrap();

            if let Err(e) = migrate_db(&pool) {
                error!("Failed to run database migration {e:?}");
                return Err(Box::from(e.to_string()));
            }

            app_handle.manage(SqliteConnection::new(pool.clone()));
            Ok(())
        })
        .build()
}
