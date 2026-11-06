const invoke = window.__TAURI__?.core?.invoke || (async (cmd) => {
  console.log(`[Dev-Mock] Invoke: ${cmd}`);
  if (cmd === 'start_and_update_qui') {
    return { success: true, message: 'Dev Ready', updated: false, port: 7476 };
  }
  return null;
});

const loaderStatus = document.getElementById('loader-status');
const progressBar = document.getElementById('progress-bar');
const loaderView = document.getElementById('loader-view');

const btnClose = document.getElementById('btn-close');
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');
const dragStrip = document.getElementById('drag-strip');

const stepDocker = document.getElementById('step-docker');
const stepUpdate = document.getElementById('step-update');
const stepContainer = document.getElementById('step-container');
const stepReady = document.getElementById('step-ready');

function setStep(stepEl, state) {
  if (!stepEl) return;
  stepEl.classList.remove('pending', 'active', 'done');
  stepEl.classList.add(state);
}

// Window control events
btnClose?.addEventListener('click', async () => {
  try {
    await invoke('close_app');
  } catch (err) {
    console.error('Failed to close app:', err);
  }
});

btnMinimize?.addEventListener('click', async () => {
  try {
    await invoke('minimize_window');
  } catch (err) {
    console.error('Failed to minimize window:', err);
  }
});

btnMaximize?.addEventListener('click', async () => {
  try {
    await invoke('toggle_maximize');
  } catch (err) {
    console.error('Failed to toggle maximize:', err);
  }
});

// Window dragging on top strip or with Cmd key held
dragStrip?.addEventListener('mousedown', async () => {
  try {
    await invoke('start_drag');
  } catch (err) {
    console.error('Failed to start drag:', err);
  }
});

window.addEventListener('keydown', async (e) => {
  // Cmd+W or Cmd+Q: cleanly quit and stop Qui
  if ((e.metaKey || e.ctrlKey) && (e.key === 'w' || e.key === 'q')) {
    e.preventDefault();
    try {
      await invoke('close_app');
    } catch (err) {
      console.error('Close app error:', err);
    }
  }

  // Cmd+O or Cmd+Shift+Z: Open directly in Zen Annonimo container
  if ((e.metaKey || e.ctrlKey) && (e.key === 'o' || (e.shiftKey && e.key === 'Z'))) {
    e.preventDefault();
    try {
      await invoke('open_in_zen_container');
    } catch (err) {
      console.error('Open in Zen error:', err);
    }
  }
});

async function initializeQui() {
  try {
    setStep(stepDocker, 'active');
    if (loaderStatus) loaderStatus.textContent = 'Verifying Docker and Colima...';
    if (progressBar) progressBar.style.width = '25%';

    // Step 1: Docker daemon check
    setStep(stepDocker, 'done');
    setStep(stepUpdate, 'active');
    if (loaderStatus) loaderStatus.textContent = 'Checking for Qui updates from ghcr.io...';
    if (progressBar) progressBar.style.width = '50%';

    // Step 2-4: Pull latest image, start container, wait for port
    const res = await invoke('start_and_update_qui');

    setStep(stepUpdate, 'done');
    setStep(stepContainer, 'done');
    setStep(stepReady, 'active');
    if (loaderStatus) loaderStatus.textContent = 'Connecting to WebKit Web UI...';
    if (progressBar) progressBar.style.width = '85%';

    if (res && res.success) {
      const port = res.port || 7476;
      const targetUrl = `http://localhost:${port}/`;

      setStep(stepReady, 'done');
      if (progressBar) progressBar.style.width = '100%';
      if (loaderStatus) loaderStatus.textContent = 'Ready!';

      // Launch Zen in Annonimo container alongside the WebKit app
      setTimeout(async () => {
        try {
          await invoke('open_in_zen_container');
        } catch (zenErr) {
          console.warn('Could not open Zen Annonimo container:', zenErr);
        }

        // Navigate top-level window directly to Qui WebKit UI
        try {
          await invoke('navigate_to_qui');
        } catch (navErr) {
          console.warn('Rust navigate error, using location.replace:', navErr);
          window.location.replace(targetUrl);
        }
      }, 350);
    } else {
      throw new Error(res?.message || 'Failed to start Qui');
    }
  } catch (error) {
    console.error('Initialization error:', error);
    if (loaderStatus) loaderStatus.textContent = `Error: ${error}`;
    if (progressBar) progressBar.style.backgroundColor = '#ef4444';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initializeQui();
});
