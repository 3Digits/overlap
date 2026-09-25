const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const html = readFileSync(`${__dirname}/../index.html`, 'utf8');
const helpers = html.slice(html.indexOf('function updateActivityPeriod()'), html.indexOf('async function runScan()'));
function setup() {
  const elements = Object.fromEntries(['activityPeriod', 'activityStart', 'activityEnd', 'customActivityRange'].map(id => [id, { value: '', style: {} }]));
  elements.activityPeriod.value = 'all';
  const calls = [];
  const context = vm.createContext({
    document: { getElementById: id => elements[id] },
    HELIUS_RPC: 'https://example.invalid', setStatus() {},
    setTimeout: fn => fn(),
    fetch: async (_, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      const [wallet, config] = body.params;
      return { ok: true, json: async () => ({ result: { data:
        wallet === 'both' || config.mint === 'first'
          ? [{ mint: config.mint, blockTime: 150, fromUserAccount: wallet }]
          : [] } }) };
    }
  });
  vm.runInContext(helpers, context);
  return { context, elements, calls };
}
test('presets use one fixed scan time and all-time bypasses activity requests', async () => {
  const { context: c, elements, calls } = setup();
  assert.equal(c.readActivityRange(), null);
  const wallets = new Set(['both']);
  assert.equal(await c.filterWalletsByActivity(wallets, [], null), wallets);
  assert.equal(calls.length, 0);
  for (const hours of [1, 6, 24, 168, 720]) {
    elements.activityPeriod.value = String(hours);
    const range = c.readActivityRange(1800000000000);
    assert.equal(range.end - range.start, hours * 3600);
    assert.equal(range.end, 1800000000);
  }
});
test('custom range rejects missing, reversed, and future dates; restores local dates', () => {
  const { context: c, elements: e } = setup();
  e.activityPeriod.value = 'custom';
  assert.throws(() => c.readActivityRange(), /both/);
  e.activityStart.value = '2025-01-02T12:00';
  e.activityEnd.value = '2025-01-01T12:00';
  assert.throws(() => c.readActivityRange(), /before/);
  e.activityEnd.value = '2099-01-01T12:00';
  assert.throws(() => c.readActivityRange(), /future/);
  e.activityEnd.value = '2025-01-03T12:00';
  const range = c.readActivityRange();
  c.restoreActivityRange(range);
  assert.equal(e.activityStart.value, '2025-01-02T12:00');
  assert.equal(e.activityEnd.value, '2025-01-03T12:00');
  assert.equal(e.customActivityRange.style.display, 'grid');
  c.restoreActivityRange(null);
  assert.equal(e.activityPeriod.value, 'all');
  assert.equal(e.customActivityRange.style.display, 'none');
});
test('requires activity in every coin and sends inclusive time/mint filters', async () => {
  const { context: c, calls } = setup();
  const result = await c.filterWalletsByActivity(new Set(['both', 'one']), [{ mint: 'first' }, { mint: 'second' }], { start: 100, end: 200 });
  assert.deepEqual([...result], ['both']);
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.method, 'getTransfersByAddress');
    assert.deepEqual(call.params[1].filters, { blockTime: { gte: 100, lte: 200 } });
    assert.equal(call.params[1].limit, 1);
    assert.equal(call.params[1].solMode, 'separate');
  }
});
test('API errors and malformed responses fail instead of returning unfiltered wallets', async () => {
  const { context: c } = setup();
  for (const response of [
    { ok: false, status: 403 },
    { ok: true, json: async () => ({ error: { message: 'Plan required' } }) },
    { ok: true, json: async () => ({ result: {} }) }
  ]) {
    c.fetch = async () => response;
    await assert.rejects(c.filterWalletsByActivity(new Set(['both']), [{ mint: 'first' }], { start: 100, end: 200 }));
  }
});
test('both scan modes filter before rendering and keep unfiltered balance totals', async () => {
  for (const historical of [false, true]) {
    const { context: c, elements: e } = setup();
    for (const id of ['scanBtn', 'histBtn', 'results', 'minPct', 'maxResults']) e[id] = { value: '', classList: { remove() {} } };
    e.activityPeriod.value = '1';
    c.document.querySelectorAll = () => ['first', 'second'].map(mint => ({ querySelectorAll: () => [{ value: mint }, { value: mint }] }));
    Object.assign(c, { clearError() {}, clearStatus() {}, showError: message => { throw Error(message); }, globalWallets: {},
      fetchHolders: async () => ({ both: 10, one: 90 }),
      fetchAllEverHeld: async () => new Set(['both', 'one']),
      filterWalletsByActivity: async (wallets, coins, range) => { assert.equal(wallets.size, 2); assert.equal(coins.length, 2); assert.ok(range.start < range.end); return new Set(['both']); },
      renderResults: (results, labels, total, mode) => { assert.equal(total, 1); assert.equal(results[0].wallet, 'both'); assert.equal(mode, historical); if (!historical) assert.equal(results[0].pcts[0], 10); }
    });
    const start = html.indexOf(historical ? 'async function runHistoricalScan()' : 'async function runScan()');
    const end = html.indexOf(historical ? '// ─────────────────────────────────────────────────────────────────────────────' : 'function renderResults(', start);
    vm.runInContext('let lastResults, lastLabels, lastIsHistorical, lastActivityRange;\n' + html.slice(start, end), c);
    await (historical ? c.runHistoricalScan() : c.runScan());
    assert.equal(e.scanBtn.disabled, false);
    assert.equal(e.histBtn.disabled, false);
  }
});
