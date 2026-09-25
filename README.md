# Overlap

Solana multi-coin wallet overlap scanner. Open `index.html` in a browser.

## Coin activity period

Choose All time, Last hour, Last 6 hours, Last 24 hours, Last 7 days,
Last 30 days, or a custom start/end date in your local timezone, then run
Scan Holders or Scan Historical.

A limited period keeps wallets with incoming or outgoing activity in **every**
selected coin within the inclusive time range. This includes transfers, not
just buys. Balances and holding status remain current. Saved scans retain the
actual start/end timestamps and historical holding flags. Loading a preset
configuration and rescanning calculates a fresh relative time window.

Time filtering uses Helius `getTransfersByAddress` with server-side mint and
block-time filters. It requires a Developer plan or higher:
https://www.helius.dev/docs/rpc/gettransfersbyaddress

Only wallets in the original overlap are checked, sequentially, with at most
one request per wallet/coin pair. Large overlaps can take time and consume API
credits. API failures are shown as errors; they never silently fall back to
all-time results.

Historical candidates still come from the original `getTokenAccounts` lookup
including zero-balance accounts. Closed token accounts may be missing; this is
not a complete archival holder index or a historical balance snapshot.

## Checks

Run `node --test tests/activity.test.cjs` for date validation, range restoration,
API filtering/error handling, and integration checks for both scan modes.
