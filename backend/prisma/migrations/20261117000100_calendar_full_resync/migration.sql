-- In-person events (no video link) are now synced too: drop the incremental sync tokens so the next
-- sync re-reads the full window and picks up events that were skipped before.
update public.google_accounts set calendar_sync_token = null;
