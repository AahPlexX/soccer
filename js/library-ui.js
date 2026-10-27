import { LIBRARY_FILTERS, PRESET_CATEGORIES, filterPresetsByCategory, nextLibraryFilter } from './library.js';
import { listPresets, savePreset } from './storage.js';

const savedDialog = document.querySelector('#saved-dialog');
const savedFilterSelect = document.querySelector('#saved-filter');
const savedTabs = document.querySelector('#saved-tabs');
const savedList = document.querySelector('#saved-list');
const presetEditDialog = document.querySelector('#preset-edit-dialog');
const presetEditForm = document.querySelector('#preset-edit-form');
const presetEditTitle = document.querySelector('#preset-edit-title');
const presetEditCategory = document.querySelector('#preset-edit-category');

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

function customPresetRows() {
  if (!savedList) return [];
  return [...savedList.querySelectorAll('.saved-item')].filter((item) =>
    [...item.querySelectorAll('button')].some((button) => button.textContent === 'Delete' || button.textContent === 'Tap again to delete'),
  );
}

async function augmentCustomRows() {
  if (!savedFilterSelect || !savedList) return;
  const sequence = ++augmentationSequence;
  const presets = filterPresetsByCategory(await listPresets(), savedFilterSelect.value);
  if (sequence !== augmentationSequence) return;

  customPresetRows().forEach((item, index) => {
    const preset = presets[index];
    if (!preset || item.querySelector('[data-library-edit]')) return;
    item.dataset.presetId = preset.id;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit';
    edit.dataset.libraryEdit = 'true';
    edit.addEventListener('click', () => openPresetEditor(preset));
    const deleteButton = [...item.querySelectorAll('button')].find((button) =>
      button.textContent === 'Delete' || button.textContent === 'Tap again to delete',
    );
    item.insertBefore(edit, deleteButton ?? null);
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
  const updated = await savePreset({
    id: editingPreset.id,
    title: presetEditTitle.value,
    category: presetEditCategory.value,
    state: editingPreset.state,
  });
  editingPreset = updated;
  presetEditDialog.close();
  savedFilterSelect?.dispatchEvent(new Event('change', { bubbles: true }));
});

presetEditDialog?.addEventListener('close', () => {
  editingPreset = null;
  presetEditForm?.reset();
});

savedDialog?.addEventListener('close', () => {
  if (presetEditDialog?.open) presetEditDialog.close();
});

updateTabs(savedFilterSelect?.value ?? 'All');
void augmentCustomRows();
