use crate::error::Result;
use crate::models::{ModelType, Note};
use crate::store::NotesStore;
use nanoid::nanoid;
use tauri::{AppHandle, Manager, Runtime};

/// List all notes, newest first.
pub async fn list_notes<R: Runtime>(
    app_handle: &AppHandle<R>,
) -> Result<Vec<Note>> {
    app_handle.state::<NotesStore>().list()
}

/// Read a single note by id.
pub async fn get_note<R: Runtime>(
    app_handle: &AppHandle<R>,
    id: &str,
) -> Result<Note> {
    app_handle.state::<NotesStore>().get(id)
}

/// Write a note, creating it when the id is empty.
pub async fn upsert_note<R: Runtime>(
    app_handle: &AppHandle<R>,
    note: Note,
) -> Result<Note> {
    app_handle.state::<NotesStore>().upsert(note)
}

/// Delete a note by id.
pub async fn delete_note<R: Runtime>(
    app_handle: &AppHandle<R>,
    id: &str,
) -> Result<()> {
    app_handle.state::<NotesStore>().delete(id)
}

/// Generate a fresh id with the model's prefix, like `note_C7dKUnuR`.
pub fn generate_model_id(model: ModelType) -> String {
    let id = generate_id();
    format!("{}_{}", model.id_prefix(), id)
}

/// Generate a 10-character nanoid without easily confused characters.
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
