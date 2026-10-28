import { LIBRARY_FILTERS, PRESET_CATEGORIES, nextLibraryFilter } from './library.js';
import { listPresets, savePreset } from './storage.js';

const savedDialog = document.querySelector('#saved-dialog');
const savedFilterSelect = document.querySelector('#saved-filter');
const savedTabs = document.querySelector('#saved-tabs');
const savedList = document.querySelector('#saved-list');
const presetEditDialog = document.querySelector('#preset-edit-dialog');
const presetEditForm = document.querySelector('#preset-edit-form');
const presetEditTitle = document.querySelector('#preset-edit-title');
const presetEditCategory = document.querySelector('#preset-edit-category');
const presetEditError = document.querySelector('#preset-edit-error');

let editingPreset = null;
let augmentationSequence = 0;

const tabId = (filter) => `saved-tab-${filter.toLowerCase().replaceAll(' ', '-')}`;

function updateTabs(filter, focusActive = false) {
  const tabs = savedTabs?.querySelectorAll('[role="tab"]') ?? [];
  tabs.forEach((tab) => {
    const selected = tab.dataset.libraryFilter === filter;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focusActive) tab.focus();
  });
  if (savedList) savedList.setAttribute('aria-labelledby', tabId(filter));
}

function activateFilter(filter, { focusTab = false } = {}) {
  if (!LIBRARY_FILTERS.includes(filter) || !savedFilterSelect) return;
  savedFilterSelect.value = filter;
  updateTabs(filter, focusTab);
  savedFilterSelect.dispatchEvent(new Event('change', { bubbles: true }));
}

function openPresetEditor(preset) {
  if (!presetEditDialog || !presetEditTitle || !presetEditCategory) return;
  editingPreset = preset;
  presetEditTitle.value = preset.title;
  presetEditCategory.value = PRESET_CATEGORIES.includes(preset.category) ? preset.category : 'Positions';
  presetEditDialog.showModal();
  presetEditTitle.focus();
}

// Saved rows carry data-preset-id (set by refreshSavedList in app.js); the Edit button goes before the row's Delete button.
async function augmentCustomRows() {
  if (!savedList) return;
  const sequence = ++augmentationSequence;
  const presets = new Map((await listPresets()).map((preset) => [preset.id, preset]));
  if (sequence !== augmentationSequence) return;

  savedList.querySelectorAll('.saved-item[data-preset-id]').forEach((item) => {
    const preset = presets.get(item.dataset.presetId);
    if (!preset || item.querySelector('[data-library-edit]')) return;
    item.classList.add('is-user-preset');
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit';
    edit.dataset.libraryEdit = 'true';
    edit.addEventListener('click', () => openPresetEditor(preset));
    item.insertBefore(edit, item.lastElementChild);
  });
}

savedTabs?.addEventListener('click', (event) => {
  const tab = event.target.closest('[role="tab"][data-library-filter]');
  if (!tab) return;
  activateFilter(tab.dataset.libraryFilter);
});

savedTabs?.addEventListener('keydown', (event) => {
  const tab = event.target.closest('[role="tab"][data-library-filter]');
  if (!tab) return;
  const next = nextLibraryFilter(tab.dataset.libraryFilter, event.key);
  if (next === tab.dataset.libraryFilter) return;
  event.preventDefault();
  activateFilter(next, { focusTab: true });
});

savedFilterSelect?.addEventListener('change', () => updateTabs(savedFilterSelect.value));

if (savedList) {
  new MutationObserver(() => { void augmentCustomRows(); }).observe(savedList, { childList: true });
}

presetEditForm?.addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel' || !editingPreset) return;
  event.preventDefault();
  try {
    const updated = await savePreset({
      id: editingPreset.id,
      title: presetEditTitle.value,
      category: presetEditCategory.value,
      state: editingPreset.state,
    });
    editingPreset = updated;
    presetEditDialog.close();
    savedFilterSelect?.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (error) {
    presetEditError.textContent = error instanceof Error ? error.message : 'Unable to save changes.';
    presetEditError.hidden = false;
  }
});

presetEditDialog?.addEventListener('close', () => {
  editingPreset = null;
  if (presetEditError) presetEditError.hidden = true;
  presetEditForm?.reset();
});

savedDialog?.addEventListener('close', () => {
  if (presetEditDialog?.open) presetEditDialog.close();
});

updateTabs(savedFilterSelect?.value ?? 'All');
void augmentCustomRows();
