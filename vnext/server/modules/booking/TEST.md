# R6.5 Appointments & resource booking test contract

`scripts/test-r6-booking.mjs` uses a disposable SQLite database and proves:

- creating booking resources with valid properties;
- registering a slot booking linked to a partner;
- dynamic double-booking checking (overlapping slots raise 409);
- checking hourly slot availability lists (marks booked slots as unavailable);
- confirming and cancelling bookings;
- company scope and permissions checks;
- migration 635 schema restoration on down.
