# R6.5 Appointments & resource booking

Engine to track booking resources (consultants, rooms, equipment, vehicles) and register slots reservations.

Frozen boundaries:
- Existing `partner_master` remains canonical.
- Time range overlaps must raise validation errors (409) to prevent double-booking.
- Strict row-level company scoping.
