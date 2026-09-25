const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const html = readFileSync(`${__dirname}/../index.html`, 'utf8');
function section(from, to) {
  const start = html.indexOf(from), end = html.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Missing section: ${from}`);
  return html.slice(start, end);
}
const formatting = section('function escapeHTML(', 'async function heliusRPC(');

test('sum multiple token accounts across pages and follow a cursor even on a short page', async () => {
  const calls = [];
  const c = vm.createContext({ BLACKLIST: new Set(['pool']), userBlocked: {}, isOnCurve: () => true, setStatus() {}, setTimeout: fn => fn(),
    heliusRPC: async (method, params) => {
      calls.push({method, params});
      return params.cursor
        ? { token_accounts: [{owner:'alice',amount:'200'}, {owner:'pool',amount:'9700'}] }
        : { token_accounts: [{owner:'alice',amount:'100'}], cursor:'page-two' };
    }
  });
  vm.runInContext(section('async function fetchHolders(', 'function updateActivityPeriod('), c);
  const holders = await c.fetchHolders('mint', 'COIN');
  assert.equal(holders.alice, 300n);
  assert.equal(holders.pool, undefined);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].params.options.showZeroBalance, false);
});

test('raw amounts preserve exact decimals, including large values and zero', () => {
  const c = vm.createContext({}); vm.runInContext(formatting, c);
  assert.equal(c.tokenAmount(123456789n, 6), '123.456789');
  assert.equal(c.tokenAmount(100000000n, 6), '100');
  assert.equal(c.tokenAmount(0n, 6), '0');
  assert.equal(c.tokenAmount(9007199254740993123n, 9), '9007199254.740993123');
  assert.equal(c.formatBalance('1234.000001'), '1,234.000001');
});

test('historical CSV uses status, retains dates, and escapes quotes and spreadsheet formulas', () => {
  const c = vm.createContext({});
  vm.runInContext(section('function buildCSV(', 'function exportCSV('), c);
  const csv = c.buildCSV([{wallet:'wallet',label:'=BAD("quoted")',amounts:[null,null],pcts:[null,null],stillHolding:[true,false]}], ['A','B'], true, {start:100,end:200});
  assert.match(csv, /"A Status","B Status"/);
  assert.match(csv, /"HOLDING","NOT HOLDING"/);
  assert.match(csv, /'=BAD\(""quoted""\)/);
  assert.match(csv, /1970-01-01T00:01:40.000Z/);
  const balances = c.buildCSV([{wallet:'wallet',label:'',amounts:['1.123456789'],pcts:[0.03]}], ['A'], false, null);
  assert.match(balances, /"1.123456789","0.0300%"/);
});

test('saved scan uses completed scan mints and preserves null historical balances', async () => {
  let stored;
  const c = vm.createContext({ lastCoins:[{label:'A',mint:'original-A'},{label:'B',mint:'original-B'}],lastLabels:['A','B'],lastResults:[{wallet:'alice',amounts:[null,null],pcts:[null,null],stillHolding:[true,false]}],lastActivityRange:{start:100,end:200,period:'custom'},lastIsHistorical:true,
    prompt:()=> 'test', crypto:{randomUUID:()=> 'stable-id'}, db:{},SCANS_COL:'scans',
    document:{ querySelectorAll:()=>{throw Error('Must not read edited form values');} },
    runTransaction:async(_,fn)=>fn({get:async()=>({exists:()=>true,data:()=>({scans:[{id:'older'}]})}),set:(_,data)=>{stored=data;}}),
    loadSavedScans:async()=>{},switchTab(){},setTimeout(){},alert:message=>{throw Error(message);}
  });
  vm.runInContext(section('async function saveScan(', 'async function loadSavedScans('), c);
  await c.saveScan();
  assert.deepEqual(Array.from(stored.scans[0].mints), ['original-A','original-B']);
  assert.equal(stored.scans[0].resultsData[0].amounts[0], null);
  assert.equal(stored.scans[0].id, 'stable-id');
  assert.equal(stored.scans[1].id, 'older');
});

test('deletion keeps confirmed identity when the remote list changes order', async () => {
  let stored;
  const target = {id:'target',name:'old scan'};
  const c = vm.createContext({ displayedScans:[target],document:{getElementById:()=>({style:{}})}, db:{},SCANS_COL:'scans',
    runTransaction:async(_,fn)=>fn({get:async()=>({exists:()=>true,data:()=>({scans:[{id:'new'},target]})}),set:(_,data)=>{stored=data;}}),
    loadSavedScans:async()=>{},alert:message=>{throw Error(message);}
  });
  vm.runInContext(section('let pendingDeleteScan = null;', 'function updateSavedTabCount('), c);
  c.confirmDeleteScan(0);
  await c.executeDeleteScan();
  assert.deepEqual(stored.scans.map(scan=>scan.id), ['new']);
  stored = null;
  c.confirmDeleteScan(0);c.closeConfirm();await c.executeDeleteScan();
  assert.equal(stored,null);
});

test('saved scan loading resolves stable identity, not the current array index', async () => {
  const c = vm.createContext({displayedScans:[{id:'old'}], SCANS_COL:'scans',getDoc:async()=>({exists:()=>true,data:()=>({scans:[{id:'new'},{id:'old'}]})})});
  vm.runInContext(section('async function findSavedScan(', 'async function loadScanConfig('), c);
  assert.equal((await c.findSavedScan(0)).id, 'old');
});

test('untrusted labels and attributes render as text rather than injected HTML', () => {
  const nodes = {};
  const payload = '<img src=x onerror="alert(1)">';
  const c = vm.createContext({document:{getElementById:id=>nodes[id] ||= {innerHTML:'',style:{}}},globalWallets:{wallet:payload},userWallets:{wallet:payload},userBlocked:{wallet:payload}});
  vm.runInContext(formatting + section('function renderWalletList(', 'function updateWalletTabCount(') + section('function renderBlockedList(', 'function updateBlockedTabCount(') + section('let displayedScans = [];', 'async function findSavedScan('), c);
  c.renderWalletList();c.renderBlockedList();
  c.renderSavedScans([{name:payload,coins:[payload],matchCount:payload,savedAt:1}]);
  for (const id of ['walletListEl','blockedListEl','savedScansList']) {
    assert.ok(!nodes[id].innerHTML.includes('<img'));
    assert.ok(nodes[id].innerHTML.includes('&lt;img'));
  }
  assert.equal(c.escapeHTML('"\'&<>'), '&quot;&#39;&amp;&lt;&gt;');
});

test('empty-account scan uses supported options and does not advertise full history', async () => {
  let params;
  const c = vm.createContext({BLACKLIST:new Set(),userBlocked:{},isOnCurve:()=>true,setStatus(){},heliusRPC:async(_,p)=>{params=p;return {token_accounts:[{owner:'empty',amount:'0'}]};}});
  vm.runInContext(section('async function fetchIncludingEmptyAccounts(', 'async function runHistoricalScan('), c);
  assert.deepEqual(Array.from(await c.fetchIncludingEmptyAccounts('mint','COIN')), ['empty']);
  assert.equal(params.options.showZeroBalance,true);
  assert.ok(html.includes('wallets with closed accounts may be missing'));
  assert.ok(!html.includes('>SCAN HISTORICAL<'));
});

test('no password gate or authentication cookie remains', () => {
  assert.doesNotMatch(html, /pwdOverlay|pwdInput|PWD_HASH|checkPassword|overlap_auth|type="password"/);
});

test('RPC rejects HTTP errors, malformed responses and times out stalled calls', async () => {
  const c = vm.createContext({HELIUS_RPC:'unused',AbortSignal,setTimeout:fn=>fn(),fetch:async(_,options)=> {assert.ok(options.signal);return {ok:false,status:403};}});
  vm.runInContext(section('async function heliusRPC(', 'async function fetchTokenSupply('), c);
  await assert.rejects(c.heliusRPC('method',{}), /403/);
  c.fetch=async()=>({ok:true,json:async()=>({})});
  await assert.rejects(c.heliusRPC('method',{}), /Unexpected/);
});
