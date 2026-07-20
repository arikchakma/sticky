//! Automatic updates fetched from GitHub releases.

use log::{info, warn};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

/// Check for a newer release in the background.
///
/// Spawns a task that queries the update endpoint and, when a newer
/// version exists, asks the user whether to install it. On confirmation
/// the update is downloaded, installed, and the app relaunches.
pub fn check_in_background(app: &AppHandle) {
    // Dev builds are always version 0.1.0 and would nag about every
    // published release.
    if cfg!(debug_assertions) {
        return;
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = check(&app).await {
            warn!("Update check failed: {e}");
        }
    });
}

/// Perform a single update check, prompting the user on a hit.
async fn check(app: &AppHandle) -> tauri_plugin_updater::Result<()> {
    let Some(update) = app.updater()?.check().await? else {
        info!("No update available");
        return Ok(());
    };

    let message = format!(
        "Sticky {} is available (you have {}). Install it now?",
        update.version, update.current_version,
    );

    // Blocking is fine here: this runs on an async worker thread while
    // the dialog itself is presented on the main thread.
    let confirmed = app
        .dialog()
        .message(message)
        .title("Update Available")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install & Relaunch".into(),
            "Later".into(),
        ))
        .blocking_show();
    if !confirmed {
        return Ok(());
    }

    update.download_and_install(|_, _| {}, || {}).await?;
    app.restart()
}
