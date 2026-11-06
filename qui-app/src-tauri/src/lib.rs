use serde::{Deserialize, Serialize};
use std::env;
use std::error::Error;
use std::fs;
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

const CONTAINER_NAME: &str = "qui";
const IMAGE_NAME: &str = "ghcr.io/autobrr/qui:latest";
const QUI_PORT: u16 = 7476;

const SQUIRCLE_INJECTION_SCRIPT: &str = r#"
(function() {
  function applySquircleTheme() {
    if (!document.getElementById('tauri-squircle-style')) {
      const style = document.createElement('style');
      style.id = 'tauri-squircle-style';
      style.textContent = `
        html, body {
          border-radius: 22px !important;
          overflow: hidden !important;
          background-color: rgba(15, 17, 23, 0.72) !important;
          -webkit-backdrop-filter: blur(40px) saturate(180%) !important;
          backdrop-filter: blur(40px) saturate(180%) !important;
          box-sizing: border-box !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          -webkit-mask-image: -webkit-radial-gradient(white, black) !important;
        }
        #root {
          background: transparent !important;
        }
        .tauri-drag-strip {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          height: 26px !important;
          z-index: 999999 !important;
          -webkit-app-region: drag !important;
          pointer-events: auto !important;
        }
        .tauri-floating-controls {
          position: fixed !important;
          top: 10px !important;
          left: 12px !important;
          z-index: 1000000 !important;
          display: flex !important;
          align-items: center !important;
          gap: 7px !important;
          opacity: 0.2 !important;
          transition: opacity 0.2s ease, transform 0.2s ease !important;
          -webkit-app-region: no-drag !important;
          padding: 4px 6px !important;
          border-radius: 12px !important;
          background: rgba(0, 0, 0, 0.25) !important;
          backdrop-filter: blur(8px) !important;
          -webkit-backdrop-filter: blur(8px) !important;
        }
        .tauri-floating-controls:hover {
          opacity: 1 !important;
          background: rgba(0, 0, 0, 0.5) !important;
          transform: scale(1.02) !important;
        }
        .tauri-ctrl-btn {
          width: 12px !important;
          height: 12px !important;
          border-radius: 50% !important;
          border: none !important;
          cursor: pointer !important;
        }
        .tauri-ctrl-btn.close { background-color: #ff5f56 !important; border: 1px solid #e0443e !important; }
        .tauri-ctrl-btn.minimize { background-color: #ffbd2e !important; border: 1px solid #dea123 !important; }
        .tauri-ctrl-btn.maximize { background-color: #27c93f !important; border: 1px solid #1aab29 !important; }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    if (!document.querySelector('.tauri-drag-strip')) {
      const drag = document.createElement('div');
      drag.className = 'tauri-drag-strip';
      drag.setAttribute('data-tauri-drag-region', 'true');
      (document.body || document.documentElement).appendChild(drag);
    }

    if (!document.querySelector('.tauri-floating-controls')) {
      const nav = document.createElement('nav');
      nav.className = 'tauri-floating-controls';
      nav.innerHTML = `
        <button class="tauri-ctrl-btn close" title="Close & Stop Qui (Cmd+W)"></button>
        <button class="tauri-ctrl-btn minimize" title="Minimize (Cmd+M)"></button>
        <button class="tauri-ctrl-btn maximize" title="Maximize"></button>
      `;
      nav.querySelector('.close')?.addEventListener('click', () => {
        window.__TAURI__?.core?.invoke?.('close_app') || window.close();
      });
      nav.querySelector('.minimize')?.addEventListener('click', () => {
        window.__TAURI__?.core?.invoke?.('minimize_window');
      });
      nav.querySelector('.maximize')?.addEventListener('click', () => {
        window.__TAURI__?.core?.invoke?.('toggle_maximize');
      });
      (document.body || document.documentElement).appendChild(nav);
    }
  }

  document.addEventListener('DOMContentLoaded', applySquircleTheme);
  window.addEventListener('load', applySquircleTheme);
  setInterval(applySquircleTheme, 1000);

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'w' || e.key === 'q')) {
      e.preventDefault();
      window.__TAURI__?.core?.invoke?.('close_app') || window.close();
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'o' || (e.shiftKey && e.key === 'Z'))) {
      e.preventDefault();
      window.__TAURI__?.core?.invoke?.('open_in_zen_container');
    }
  });
})();
"#;

#[derive(Debug, Serialize, Deserialize)]
pub struct StartupStatus {
    pub success: bool,
    pub message: String,
    pub updated: bool,
    pub port: u16,
}

fn get_augmented_path() -> String {
    let current_path = env::var("PATH").unwrap_or_default();
    format!(
        "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:{}",
        current_path
    )
}

fn run_cmd(program: &str, args: &[&str]) -> Result<String, String> {
    let path = get_augmented_path();
    let output = Command::new(program)
        .args(args)
        .env("PATH", &path)
        .output()
        .map_err(|e| format!("Failed to execute {}: {}", program, e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout.trim().to_string())
    } else {
        Err(format!(
            "{} error: {} {}",
            program,
            stdout.trim(),
            stderr.trim()
        ))
    }
}

fn get_config_dir() -> PathBuf {
    if let Ok(dir) = env::var("QUI_CONFIG_DIR") {
        PathBuf::from(dir)
    } else if let Ok(home) = env::var("HOME") {
        PathBuf::from(home)
            .join("Developer")
            .join("programs")
            .join("qui")
            .join("config")
    } else {
        PathBuf::from("/tmp/qui-config")
    }
}

fn ensure_docker_daemon() -> Result<(), String> {
    if run_cmd("docker", &["info"]).is_ok() {
        return Ok(());
    }

    let _ = run_cmd("colima", &["start"]);
    for _ in 0..30 {
        if run_cmd("docker", &["info"]).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(1000));
    }

    let _ = run_cmd("open", &["-a", "Docker"]);
    for _ in 0..20 {
        if run_cmd("docker", &["info"]).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(1000));
    }

    Err(
        "Docker daemon is not running and could not be started automatically."
            .into(),
    )
}

fn pull_and_update_image() -> Result<bool, String> {
    println!("Checking for latest Qui image updates ({}) ...", IMAGE_NAME);
    let output = run_cmd("docker", &["pull", IMAGE_NAME])?;
    let was_updated = output.contains("Downloaded newer image")
        || output.contains("Pull complete");
    Ok(was_updated)
}

fn is_container_running() -> bool {
    run_cmd(
        "docker",
        &["inspect", "-f", "{{.State.Running}}", CONTAINER_NAME],
    )
    .map(|s| s.trim() == "true")
    .unwrap_or(false)
}

fn container_exists() -> bool {
    run_cmd("docker", &["inspect", CONTAINER_NAME]).is_ok()
}

pub fn stop_qui_container() -> Result<(), String> {
    if is_container_running() {
        println!("Stopping Qui docker container...");
        run_cmd("docker", &["stop", "-t", "5", CONTAINER_NAME])?;
        println!("Qui docker container stopped.");
    }
    Ok(())
}

fn start_qui_container(recreate: bool) -> Result<(), String> {
    let config_dir = get_config_dir();
    if let Err(e) = fs::create_dir_all(&config_dir) {
        return Err(format!(
            "Failed to create config dir {:?}: {}",
            config_dir, e
        ));
    }
    let config_path_str = config_dir.to_string_lossy().to_string();

    if recreate && container_exists() {
        println!("Recreating Qui container to use updated image...");
        let _ = run_cmd("docker", &["rm", "-f", CONTAINER_NAME]);
    }

    if is_container_running() {
        return Ok(());
    }

    if container_exists() {
        println!("Starting existing Qui container...");
        run_cmd("docker", &["start", CONTAINER_NAME])?;
    } else {
        println!("Creating and starting new Qui container...");
        run_cmd(
            "docker",
            &[
                "run",
                "-d",
                "--name",
                CONTAINER_NAME,
                "--restart",
                "unless-stopped",
                "-p",
                &format!("{}:{}", QUI_PORT, QUI_PORT),
                "-v",
                &format!("{}:/config", config_path_str),
                IMAGE_NAME,
            ],
        )?;
    }

    Ok(())
}

fn wait_for_qui_ready(timeout_secs: u64) -> Result<(), String> {
    let addr = format!("127.0.0.1:{}", QUI_PORT);
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    while start.elapsed() < timeout {
        if TcpStream::connect(&addr).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(300));
    }

    Err(format!(
        "Timed out waiting for Qui port {} after {}s",
        QUI_PORT, timeout_secs
    ))
}

static STARTUP_LOCK: Mutex<()> = Mutex::new(());

fn perform_qui_startup() -> Result<bool, String> {
    let _guard = STARTUP_LOCK.lock().map_err(|e| e.to_string())?;
    ensure_docker_daemon()?;
    let updated = pull_and_update_image().unwrap_or(false);
    start_qui_container(updated)?;
    wait_for_qui_ready(30)?;
    Ok(updated)
}

#[tauri::command]
fn start_and_update_qui() -> Result<StartupStatus, String> {
    let updated = perform_qui_startup()?;
    Ok(StartupStatus {
        success: true,
        message: "Qui is running and ready.".into(),
        updated,
        port: QUI_PORT,
    })
}

#[tauri::command]
fn stop_qui() -> Result<(), String> {
    stop_qui_container()
}

#[tauri::command]
fn open_in_zen_container() -> Result<(), String> {
    let url = format!("http://localhost:{}", QUI_PORT);
    let container_url = format!("ext+container:name=Annonimo&url={}", url);

    let res = run_cmd("open", &["-a", "Zen", &container_url]);
    if res.is_ok() {
        return Ok(());
    }

    run_cmd("open", &["-a", "Zen", &url]).map(|_| ())
}

#[tauri::command]
fn navigate_to_qui(window: tauri::WebviewWindow) -> Result<(), String> {
    let url = tauri::Url::parse(&format!("http://localhost:{}/", QUI_PORT))
        .map_err(|e| e.to_string())?;
    window.navigate(url).map_err(|e| e.to_string())
}

#[tauri::command]
fn minimize_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_maximize(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn close_app(
    app: tauri::AppHandle,
    _window: tauri::WebviewWindow,
) -> Result<(), String> {
    let _ = stop_qui_container();
    app.exit(0);
    Ok(())
}

#[cfg(target_os = "macos")]
fn setup_macos_vibrancy(window: &tauri::WebviewWindow) {
    let _ = window_vibrancy::apply_vibrancy(
        window,
        window_vibrancy::NSVisualEffectMaterial::FullScreenUI,
        Some(window_vibrancy::NSVisualEffectState::Active),
        Some(22.0),
    );
}

fn create_main_window(
    app: &tauri::App,
) -> Result<tauri::WebviewWindow, Box<dyn Error>> {
    let window = tauri::WebviewWindowBuilder::new(
        app,
        "main",
        tauri::WebviewUrl::default(),
    )
    .title("Qui")
    .inner_size(1360.0, 880.0)
    .min_inner_size(900.0, 620.0)
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .shadow(true)
    .initialization_script(SQUIRCLE_INJECTION_SCRIPT)
    .build()?;

    #[cfg(target_os = "macos")]
    setup_macos_vibrancy(&window);

    Ok(window)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> Result<(), Box<dyn Error>> {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let _main_window = create_main_window(app)?;

            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                println!("Window close requested; cleanly shutting down Qui container...");
                let _ = stop_qui_container();
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_and_update_qui,
            stop_qui,
            open_in_zen_container,
            navigate_to_qui,
            minimize_window,
            toggle_maximize,
            close_app
        ])
        .build(tauri::generate_context!())?
        .run(|_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                println!("Application exiting; cleanly stopping Qui container...");
                let _ = stop_qui_container();
            }
        });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{QUI_PORT, StartupStatus};

    #[test]
    fn startup_status_serializes_port() -> Result<(), String> {
        let status = StartupStatus {
            success: true,
            message: "ready".into(),
            updated: false,
            port: QUI_PORT,
        };
        let json = serde_json::to_string(&status)
            .map_err(|e| format!("serialize: {e}"))?;
        let decoded: StartupStatus = serde_json::from_str(&json)
            .map_err(|e| format!("deserialize: {e}"))?;
        if decoded.port != QUI_PORT {
            return Err(format!(
                "expected port {}, got {}",
                QUI_PORT, decoded.port
            ));
        }
        Ok(())
    }
}
