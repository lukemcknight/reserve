# NIL Tax Reserve API

FastAPI service that estimates a conservative cash reserve for NIL (Name, Image, Likeness) income. Add your own authentication, persistence, and payments in front of this service before exposing it publicly.

## Assumptions
- Self-employment (1099) income for a single filer
- No deductions applied
- NIL income treated as additional income on top of other earnings
- Simplified federal brackets for effective rate inference
- State tax lookup across most states (no income tax defaults to 0 if unknown)

## Disclaimer
Estimates only. Not tax advice.

## Run Locally
1. From the `backend` directory, install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Start the server:
   ```bash
   uvicorn app.main:app --reload
   ```
3. Example request:
   ```bash
   curl -X POST http://127.0.0.1:8000/api/tax/calculate \
     -H "Content-Type: application/json" \
     -d '{"amount": 5000, "state": "OH", "federal_rate": 0.22}'
   ```

## Deployment notes
- CORS: set `ALLOWED_ORIGINS` (comma-separated) to your frontend domains (e.g., `https://myapp.vercel.app`) so browsers can call the API. Defaults to `*` for public use.

## Additional endpoints
- `GET /api/tax/state-rates` — list of supported state codes, display names, and effective rates used by the calculator.
