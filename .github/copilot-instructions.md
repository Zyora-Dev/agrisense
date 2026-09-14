# AgriSense

- Develop the backend first, then web frontend, mobile app, and finally IoT hardware.
- Backend stack: Python and FastAPI. Keep changes scoped to the requested module.
- Reuse the workspace `.venv`; do not create an additional backend environment.
- Run backend tests from `backend` with `../.venv/bin/python -m pytest tests -q`.
- Use simulated inputs until hardware is integrated. Label simulated pH/NPK and
  any predictions that depend on them.
- Planned inference placement: compact XGBoost on ESP32, YOLO in the frontend and
  mobile app. Do not claim hardware validation or model accuracy without tests.
- Update `PROGRESS.md` after confirmed changes.