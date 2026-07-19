# R6.5 Integration

- `migrations/635_r6_booking.mjs` depends on `634_r6_portal` and owns the `booking_resource` and `resource_booking` tables.
- `booking-engine.js` is the domain owner.
- `booking-routes.js` is mounted at `/api/x/booking`.
- Offers active double-booking collision prevention predicates during booking creation or confirmation.
- Includes default hourly slot generation logic to easily query resource availability.
