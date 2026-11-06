const invoke = window.__TAURI__?.core?.invoke || (async (cmd) => {
  console.log(`[Dev-Mock] Invoke: ${cmd}`);
  if (cmd === 'start_and_update_qui') {
    return { success: true, message: 'Dev Ready', updated: false, port: 7476 };
  }
  return null;
});

const statusPill = document.getElementById('status-pill');
const loaderStatus = document.getElementById('loader-status');
const progressBar = document.getElementById('progress-bar');
const loaderView = document.getElementById('loader-view');
const quiFrame = document.getElementById('qui-frame');

const btnClose = document.getElementById('btn-close');
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');
const btnZen = document.getElementById('btn-zen');
const btnReload = document.getElementById('btn-reload');

const stepDocker = document.getElementById('step-docker');
const stepUpdate = document.getElementById('step-update');
const stepContainer = document.getElementById('step-container');
const stepReady = document.getElementById('step-ready');

function setStep(stepEl, state) {
  stepEl.classList.remove('pending', 'active', 'done');
  stepEl.classList.add(state);
}

// Window control events
btnClose?.addEventListener('click', async () => {
  statusPill.textContent = 'Stopping...';
  statusPill.className = 'status-pill status-starting';
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

btnZen?.addEventListener('click', async () => {
  try {
    await invoke('open_in_zen_container');
  } catch (err) {
    console.error('Failed to open in Zen:', err);
  }
});

btnReload?.addEventListener('click', () => {
  if (quiFrame && quiFrame.src && quiFrame.src !== 'about:blank') {
    quiFrame.src = quiFrame.src;
  }
});

async function initializeQui() {
  try {
    setStep(stepDocker, 'active');
    loaderStatus.textContent = 'Verifying Docker and Colima...';
    progressBar.style.width = '25%';

    // Start background process via Rust Tauri command
    setStep(stepDocker, 'done');
    setStep(stepUpdate, 'active');
    loaderStatus.textContent = 'Checking for Qui updates from ghcr.io...';
    progressBar.style.width = '50%';

    const res = await invoke('start_and_update_qui');

    setStep(stepUpdate, 'done');
    setStep(stepContainer, 'done');
    setStep(stepReady, 'active');
    loaderStatus.textContent = 'Connecting to Qui Web Interface...';
    progressBar.style.width = '85%';

    if (res && res.success) {
      const port = res.port || 7476;
      const targetUrl = `http://localhost:${port}/`;

      setStep(stepReady, 'done');
      progressBar.style.width = '100%';
      loaderStatus.textContent = 'Ready!';
      statusPill.textContent = 'Connected • :7476';
      statusPill.className = 'status-pill status-running';

      setTimeout(async () => {
        try {
          await invoke('open_in_zen_container');
          statusPill.textContent = 'Zen • Annonimo • :7476';
        } catch (zenErr) {
          console.warn('Could not open Zen Annonimo container:', zenErr);
        }

        quiFrame.src = targetUrl;
        quiFrame.classList.remove('hidden');
        loaderView.style.display = 'none';
      }, 400);
    } else {
      throw new Error(res?.message || 'Failed to start Qui');
    }
  } catch (error) {
    console.error('Initialization error:', error);
    loaderStatus.textContent = `Error: ${error}`;
    statusPill.textContent = 'Error';
    statusPill.className = 'status-pill status-error';
    progressBar.style.backgroundColor = '#ef4444';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initializeQui();
});
