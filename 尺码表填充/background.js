// MV3 Service Worker (module)

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'fill-size-chart') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    const url = tab.url || '';
    if (!/https:\/\/csp\.aliexpress\.com\//.test(url)) {
      console.warn('[size-chart] 当前标签页不在目标站点');
      return;
    }
    const stored = await chrome.storage.sync.get('sizeData');
    const sizeData = stored && Array.isArray(stored.sizeData) ? stored.sizeData : undefined;
    await chrome.tabs.sendMessage(tab.id, { type: 'FILL_SIZE_CHART', sizeData });
  } catch (e) {
    console.error('[size-chart] command error', e);
  }
});


