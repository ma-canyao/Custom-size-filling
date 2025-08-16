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
        // 逐列添加/重命名/填充，满足“当前列填完才能添加下一列”的限制
        const desiredTitles = ['通用', '肩宽(cm)', '胸围(cm)', '衣长(cm)', '袖长(cm)'];
        await ensureRows(root, sizeData.length);
        await fillByColumnsSequentially(root, desiredTitles, sizeData);
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

  function getHeaderRow(root) {
    return root.querySelector('thead tr');
  }

  function getHeaderCells(root) {
    const tr = getHeaderRow(root);
    if (!tr) return [];
    const ths = Array.from(tr.querySelectorAll('th'));
    // 过滤掉动作列（包含 .col-action）
    return ths.filter((th) => !th.querySelector('.col-action'));
  }

  function findAddColumnButton(root) {
    const tr = getHeaderRow(root);
    if (!tr) return null;
    const btn = tr.querySelector('.col-action button');
    return btn || null;
  }

  function queryInlineHeaderInputInRow(root) {
    const tr = getHeaderRow(root);
    if (!tr) return null;
    return tr.querySelector(
      'th .col-title input[role="combobox"], th .col-title input[placeholder="请输入"], th .col-title input, th .col-action input[role="combobox"], th .col-action input[placeholder="请输入"], th .col-action input'
    );
  }

  async function ensureColumnWithTitle(root, index, title) {
    let attempts = 0;
    while (getHeaderCells(root).length <= index && attempts < 8) {
      // 如果已经存在待编辑的 inline 输入（可能在 col-title 或 col-action 中），直接使用它
      let input = queryInlineHeaderInputInRow(root);
      if (!input) {
        const addBtn = findAddColumnButton(root) || findAddButton(root);
        if (!addBtn) throw new Error('未找到“添加项目”按钮');
        addBtn.click();
        await wait(80);
        input = queryInlineHeaderInputInRow(root);
      }
      if (!input) {
        // 等待一会儿渲染输入
        await waitUntil(() => !!queryInlineHeaderInputInRow(root), 2000, 80);
        input = queryInlineHeaderInputInRow(root);
      }
      if (input) {
        input.focus();
        setInputValue(input, title);
        // 提交（Enter）并失焦，触发列创建
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        // 点击其他区域强制 blur 与提交
        forceBlur(root);
        input.blur();
      }
      // 等待列表头真正增加，或目标位置出现期望标题
      const ok = await waitUntil(() => {
        const ths = getHeaderCells(root);
        if (ths.length > index) {
          const span = ths[index].querySelector('.title-text');
          return span && (span.textContent || '').trim() === title;
        }
        return false;
      }, 3000, 100);
      if (!ok) {
        attempts++;
      } else {
        // 等待表体对应列单元格与输入框就绪
        const tbody = root.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        await ensureBodyColumnReady(root, index, rows.length);
        break;
      }
    }
    // 如果列已经存在但标题不对，尝试重命名一次
    const ths = getHeaderCells(root);
    if (ths[index]) {
      const span = ths[index].querySelector('.title-text');
      if (!span || (span.textContent || '').trim() !== title) {
        await renameHeaderAtIndex(root, index, title);
      }
    } else {
      throw new Error('添加列失败：未生成目标列');
    }
  }

  async function waitUntil(testFn, timeoutMs = 2000, intervalMs = 80) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await testFn()) return true;
      } catch { /* ignore */ }
      await wait(intervalMs);
    }
    return false;
  }

  async function renameHeaderAtIndex(root, index, title) {
    const ths = getHeaderCells(root);
    const th = ths[index];
    if (!th) throw new Error(`未找到第 ${index + 1} 列表头`);
    const span = th.querySelector('.title-text');
    if (span && (span.textContent || '').trim() === title) return; // 已匹配

    // 若新增列：通常会直接出现 inline 输入框（auto-complete）
    // 否则：尝试点击“编辑”按钮
    let input = th.querySelector('input[role="combobox"], input[placeholder="请输入"], input');
    if (!input) {
      const editBtn = th.querySelector('.title-addon button');
      if (editBtn) {
        editBtn.click();
        await wait(120);
        input = th.querySelector('input[role="combobox"], input[placeholder="请输入"], input');
      }
    }
    if (!input) {
      // 兜底：全局弹层中的输入
      input = document.querySelector('.next-overlay-wrapper input[role="combobox"], .next-dialog input[role="combobox"], .next-overlay-wrapper input[placeholder="请输入"], .next-dialog input[placeholder="请输入"], .next-overlay-wrapper input, .next-dialog input');
    }
    if (input) {
      input.focus();
      setInputValue(input, title);
      input.blur();
      // 模拟回车提交（auto-complete 常用）
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      await wait(150);
    } else if (span) {
      // 最后手段：直接覆盖文本（可能被框架还原）
      span.textContent = title;
    }
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

  function getRowDataCells(rowEl) {
    const tds = Array.from(rowEl.querySelectorAll('td'));
    // 过滤掉动作列（包含 .col-action）
    return tds.filter((td) => !td.querySelector('.col-action'));
  }

  async function ensureCellInput(td, timeoutMs = 1500) {
    let input = td.querySelector(PLACEHOLDER_SELECTOR) || td.querySelector('input');
    if (input) return input;
    td.click();
    await wait(60);
    const ok = await waitUntil(() => !!(td.querySelector(PLACEHOLDER_SELECTOR) || td.querySelector('input')), timeoutMs, 80);
    return td.querySelector(PLACEHOLDER_SELECTOR) || td.querySelector('input');
  }

  function forceBlur(root) {
    const headerRow = getHeaderRow(root);
    if (headerRow) headerRow.click();
    const tableBody = root.querySelector('tbody');
    if (tableBody) tableBody.click();
    document.body && document.body.click();
  }

  async function ensureBodyColumnReady(root, colIndex, rowCount, timeoutMs = 3000) {
    const tbody = root.querySelector('tbody');
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const rows = Array.from(tbody.querySelectorAll('tr')).slice(0, rowCount);
      let allReady = true;
      for (const row of rows) {
        const rowCells = getRowDataCells(row);
        const td = rowCells[colIndex];
        if (!td) { allReady = false; break; }
        const hasInput = !!(td.querySelector('input'));
        if (!hasInput) { allReady = false; break; }
      }
      if (allReady) return true;
      await wait(100);
    }
    return false;
  }

  function collectRowInputsByHeader(root, rowEl, desiredTitles) {
    const headerCells = getHeaderCells(root);
    const rowDataCells = getRowDataCells(rowEl);
    const inputs = [];
    for (let i = 0; i < desiredTitles.length; i++) {
      const title = desiredTitles[i];
      const idx = headerCells.findIndex((th) => {
        const span = th.querySelector('.title-text');
        return span && (span.textContent || '').trim() === title;
      });
      if (idx === -1 || !rowDataCells[idx]) {
        return null;
      }
      const input = rowDataCells[idx].querySelector(PLACEHOLDER_SELECTOR);
      if (!input) return null;
      inputs.push(input);
    }
    return inputs.length === desiredTitles.length ? inputs : null;
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

  async function fillByColumnsSequentially(root, desiredTitles, sizeData) {
    const tbody = root.querySelector('tbody');
    if (!tbody) throw new Error('未找到表格主体');
    const rows = Array.from(tbody.querySelectorAll('tr')).slice(0, sizeData.length);
    for (let colIndex = 0; colIndex < desiredTitles.length; colIndex++) {
      // 确保存在第 colIndex 列并设置标题
      await ensureColumnWithTitle(root, colIndex, desiredTitles[colIndex]);
      // 为每一行填充该列
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const rowCells = getRowDataCells(row);
        const td = rowCells[colIndex];
        if (!td) throw new Error(`第 ${rowIndex + 1} 行第 ${colIndex + 1} 列不存在`);
        const input = await ensureCellInput(td, 2000);
        if (!input) throw new Error(`第 ${rowIndex + 1} 行第 ${colIndex + 1} 列未找到输入框`);
        const value = sizeData[rowIndex][colIndex];
        input.focus();
        setInputValue(input, value);
        // 对于 auto-complete，需要回车确认
        if (input.getAttribute && input.getAttribute('role') === 'combobox') {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
        }
        input.blur();
        await wait(30);
      }
      // 当前列完成，继续添加下一列（若需要）
      await wait(120);
    }
  }
})();


