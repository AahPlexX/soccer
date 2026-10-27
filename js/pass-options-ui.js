const simulationGroup = document.querySelector('.simulation-group');
const resetButton = document.querySelector('#reset-board');

if (simulationGroup && !document.querySelector('#pass-options-toggle')) {
  document.documentElement.dataset.passOptions = 'false';
  const button = document.createElement('button');
  button.id = 'pass-options-toggle';
  button.type = 'button';
  button.textContent = 'Pass options';
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-controls', 'pitch');
  button.addEventListener('click', () => {
    const active = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(active));
    document.documentElement.dataset.passOptions = String(active);
  });
  simulationGroup.insertBefore(button, resetButton ?? null);
}
