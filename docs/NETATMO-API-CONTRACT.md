# Netatmo Energy contract audit — SIM-4

Status: partial validation; **not certified Netatmo API compatibility**.

| Endpoint | Mock coverage | Known limitations |
|---|---|---|
| OAuth2 authorize/token | Authorization code, refresh token, scope enforcement | Consent UI and production-grade identity controls absent |
| GET /api/homesdata | Home, room, module envelope | Partial fields, illustrative identifiers |
| GET /api/homestatus | Required home_id and thermostat readings | Partial status and module metadata |
| POST /api/setroomthermpoint | Manual setpoint and duration | Verify official endtime/mode conventions |
| POST /api/setthermmode | Schedule, away, frost protection | Verify full mode and response contract |
| GET /api/getroommeasure | Not implemented | Historical measurements and official query schema pending |

Reference documentation: https://dev.netatmo.com/apidocumentation/control and https://dev.netatmo.com/apidocumentation/energy

Tests check stable simulator invariants, not exhaustive compatibility with live Netatmo hardware. No production credentials or real thermostat are used.
