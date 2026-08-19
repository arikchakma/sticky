//! Automatic updates fetched from GitHub releases.

use log::{info, warn};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

use crate::window::MAIN_WINDOW_PREFIX;

/// The event carrying download progress (0-100) to a note window, where
/// it surfaces as a toast.
const PROGRESS_EVENT: &str = "update:progress";

/// Check for a newer release in the background, silently.
///
/// Spawns a task that queries the update endpoint and, when a newer
/// version exists, asks the user whether to install it. On confirmation
/// the update is downloaded, installed, and the app relaunches. Nothing
/// is shown when the app is already up to date.
pub fn check_in_background(app: &AppHandle) {
    // Dev builds are always version 0.1.0 and would nag about every
    // published release.
    if cfg!(debug_assertions) {
        return;
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = check(&app, false).await {
            warn!("Update check failed: {e}");
        }
    });
}

/// Check for updates in response to an explicit request, reporting the
/// outcome to the user: an up-to-date notice, download progress, and any
/// errors. Backs the "Check for Updates" command and tray item.
pub fn check_now(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Dev builds report themselves as 0.1.0 and can't install a real
        // installer; say so rather than failing cryptically.
        if cfg!(debug_assertions) {
            app.dialog()
                .message("Updates aren't available in development builds.")
                .title("Check for Updates")
                .blocking_show();
            return;
        }

        if let Err(e) = check(&app, true).await {
            warn!("Update check failed: {e}");
            app.dialog()
                .message(format!("Could not check for updates.\n\n{e}"))
                .title("Check for Updates")
                .kind(MessageDialogKind::Error)
                .blocking_show();
        }
    });
}

/// Perform a single update check. With `foreground` set, the app is
/// visibly responding to the user, so an up-to-date result is confirmed
/// with a dialog; the background check stays silent in that case.
async fn check(
    app: &AppHandle,
    foreground: bool,
) -> tauri_plugin_updater::Result<()> {
    let Some(update) = app.updater()?.check().await? else {
        info!("No update available");
        if foreground {
            let version = app.package_info().version.to_string();
            app.dialog()
                .message(format!(
                    "You're up to date.\n\nSticky {version} is the latest version."
                ))
                .title("Check for Updates")
                .blocking_show();
        }
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

    // Show the download progress as a toast in a note window, if one is
    // open; the check can run with no window visible.
    let target = progress_window(app);
    emit_progress(app, &target, 0);

    let mut downloaded: usize = 0;
    let mut last_step: u8 = 0;
    update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk;
                let Some(total) = total else {
                    return;
                };
                if total == 0 {
                    return;
                }
                let percent = (downloaded as f64 / total as f64 * 100.0) as u8;
                // Throttle to 10% steps so the toast isn't rewritten on
                // every chunk.
                let step = percent / 10 * 10;
                if step > last_step {
                    last_step = step;
                    emit_progress(app, &target, step);
                }
            },
            || {},
        )
        .await?;

    emit_progress(app, &target, 100);
    app.restart()
}

/// The note window that download-progress toasts should show over: the
/// focused one, or any open note window otherwise.
fn progress_window(app: &AppHandle) -> Option<WebviewWindow> {
    let notes = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| label.starts_with(MAIN_WINDOW_PREFIX))
        .map(|(_, w)| w);

    let mut fallback = None;
    for window in notes {
        if window.is_focused().unwrap_or(false) {
            return Some(window);
        }
        fallback.get_or_insert(window);
    }
    fallback
}

/// Send a progress percentage to the target window, if there is one.
fn emit_progress(app: &AppHandle, target: &Option<WebviewWindow>, percent: u8) {
    if let Some(w) = target {
        let _ = app.emit_to(w.label(), PROGRESS_EVENT, percent);
    }
}
