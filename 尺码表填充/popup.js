const $ = (id) => document.getElementById(id);

let parsedData = null;

document.addEventListener('DOMContentLoaded', async () => {
  $('csvFile').addEventListener('change', onFileChange);
  $('saveBtn').addEventListener('click', onSave);
  $('fillBtn').addEventListener('click', onFillNow);
  $('clearBtn').addEventListener('click', onClear);
  $('openShortcutBtn').addEventListener('click', onOpenShortcut);
  await showCurrentHotkey();
  await loadExistingDataPreview();
});

async function showCurrentHotkey() {
  try {
    const commands = await chrome.commands.getAll();
    const cmd = commands.find(c => c.name === 'fill-size-chart');
    $('hotkey').textContent = (cmd && cmd.shortcut) ? cmd.shortcut : '未设置（点击“自定义快捷键”设置）';
  } catch (e) {
    $('hotkey').textContent = '无法读取快捷键';
  }
}

async function onOpenShortcut() {
  try {
    await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  } catch (e) {
    setStatus('无法打开快捷键设置，请在地址栏输入 chrome://extensions/shortcuts', true);
  }
}

function onFileChange(evt) {
  const file = evt.target.files && evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      parsedData = parseCsv(String(reader.result || ''));
      if (!parsedData || !parsedData.length) throw new Error('CSV 内容为空');
      renderPreview(parsedData);
      $('saveBtn').disabled = false;
      setStatus('解析成功，请点击保存数据');
    } catch (e) {
      parsedData = null;
      $('saveBtn').disabled = true;
      setStatus('解析失败：' + (e.message || e), true);
    }
  };
  reader.onerror = () => setStatus('读取文件失败', true);
  reader.readAsText(file, 'utf-8');
}

function parseCsv(text) {
  // Simple CSV parser: supports comma or tab, trims whitespace, ignores empty lines
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const detectedDelimiter = detectDelimiter(lines);
  const rows = lines.map(line => splitCsvLine(line, detectedDelimiter).map(cell => cell.trim())).filter(r => r.length);
  // keep only first 5 columns per row
  return rows.map(r => r.slice(0, 5));
}

function detectDelimiter(lines) {
  let comma = 0, tab = 0, semicolon = 0;
  const probe = lines.slice(0, Math.min(5, lines.length));
  probe.forEach(l => { comma += (l.match(/,/g) || []).length; tab += (l.match(/\t/g) || []).length; semicolon += (l.match(/;/g) || []).length; });
  if (tab >= comma && tab >= semicolon) return '\t';
  if (semicolon >= comma) return ';';
  return ',';
}

function splitCsvLine(line, delimiter) {
  // Minimal CSV splitting: handles quoted fields for common cases
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { // escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function renderPreview(data) {
  const table = $('previewTable');
  table.innerHTML = '';
  const head = document.createElement('tr');
  ['列1','列2','列3','列4','列5'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    head.appendChild(th);
  });
  table.appendChild(head);
  data.slice(0, 6).forEach(row => {
    const tr = document.createElement('tr');
    for (let i = 0; i < 5; i++) {
      const td = document.createElement('td');
      td.textContent = row[i] != null ? row[i] : '';
      tr.appendChild(td);
    }
    table.appendChild(tr);
  });
  $('previewWrap').style.display = 'block';
}

async function onSave() {
  if (!parsedData || !parsedData.length) return setStatus('没有可保存的数据', true);
  try {
    await chrome.storage.sync.set({ sizeData: parsedData });
    setStatus('已保存到云端存储');
  } catch (e) {
    setStatus('保存失败：' + (e.message || e), true);
  }
}

async function onClear() {
  await chrome.storage.sync.remove('sizeData');
  $('previewWrap').style.display = 'none';
  $('previewTable').innerHTML = '';
  setStatus('已清空数据');
}

async function onFillNow() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return setStatus('未找到活动标签页', true);
    const stored = await chrome.storage.sync.get('sizeData');
    const sizeData = stored && Array.isArray(stored.sizeData) ? stored.sizeData : undefined;
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'FILL_SIZE_CHART', sizeData });
    if (res && res.ok) setStatus('填充完成'); else setStatus('填充失败：' + (res && res.error ? res.error : '未知错误'), true);
  } catch (e) {
    setStatus('无法与页面通信（请确认已打开 AliExpress CSP 页面）', true);
  }
}

async function loadExistingDataPreview() {
  const stored = await chrome.storage.sync.get('sizeData');
  const sizeData = stored && Array.isArray(stored.sizeData) ? stored.sizeData : null;
  if (sizeData && sizeData.length) {
    renderPreview(sizeData);
  }
}

function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.className = isError ? 'muted' : 'muted';
}


