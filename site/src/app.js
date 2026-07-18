import { DEFAULT_PART_SIZE, MAX_PART_COUNT, SIZE_PRESETS } from './constants.js';
import { suggestedRestoredFilename } from './browser-operations.js';
import { discoverPackages } from './package-discovery.js';
import { OperationRunner } from './operation-runner.js';
import { calculatePartCount, formatBytes, formatPercent } from './utils.js';

const $ = (selector) => document.querySelector(selector);
const runner = new OperationRunner();

const state = {
  splitFile: null,
  splitOperation: null,
  restoreDiscovery: null,
  selectedPackageKey: null,
  restoreOperation: null,
};

function restorePageUrl() {
  const url = new URL(window.location.href);
  url.hash = 'restore';
  return url.toString();
}

function setTab(tab) {
  const isSplit = tab !== 'restore';
  $('#tab-split').setAttribute('aria-selected', String(isSplit));
  $('#tab-restore').setAttribute('aria-selected', String(!isSplit));
  $('#panel-split').hidden = !isSplit;
  $('#panel-restore').hidden = isSplit;
  history.replaceState(null, '', isSplit ? '#split' : '#restore');
}

function configurePresets() {
  const select = $('#split-preset');
  for (const preset of SIZE_PRESETS) {
    const option = document.createElement('option');
    option.value = String(preset.value);
    option.textContent = preset.label;
    select.append(option);
  }
  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = 'カスタム';
  select.append(custom);
  select.value = String(DEFAULT_PART_SIZE);
}

function currentPartSize() {
  const preset = $('#split-preset').value;
  if (preset !== 'custom') return Number(preset);
  const value = Number($('#custom-size').value);
  const multiplier = $('#custom-unit').value === 'MiB' ? 1024 * 1024 : 1_000_000;
  const bytes = Math.floor(value * multiplier);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : NaN;
}

function showMessage(element, type, message) {
  element.hidden = !message;
  element.className = `message ${type}`;
  element.textContent = message ?? '';
}

function updateSplitPlan() {
  const file = state.splitFile;
  const size = currentPartSize();
  const fileCard = $('#split-file-card');
  const startButton = $('#split-start');

  $('#custom-size-wrap').hidden = $('#split-preset').value !== 'custom';

  if (!file) {
    fileCard.hidden = true;
    $('#split-plan').hidden = true;
    startButton.disabled = true;
    return;
  }

  fileCard.hidden = false;
  $('#split-file-name').textContent = file.name;
  $('#split-file-size').textContent = formatBytes(file.size);
  $('#split-file-type').textContent = file.type || '不明な形式（問題なく分割できます）';

  if (!Number.isSafeInteger(size) || size <= 0) {
    $('#split-plan').hidden = true;
    startButton.disabled = true;
    showMessage($('#split-message'), 'error', '分割サイズを正しく入力してください。');
    return;
  }

  const count = calculatePartCount(file.size, size);
  const lastSize = file.size === 0 ? 0 : file.size - size * (count - 1);
  $('#split-plan').hidden = false;
  $('#plan-part-size').textContent = formatBytes(size);
  $('#plan-part-count').textContent = `${count} 個`;
  $('#plan-last-size').textContent = formatBytes(lastSize);
  startButton.disabled = count > MAX_PART_COUNT || !supportsRequiredApis();

  if (count > MAX_PART_COUNT) {
    showMessage($('#split-message'), 'error', `分割数が${count}個になります。分割サイズを大きくしてください。`);
  } else if (count > 100) {
    showMessage($('#split-message'), 'warning', `分割数が${count}個になります。送信や管理が大変になる可能性があります。`);
  } else {
    showMessage($('#split-message'), 'info', '出力先には専用サブフォルダーを自動作成します。');
  }
}

function setSplitFile(file) {
  state.splitFile = file ?? null;
  showMessage($('#split-result'), 'success', '');
  updateSplitPlan();
}

function supportsRequiredApis() {
  return window.isSecureContext
    && typeof window.showDirectoryPicker === 'function'
    && typeof window.showSaveFilePicker === 'function';
}

function updateSupportBanner() {
  const banner = $('#support-banner');
  if (supportsRequiredApis()) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = 'この環境では完全なファイル保存機能を利用できません。';
  const detail = document.createElement('span');
  detail.textContent = window.isSecureContext
    ? ' Windows版Google ChromeまたはMicrosoft Edgeで開いてください。'
    : ' HTTPSのGitHub Pagesまたはlocalhostから開いてください。';
  banner.append(strong, detail);
}

function setProgress(section, progress) {
  section.hidden = false;
  const percent = formatPercent(progress.processedBytes, progress.totalBytes);
  section.querySelector('[data-progress-bar]').style.width = `${percent.toFixed(1)}%`;
  section.querySelector('[data-progress-percent]').textContent = `${percent.toFixed(1)}%`;
  section.querySelector('[data-progress-bytes]').textContent = `${formatBytes(progress.processedBytes)} / ${formatBytes(progress.totalBytes)}`;
  section.querySelector('[data-progress-part]').textContent = progress.partCount
    ? `パーツ ${Math.max(1, progress.partIndex)} / ${progress.partCount}`
    : '';
  section.querySelector('[data-progress-name]').textContent = progress.currentName || '準備中';
}

function resetProgress(section) {
  section.hidden = true;
  section.querySelector('[data-progress-bar]').style.width = '0%';
}

async function startSplit() {
  if (!state.splitFile || state.splitOperation) return;
  const partSize = currentPartSize();
  if (!Number.isSafeInteger(partSize) || partSize <= 0) return;

  let parentDirectoryHandle;
  try {
    parentDirectoryHandle = await window.showDirectoryPicker({
      id: 'splitsend-output',
      mode: 'readwrite',
      startIn: 'downloads',
    });
  } catch (error) {
    if (error?.name !== 'AbortError') showMessage($('#split-message'), 'error', error.message);
    return;
  }

  const progressSection = $('#split-progress');
  resetProgress(progressSection);
  showMessage($('#split-result'), 'success', '');
  showMessage($('#split-message'), 'info', '分割処理を開始しました。ブラウザを閉じないでください。');
  $('#split-start').disabled = true;
  $('#split-cancel').hidden = false;

  const operation = runner.start('split', {
    file: state.splitFile,
    partSize,
    parentDirectoryHandle,
    restoreUrl: restorePageUrl(),
  }, {
    onProgress: (progress) => setProgress(progressSection, progress),
  });
  state.splitOperation = operation;

  try {
    const result = await operation.promise;
    showMessage(
      $('#split-result'),
      'success',
      `分割が完了しました。保存フォルダー: ${result.folderName}\nパーツ: ${result.manifest.parts.length}個\nSHA-256: ${result.manifest.original.sha256}`,
    );
    showMessage($('#split-message'), 'info', 'フォルダー内のpartファイルとsplitsend.jsonを送信してください。復元方法.txtは説明用です。');
  } catch (error) {
    const extra = error.cleanupWarning ? `\n${error.cleanupWarning}` : '';
    showMessage($('#split-result'), error.code === 'CANCELLED' ? 'warning' : 'error', `${error.message}${extra}`);
  } finally {
    state.splitOperation = null;
    $('#split-cancel').hidden = true;
    updateSplitPlan();
  }
}

function packageStatusText(pkg) {
  if (pkg.error) return `復元情報エラー: ${pkg.error}`;
  const lines = [];
  if (pkg.duplicates?.length) lines.push(`同名パーツ重複: ${pkg.duplicates.join(', ')}`);
  if (pkg.inspection.missing.length) lines.push(`不足: ${pkg.inspection.missing.join(', ')}`);
  if (pkg.inspection.sizeMismatches.length) {
    lines.push(`サイズ不一致: ${pkg.inspection.sizeMismatches.map((item) => item.name).join(', ')}`);
  }
  return lines.length ? lines.join('\n') : '必要なファイルがそろっています。復元時にSHA-256を検証します。';
}

function selectedPackage() {
  return state.restoreDiscovery?.packages.find((pkg) => pkg.key === state.selectedPackageKey) ?? null;
}

function renderPackages() {
  const container = $('#restore-packages');
  container.innerHTML = '';
  const discovery = state.restoreDiscovery;

  if (!discovery || discovery.packages.length === 0) {
    $('#restore-summary').hidden = true;
    $('#restore-start').disabled = true;
    showMessage(
      $('#restore-message'),
      'warning',
      discovery ? '.splitsend.json が見つかりません。復元情報とすべてのpartファイルを選択してください。' : '',
    );
    return;
  }

  $('#restore-summary').hidden = false;
  showMessage($('#restore-message'), 'info', `${discovery.files.length}個のファイルから${discovery.packages.length}件のパッケージを検出しました。`);

  for (const pkg of discovery.packages) {
    const label = document.createElement('label');
    label.className = `package-card ${pkg.error || !pkg.inspection?.ready ? 'invalid' : 'ready'}`;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'restore-package';
    radio.value = pkg.key;
    radio.checked = pkg.key === state.selectedPackageKey;
    radio.disabled = Boolean(pkg.error);
    radio.addEventListener('change', () => {
      state.selectedPackageKey = pkg.key;
      renderPackages();
    });

    const body = document.createElement('span');
    body.className = 'package-card-body';
    const title = document.createElement('strong');
    title.textContent = pkg.manifest?.original?.name ?? pkg.manifestFile.name;
    const meta = document.createElement('span');
    meta.className = 'muted';
    meta.textContent = pkg.manifest
      ? `${formatBytes(pkg.manifest.original.size)}・${pkg.manifest.parts.length}パーツ・ID ${pkg.manifest.packageId}`
      : '復元情報を読み取れません';
    const status = document.createElement('span');
    status.className = 'package-status';
    status.textContent = packageStatusText(pkg);
    body.append(title, meta, status);
    label.append(radio, body);
    container.append(label);
  }

  const pkg = selectedPackage();
  $('#restore-start').disabled = !pkg?.inspection?.ready || pkg.duplicates?.length > 0 || !supportsRequiredApis();
}

async function setRestoreFiles(files) {
  showMessage($('#restore-result'), 'success', '');
  state.restoreDiscovery = await discoverPackages(files);
  const firstReady = state.restoreDiscovery.packages.find((pkg) => pkg.inspection?.ready && !pkg.duplicates?.length);
  state.selectedPackageKey = firstReady?.key ?? state.restoreDiscovery.packages[0]?.key ?? null;
  renderPackages();
}

async function startRestore() {
  const pkg = selectedPackage();
  if (!pkg?.inspection?.ready || state.restoreOperation) return;

  let outputFileHandle;
  try {
    outputFileHandle = await window.showSaveFilePicker({
      id: 'splitsend-restore',
      startIn: 'downloads',
      suggestedName: suggestedRestoredFilename(pkg.manifest.original.name),
    });
  } catch (error) {
    if (error?.name !== 'AbortError') showMessage($('#restore-message'), 'error', error.message);
    return;
  }

  const progressSection = $('#restore-progress');
  resetProgress(progressSection);
  showMessage($('#restore-result'), 'success', '');
  showMessage($('#restore-message'), 'info', 'パーツを検証しながら復元しています。完了までブラウザを閉じないでください。');
  $('#restore-start').disabled = true;
  $('#restore-cancel').hidden = false;

  const operation = runner.start('restore', {
    manifest: pkg.manifest,
    partFiles: pkg.partFiles,
    outputFileHandle,
  }, {
    onProgress: (progress) => setProgress(progressSection, progress),
  });
  state.restoreOperation = operation;

  try {
    const result = await operation.promise;
    showMessage(
      $('#restore-result'),
      'success',
      `復元が完了しました。\nファイル: ${result.originalName}\nサイズ: ${formatBytes(result.size)}\nSHA-256: ${result.sha256}\n元ファイルと完全に一致しています。`,
    );
    showMessage($('#restore-message'), 'info', '保存したファイルを通常どおり開けます。');
  } catch (error) {
    showMessage($('#restore-result'), error.code === 'CANCELLED' ? 'warning' : 'error', error.message);
  } finally {
    state.restoreOperation = null;
    $('#restore-cancel').hidden = true;
    renderPackages();
  }
}

function wireDropZone(zone, input, callback) {
  const activate = () => input.click();
  zone.addEventListener('click', activate);
  zone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  });
  for (const type of ['dragenter', 'dragover']) {
    zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.add('dragging');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.remove('dragging');
    });
  }
  zone.addEventListener('drop', (event) => callback(event.dataTransfer.files));
  input.addEventListener('change', () => callback(input.files));
}

function initialize() {
  configurePresets();
  updateSupportBanner();

  $('#tab-split').addEventListener('click', () => setTab('split'));
  $('#tab-restore').addEventListener('click', () => setTab('restore'));
  window.addEventListener('hashchange', () => setTab(location.hash === '#restore' ? 'restore' : 'split'));

  wireDropZone($('#split-drop'), $('#split-input'), (files) => setSplitFile(files?.[0]));
  wireDropZone($('#restore-drop'), $('#restore-input'), (files) => setRestoreFiles(files));

  $('#split-preset').addEventListener('change', updateSplitPlan);
  $('#custom-size').addEventListener('input', updateSplitPlan);
  $('#custom-unit').addEventListener('change', updateSplitPlan);
  $('#split-start').addEventListener('click', startSplit);
  $('#split-cancel').addEventListener('click', () => state.splitOperation?.cancel());
  $('#restore-start').addEventListener('click', startRestore);
  $('#restore-cancel').addEventListener('click', () => state.restoreOperation?.cancel());
  $('#restore-clear').addEventListener('click', () => {
    state.restoreDiscovery = null;
    state.selectedPackageKey = null;
    $('#restore-input').value = '';
    renderPackages();
    showMessage($('#restore-result'), 'success', '');
  });

  setTab(location.hash === '#restore' ? 'restore' : 'split');
  updateSplitPlan();
  renderPackages();
}

initialize();
