// A waiting worker owns its version; asking it avoids mixing the active and
// newly downloaded app shells when two deployments use the same URL.
function workerVersion(worker) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); resolve(null); }, 3000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(typeof event.data?.version === 'string' ? event.data.version : null);
    };
    try { worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]); }
    catch { clearTimeout(timeout); channel.port1.close(); resolve(null); }
  });
}

export async function setupUpdates(saveCurrentBoard, onRegistrationError) {
  const serviceWorker = navigator.serviceWorker;
  const dialog = document.querySelector('#update-dialog');
  const versionLabel = document.querySelector('#update-version');
  const error = document.querySelector('#update-error');
  const accept = document.querySelector('#update-accept');
  const cancel = document.querySelector('#update-cancel');
  let registration;
  let candidate = null;
  let dismissed = null;
  let accepting = false;
  let previousController = serviceWorker.controller;
  let pending = null;
  let storageWarning = false;

  async function offer(worker, active = false) {
    if (!worker || worker === dismissed) return;
    if (document.querySelector('dialog[open]:not(#update-dialog)')) {
      pending = { worker, active };
      return;
    }
    const version = await workerVersion(worker);
    if (!version || worker === dismissed || (!active && worker !== registration.waiting)) return;
    if (document.querySelector('dialog[open]:not(#update-dialog)')) {
      pending = { worker, active };
      return;
    }
    candidate = worker;
    pending = null;
    storageWarning = false;
    accept.textContent = 'Update';
    versionLabel.textContent = version;
    error.hidden = true;
    accept.disabled = false;
    if (!dialog.open) dialog.showModal();
  }

  function dismiss() {
    dismissed = candidate;
    candidate = null;
    accepting = false;
    if (dialog.open) dialog.close();
  }
  document.querySelectorAll('dialog:not(#update-dialog)').forEach((other) => {
    other.addEventListener('close', () => {
      if (pending) { const next = pending; offer(next.worker, next.active); }
    });
  });
  cancel.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); dismiss(); });
  accept.addEventListener('click', () => {
    if (!candidate || accepting) return;
    if (candidate.state === 'redundant') {
      candidate = null;
      if (registration.waiting) offer(registration.waiting);
      else dialog.close();
      return;
    }
    // Avoid losing a last drag that is still waiting for the autosave debounce.
    if (!storageWarning && !saveCurrentBoard()) {
      error.textContent = 'Unable to save this board. Export it first, or update without saving.';
      error.hidden = false;
      accept.textContent = 'Update without saving';
      storageWarning = true;
      return;
    }
    accepting = true;
    accept.disabled = true;
    if (candidate === serviceWorker.controller || candidate.state === 'activated') {
      location.reload();
    } else {
      candidate.postMessage({ type: 'SKIP_WAITING' });
    }
  });

  serviceWorker.addEventListener('controllerchange', () => {
    const controller = serviceWorker.controller;
    if (accepting) {
      location.reload();
    } else if (previousController && controller && controller !== previousController) {
      // Another tab accepted the update: this tab keeps its board until the coach
      // chooses to reload, rather than being refreshed behind their back.
      offer(controller, true);
    }
    previousController = controller;
  });

  try {
    registration = await serviceWorker.register('./sw.js', { updateViaCache: 'none' });
  } catch {
    onRegistrationError();
    return;
  }
  const checkWaiting = () => {
    if (serviceWorker.controller && registration.waiting) offer(registration.waiting);
  };
  const watchInstalling = () => {
    const worker = registration.installing;
    if (worker) worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') checkWaiting();
    });
  };
  registration.addEventListener('updatefound', watchInstalling);
  watchInstalling();
  checkWaiting();
  const checkForUpdate = () => {
    checkWaiting();
    registration.update().catch(() => {}); // Normal when offline.
  };
  window.addEventListener('online', checkForUpdate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  setInterval(checkForUpdate, 60 * 60 * 1000);
  checkForUpdate();
}
