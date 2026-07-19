# R6.7 Omni-communications campaign test contract

`scripts/test-r6-campaign.mjs` uses a disposable SQLite database and proves:

- creating and listing campaigns;
- dispatching campaign to targeted partners;
- template placeholder resolution (substituting `partner_name`, `points`, and `tier` correctly);
- webhook receipt of status updates (updating delivery logs to `delivered`/`read`);
- webhook receipt of inbound customer replies (logging inbound messages);
- company scope and permissions checks;
- migration 637 schema restoration on down.
