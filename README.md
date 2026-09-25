# Overlap

Solana multi-coin wallet overlap scanner. Open `index.html` in a browser. There is no password screen.

## Coin activity period

Choose All time, Last hour, Last 6 hours, Last 24 hours, Last 7 days,
Last 30 days, or a custom start/end date in your local timezone, then run
Scan Holders or Scan Including Empty Accounts.

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

The extended scan uses `getTokenAccounts` including zero-balance accounts. Closed token accounts may be missing; this is
not a complete archival holder index or a historical balance snapshot.

## Checks

Run `node --test tests/*.test.cjs` for scan integration, date filtering, balance
aggregation and decimal formatting, safe rendering, CSV exports, and saved-scan
identity/deletion checks. Database writes are tested with mocks.

Balances sum all accounts for each owner and use the mint decimals. Supply
percentages use `getTokenSupply`, independent of excluded wallets and pools.
Saved scans capture the completed scan inputs; concurrent saves and deletes
use Firestore transactions. CSV exports use holding status for the extended
scan and preserve date ranges. Names and labels render as text.

Older saved scans retain their original calculations; rescan and save again
to get corrected balances and supply percentages.
