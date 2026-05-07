use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use notify_debouncer_full::notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, Debouncer, RecommendedCache};
use tauri::{AppHandle, Emitter, Manager};

type WatcherInstance = Debouncer<notify_debouncer_full::notify::RecommendedWatcher, RecommendedCache>;

pub struct FsWatcherState(pub Mutex<HashMap<String, WatcherInstance>>);

#[derive(serde::Serialize, Clone)]
struct FolderChangedPayload {
    root: String,
    paths: Vec<String>,
}

fn changed_dirs(events: &[notify_debouncer_full::DebouncedEvent]) -> Vec<String> {
    let mut dirs = HashSet::new();
    for event in events {
        for path in &event.paths {
            if let Some(parent) = path.parent() {
                dirs.insert(parent.to_string_lossy().into_owned());
            }
            if path.is_dir() {
                dirs.insert(path.to_string_lossy().into_owned());
            }
        }
    }
    dirs.into_iter().collect()
}

#[tauri::command]
pub fn start_watching(path: String, app: AppHandle) -> Result<(), String> {
    let state = app.state::<FsWatcherState>();
    let mut watchers = state.0.lock().map_err(|e| e.to_string())?;

    watchers.remove(&path);

    let root = path.clone();
    let app_handle = app.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        None,
        move |result: Result<Vec<notify_debouncer_full::DebouncedEvent>, Vec<notify_debouncer_full::notify::Error>>| {
            match result {
                Ok(events) => {
                    let dirs = changed_dirs(&events);
                    if !dirs.is_empty() {
                        let _ = app_handle.emit(
                            "folder-changed",
                            FolderChangedPayload {
                                root: root.clone(),
                                paths: dirs,
                            },
                        );
                    }
                }
                Err(errors) => {
                    log::warn!("File watcher errors: {:?}", errors);
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    watchers.insert(path, debouncer);
    Ok(())
}

#[tauri::command]
pub fn stop_watching(path: String, app: AppHandle) -> Result<(), String> {
    let state = app.state::<FsWatcherState>();
    let mut watchers = state.0.lock().map_err(|e| e.to_string())?;
    watchers.remove(&path);
    Ok(())
}
