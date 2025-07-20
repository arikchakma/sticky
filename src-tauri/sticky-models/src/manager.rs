use crate::error::Result;
use crate::plugin::SqliteConnection;
use r2d2::{Pool, PooledConnection};
use r2d2_sqlite::SqliteConnectionManager;
use std::future::Future;
use tauri::{AppHandle, Manager, Runtime};

pub struct QueryManager {
    pool: Pool<SqliteConnectionManager>,
}

pub trait DBConnection {
    fn connect(
        &self,
    ) -> impl Future<Output = Result<PooledConnection<SqliteConnectionManager>>> + Send;
}

impl<R: Runtime> DBConnection for AppHandle<R> {
    async fn connect(&self) -> Result<PooledConnection<SqliteConnectionManager>> {
        let dbm = &*self.state::<SqliteConnection>();
        let db = dbm.0.lock().await.get()?;
        Ok(db)
    }
}
