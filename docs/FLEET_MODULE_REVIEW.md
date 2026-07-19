# Fleet Module Review — Phase 8B

## Overview

The Fleet module (`modules/fleet.js`) has been repaired for Phase 8B. It is now a
demo-ready fleet command center with 7 internal sections, all within the same
`#pageFleet` page (no new routes). Demo data is in-memory only, visibly labeled
as "بيانات تجريبية للعرض".

## Architecture

```
modules/fleet.js     — Fleet module (IIFE, ~530 lines, 7 sections)
modules/fleet.css    — Fleet styling (~140 lines, RTL, dark-mode ready)
views/fleet.html     — Page shell (7 lines, updated title/subtitle)
```

## 7 Internal Sections (tabs within #pageFleet)

| Tab ID      | Label                      | Content |
|-------------|----------------------------|---------|
| `dashboard` | 📊 لوحة السيطرة            | KPI cards + document expiry alerts |
| `guard`     | 🗺️ خريطة المتابعة          | Command map, zone policies, selected vehicle, Jarvis AI, investigations |
| `vehicles`  | 🚚 المركبات والمعدات       | Vehicle register table + add/edit form |
| `fuel_risk` | ⛽ الوقود والمخاطر          | Fuel logging + anti-theft risk detection |
| `trips`     | 🛣️ الرحلات والمناطق         | Trip logging + zone speed policies |
| `invest`    | 🔍 التقارير والتحقيقات      | Anomaly cases + investigation workflow |
| `settings`  | ⚙️ إعدادات الربط            | Demo info + integration options |

## Demo Data

12 in-memory vehicles with mixed types, drivers, projects, and anomaly states:

| # | Plate     | Type       | Driver     | Status      | Anomaly |
|---|-----------|------------|------------|-------------|---------|
| 1 | B-1045    | truck      | سعد        | active      | —       |
| 2 | EQ-77     | loader     | حيدر       | active      | fuel    |
| 3 | GEN-19    | generator  | كهرباء     | idle        | —       |
| 4 | P-5521    | pickup     | كرار       | active      | speeding|
| 5 | EX-05     | excavator | ناجي       | active      | fuel    |
| 6 | CR-06     | crane      | فارس       | maintenance | offline |
| 7 | SV-07     | car        | ريان       | active      | —       |
| 8 | TK-08     | tanker     | ماجد       | active      | speeding|
| 9 | T-1150    | truck      | عماد       | active      | —       |
| 10| RL-03     | roller     | صباح       | active      | —       |
| 11| VN-22     | van        | ياسر       | maintenance | offline |
| 12| BD-09     | bulldozer  | هادي       | maintenance | —       |

6 zones with speed limits (workshop 10, site 20, city 60, highway 90, fuel station 15, restricted 5).

## Key Features (Phase 8B)

### 1. Command Map (خريطة المتابعة)
- SVG/HTML map with positioned zone overlays and vehicle pins
- Color-coded markers (green=normal, amber=speeding, red=fuel anomaly, gray=offline)
- Filter bar: status, project, driver, vehicle type
- Selected vehicle detail panel with real-time status

### 2. Fuel Risk / Anti-Theft (الوقود والمخاطر)
- Fuel logging form (writes to database.json)
- Variance detection: compares dispensed vs measured fuel
- Low-confidence readings flagged
- Anti-theft mechanism description

### 3. Speed / Geofence Logic
- Zone-specific speed limits (light vs heavy vehicle)
- Real-time violation detection in command map
- Violation summary with vehicle plates and speeds
- No external AI required — deterministic comparison

### 4. Jarvis AI Panel (قراءة فقط)
- Read-only insights panel
- Dynamic content based on top anomaly
- Shows anomaly count and specific recommendation
- No approve/dismiss/modify/delete actions

### 5. Investigation Management
- Dedicated investigations tab
- Case listing by severity (critical/high/medium)
- Placeholder "فتح تحقيق" / "تقرير" buttons (toast only)
- Investigation workflow documentation

### 6. Demo Data Badge
- All sections show "بيانات تجريبية للعرض" when no real data
- Demo data is in-memory only, never written to database.json
- Demo loader button available in vehicles tab

## Exported API

```js
window.OctagonFleet = { render, ensureData, portfolio, isDemoMode };
window.renderFleet()             — re-render entire page
window.flOpenTab(tabId)          — switch section
window.flSaveVehicle()           — save vehicle form
window.flLogFuel()               — log fuel entry
window.flLogTrip()               — log trip entry
window.flLoadDemo()              — load demo data
window.flOpenForm(id)            — open vehicle form
window.flCancelForm()            — cancel form
window.flSearch(q)               — search vehicles
window.flSetGuardFilter(f)       — filter map markers
window.flSetGuardProject(p)      — filter by project
window.flSetGuardDriver(d)       — filter by driver
window.flSetGuardType(t)         — filter by type
window.flSelectGuardVehicle(id)  — select vehicle on map
window.flGuardAction(label)      — placeholder action button
window.flSetStatus(id, status)   — change vehicle status
window.flArchive(id)             — archive vehicle

Jarvis tool: report_fleet_today  — returns portfolio snapshot
```

## CSS Conventions

- RTL layout (`direction: rtl`)
- Dark-mode ready via CSS variables (`var(--card-bg)`, `var(--border-color)`, etc.)
- Responsive: grid collapses to single column below 800px
- Consistent 8px/12px/14px spacing scale
- Color-coded severity classes (fl-sev-critical, fl-sev-high, fl-sev-medium)
- Status badges (fl-st-ok, fl-st-maint, fl-st-idle)

## Files Changed

```
M views/fleet.html       (7 lines — title + subtitle)
M modules/fleet.js        (~530 lines — complete rewrite)
M modules/fleet.css       (~140 lines — complete rewrite)
A docs/FLEET_MODULE_REVIEW.md  (this file)
```

## Validation

- Route count: 93/93 unchanged (single #pageFleet page)
- No database.json mutations for demo data
- No real GPS/OBD/tank sensor integration
- No external map APIs used
- No hardcoded vendor-specific features
