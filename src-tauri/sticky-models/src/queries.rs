use crate::error::Result;
use crate::models::{ModelType, Note, NoteIden, SettingIden};
use crate::plugin::SqliteConnection;
use chrono::{DateTime, Utc};
use nanoid::nanoid;
use sea_query::ColumnRef::Asterisk;
use sea_query::Keyword::CurrentTimestamp;
use sea_query::{Expr, OnConflict, Order, Query, SqliteQueryBuilder};
use rusqlite::OptionalExtension;
use sea_query_rusqlite::RusqliteBinder;
use tauri::{AppHandle, Manager, Runtime};

pub async fn list_notes<R: Runtime>(
    app_handle: &AppHandle<R>,
) -> Result<Vec<Note>> {
    let dbm = &*app_handle.state::<SqliteConnection>();
    let db = dbm.0.lock().await.get().unwrap();

    let (sql, params) = Query::select()
        .from(NoteIden::Table)
        .column(Asterisk)
        .order_by(NoteIden::UpdatedAt, Order::Desc)
        .build_rusqlite(SqliteQueryBuilder);
    let mut stmt = db.prepare(sql.as_str())?;
    let items = stmt.query_map(&*params.as_params(), |row| row.try_into())?;
    Ok(items.map(|v| v.unwrap()).collect())
}

pub async fn get_note<R: Runtime>(
    app_handle: &AppHandle<R>,
    id: &str,
) -> Result<Note> {
    let dbm = &*app_handle.state::<SqliteConnection>();
    let db = dbm.0.lock().await.get().unwrap();

    let (sql, params) = Query::select()
        .from(NoteIden::Table)
        .column(Asterisk)
        .cond_where(Expr::col(NoteIden::Id).eq(id))
        .build_rusqlite(SqliteQueryBuilder);
    let mut stmt = db.prepare(sql.as_str())?;
    Ok(stmt.query_row(&*params.as_params(), |row| row.try_into())?)
}

pub async fn upsert_note<R: Runtime>(
    app_handle: &AppHandle<R>,
    note: Note,
) -> Result<Note> {
    let id = match note.id.as_str() {
        "" => generate_model_id(ModelType::TypeNote),
        _ => note.id.to_string(),
    };

    let note_value = note.content.clone();

    let dbm = &*app_handle.state::<SqliteConnection>();
    let db = dbm.0.lock().await.get().unwrap();

    let (sql, params) = Query::insert()
        .into_table(NoteIden::Table)
        .columns([
            NoteIden::Id,
            NoteIden::CreatedAt,
            NoteIden::UpdatedAt,
            NoteIden::Content,
        ])
        .values_panic([
            id.as_str().into(),
            timestamp_for_upsert(note.created_at).into(),
            timestamp_for_upsert(note.updated_at).into(),
            note_value.into(),
        ])
        .on_conflict(
            OnConflict::column(NoteIden::Id)
                .update_columns([NoteIden::UpdatedAt, NoteIden::Content])
                .values([(NoteIden::UpdatedAt, CurrentTimestamp.into())])
                .to_owned(),
        )
        .returning_all()
        .build_rusqlite(SqliteQueryBuilder);

    let mut stmt = db.prepare(sql.as_str())?;
    let note: Note =
        stmt.query_row(&*params.as_params(), |row| row.try_into())?;
    Ok(note)
}

pub async fn delete_note<R: Runtime>(
    app_handle: &AppHandle<R>,
    id: &str,
) -> Result<()> {
    let dbm = &*app_handle.state::<SqliteConnection>();
    let db = dbm.0.lock().await.get().unwrap();

    let (sql, params) = Query::delete()
        .from_table(NoteIden::Table)
        .cond_where(Expr::col(NoteIden::Id).eq(id))
        .build_rusqlite(SqliteQueryBuilder);

    let mut stmt = db.prepare(sql.as_str())?;
    stmt.execute(&*params.as_params())?;
    Ok(())
}

pub async fn get_setting<R: Runtime>(
    app_handle: &AppHandle<R>,
    key: &str,
) -> Result<Option<String>> {
    let dbm = &*app_handle.state::<SqliteConnection>();
    let db = dbm.0.lock().await.get().unwrap();

    let (sql, params) = Query::select()
        .from(SettingIden::Table)
        .column(SettingIden::Value)
        .cond_where(Expr::col(SettingIden::Key).eq(key))
        .build_rusqlite(SqliteQueryBuilder);
    let mut stmt = db.prepare(sql.as_str())?;
    let res: Option<String> = stmt
        .query_row(&*params.as_params(), |row| row.get(0))
        .optional()?;
    Ok(res)
}

pub async fn set_setting<R: Runtime>(
    app_handle: &AppHandle<R>,
    key: &str,
    value: &str,
) -> Result<()> {
    let dbm = &*app_handle.state::<SqliteConnection>();
    let db = dbm.0.lock().await.get().unwrap();

    let (sql, params) = Query::insert()
        .into_table(SettingIden::Table)
        .columns([SettingIden::Key, SettingIden::Value])
        .values_panic([key.into(), value.into()])
        .on_conflict(
            OnConflict::column(SettingIden::Key)
                .update_column(SettingIden::Value)
                .to_owned(),
        )
        .build_rusqlite(SqliteQueryBuilder);

    let mut stmt = db.prepare(sql.as_str())?;
    stmt.execute(&*params.as_params())?;
    Ok(())
}

pub fn generate_model_id(model: ModelType) -> String {
    let id = generate_id();
    format!("{}_{}", model.id_prefix(), id)
}

pub fn generate_id() -> String {
    let alphabet: [char; 57] = [
        '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f',
        'g', 'h', 'i', 'j', 'k', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u',
        'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J',
        'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y',
        'Z',
    ];

    nanoid!(10, &alphabet)
}

// generate the timestamp for an upsert operation
// if the timestamp is 0, use the current time
// otherwise, use the provided timestamp
fn timestamp_for_upsert(dt: DateTime<Utc>) -> DateTime<Utc> {
    if dt.timestamp() == 0 {
        Utc::now()
    } else {
        dt
    }
}
