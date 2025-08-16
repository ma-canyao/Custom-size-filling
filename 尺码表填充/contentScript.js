// Content Script for AliExpress CSP size chart filling

(() => {
  const TARGET_TABLE_SELECTOR = '.size-chart-table-comp';
  const PLACEHOLDER_SELECTOR = 'input[placeholder="请输入"]';

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'FILL_SIZE_CHART') return;
    (async () => {
      try {
        const providedData = Array.isArray(message.sizeData) ? message.sizeData : null;
        const sizeData = providedData || (await getStoredSizeData());
        validateSizeData(sizeData);
        const root = await waitForTableRoot(8000);
        if (!root) throw new Error('未找到尺码表容器');
        await ensureRows(root, sizeData.length);
        await fillTable(root, sizeData);
        sendResponse({ ok: true });
      } catch (err) {
        console.error('[size-chart] fill failed:', err);
        sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
      }
    })();
    return true; // keep channel open for async response
  });

  async function getStoredSizeData() {
    const result = await chrome.storage.sync.get({ sizeData: getDefaultSizeData() });
    return result.sizeData;
  }

  function getDefaultSizeData() {
    return [
      ['S','43','92','71','22'],
      ['M','45','102','74','22'],
      ['L','48','112','76','23'],
      ['XL','51','122','79','23'],
      ['XXL','53','132','82','25'],
      ['XXXL','56','142','84','25']
    ];
  }

  function validateSizeData(data) {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('CSV 数据为空');
    }
    data.forEach((row, idx) => {
      if (!Array.isArray(row) || row.length < 5) {
        throw new Error(`第 ${idx + 1} 行列数不足（需要至少 5 列）`);
      }
    });
  }

  function findSizeTableRoot() {
    return document.querySelector(TARGET_TABLE_SELECTOR) || null;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForTableRoot(timeoutMs) {
    const start = Date.now();
    let found = findSizeTableRoot();
    if (found) return found;
    return new Promise((resolve) => {
      const mo = new MutationObserver(() => {
        found = findSizeTableRoot();
        if (found) {
          mo.disconnect();
          resolve(found);
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      const t = setInterval(() => {
        if (Date.now() - start > timeoutMs) {
          clearInterval(t);
          mo.disconnect();
          resolve(null);
        }
      }, 200);
    });
  }

  function findAddButton(root) {
    if (!root) return null;
    const buttons = Array.from(root.querySelectorAll('button'));
    return buttons.find((b) => /添加(项目|行)?/.test((b.textContent || '').trim())) || null;
  }

  async function ensureRows(root, need) {
    const tbody = root && root.querySelector('tbody');
    if (!tbody) throw new Error('未找到表格主体');
    const addBtn = findAddButton(root);
    if (!addBtn) {
      if (tbody.querySelectorAll('tr').length < need) {
        throw new Error('未找到“添加”按钮，且当前行数不足');
      }
      return;
    }
    const safetyLimit = need + 10;
    while (tbody.querySelectorAll('tr').length < need && tbody.querySelectorAll('tr').length < safetyLimit) {
      addBtn.click();
      await wait(80);
    }
  }

  function collectRowInputs(rowEl) {
    const cells = Array.from(rowEl.querySelectorAll('td')).slice(0, 5);
    const inputs = cells.map((td) => td.querySelector(PLACEHOLDER_SELECTOR)).filter(Boolean);
    return inputs.length === 5 ? inputs : null;
  }

  function setInputValue(input, value) {
    try {
      const proto = window.HTMLInputElement && Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      const setter = proto && proto.set;
      if (setter) {
        setter.call(input, String(value));
      } else {
        input.value = String(value);
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
      input.value = String(value);
    }
  }

  async function fillTable(root, sizeData) {
    const tbody = root.querySelector('tbody');
    if (!tbody) throw new Error('未找到表格主体');
    const rows = Array.from(tbody.querySelectorAll('tr')).slice(0, sizeData.length);
    for (let i = 0; i < sizeData.length; i++) {
      const targetRow = rows[i];
      if (!targetRow) break;
      const inputs = collectRowInputs(targetRow);
      if (!inputs) throw new Error(`第 ${i + 1} 行未找到 5 个输入框`);
      const values = sizeData[i];
      for (let j = 0; j < 5; j++) {
        const input = inputs[j];
        input.focus();
        setInputValue(input, values[j]);
        input.blur();
        await wait(20);
      }
    }
  }
})();


