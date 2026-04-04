# Intelligent EV Charging Station — Energy Management System

Classical Planning (Forward State-Space Search) + Decision Networks for optimal multi-device charging schedules.

**UCS3461 — Foundations of Artificial Intelligence | SSN College of Engineering**

## Setup

### Prerequisites
- Python 3.10+

### Install

```bash
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
# .venv\Scripts\activate         # Windows

pip install fastapi uvicorn matplotlib numpy
```

### Run

```bash
python main.py
```

Open **http://localhost:8000** in your browser.

## How It Works

1. **Configure** — Set up 5 EVs (battery level, priority, drain/charge rates) and system parameters (horizon, max charging slots, success probability, switching penalty)
2. **Run** — The planning engine generates all possible charging schedules via exhaustive forward state-space search and evaluates each using expected utility
3. **Simulate** — Step through the optimal plan with animated battery levels, a live decision network, state-space tree, and running utility calculations

## Formulas (from assignment)

| Formula | Expression |
|---------|-----------|
| Battery Deficiency Cost | `C(t) = Σᵢ (100 - bᵢ)` |
| Total Cost | `TC = Σₜ C(t) + switches × Cs` |
| P(success) | `p^H` |
| Expected Utility | `EU = P(success) × Reward − P(failure) × Penalty − TC` |

## Project Structure

```
├── main.py              # FastAPI backend, serves frontend + API
├── planning_engine.py   # Forward search, state transitions, EU calculation
├── visualizations.py    # Matplotlib chart generation (legacy)
├── static/
│   ├── index.html       # Single-window simulation UI
│   ├── styles.css       # Dark-theme dashboard styles
│   └── script.js        # Step-through animation controller
```

## Tech Stack

- **Backend**: Python, FastAPI, uvicorn
- **Planning**: Exhaustive forward state-space search, decision networks
- **Frontend**: Vanilla HTML/CSS/JS, no frameworks
