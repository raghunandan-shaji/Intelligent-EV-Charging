"""
FastAPI backend for the Energy Management System.
Serves the frontend and provides API endpoints for running the planning engine.
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import json
import uvicorn

from planning_engine import (
    Device, DEFAULT_DEVICES, DEFAULT_PARAMS,
    find_optimal_plan, build_state_tree
)
from visualizations import generate_all_charts, chart_state_tree


app = FastAPI(title="EV Charging Station - Energy Management System")

# Ensure directories exist
os.makedirs("charts", exist_ok=True)
os.makedirs("static", exist_ok=True)


# ── Pydantic Models ─────────────────────────────────────────────────

class DeviceInput(BaseModel):
    name: str
    priority: int
    battery: float
    consumption_rate: float
    charge_rate: float


class RunRequest(BaseModel):
    devices: Optional[List[DeviceInput]] = None
    horizon: Optional[int] = 5
    max_charging_slots: Optional[int] = 2
    charge_success_prob: Optional[float] = 0.9
    switching_penalty: Optional[float] = 5
    priority_reward_multiplier: Optional[float] = 10
    low_battery_threshold: Optional[float] = 20
    low_battery_penalty: Optional[float] = 50
    depletion_penalty: Optional[float] = 100


# ── API Endpoints ────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    """Serve the main HTML page."""
    return FileResponse("static/index.html")


@app.post("/api/run")
async def run_planning(request: RunRequest):
    """Run the planning engine with given configuration."""
    # Build devices
    if request.devices:
        devices = [
            Device(
                name=d.name,
                priority=d.priority,
                battery=d.battery,
                consumption_rate=d.consumption_rate,
                charge_rate=d.charge_rate,
            )
            for d in request.devices
        ]
    else:
        devices = [
            Device(d.name, d.priority, d.battery, d.consumption_rate, d.charge_rate)
            for d in DEFAULT_DEVICES
        ]

    # Build params
    params = {
        "horizon": request.horizon,
        "max_charging_slots": request.max_charging_slots,
        "charge_success_prob": request.charge_success_prob,
        "switching_penalty": request.switching_penalty,
        "priority_reward_multiplier": request.priority_reward_multiplier,
        "low_battery_threshold": request.low_battery_threshold,
        "low_battery_penalty": request.low_battery_penalty,
        "depletion_penalty": request.depletion_penalty,
    }

    # Run planning engine
    result = find_optimal_plan(devices, params)

    # Generate visualizations
    chart_files = generate_all_charts(result, output_dir="charts")

    # Generate state-space tree (limited horizon = 2 for visualization)
    tree_horizon = min(2, request.horizon)
    tree = build_state_tree(
        devices,
        tuple(d.battery for d in devices),
        tree_horizon,
        request.max_charging_slots,
    )
    tree_file = chart_state_tree(tree, result["devices"], output_dir="charts")
    if tree_file:
        chart_files.append(tree_file)

    # Build response (exclude raw plan objects)
    response = {
        "total_plans": result["total_plans"],
        "optimal_plan": result["optimal_plan"],
        "top_plans": result["top_plans"],
        "worst_plan": result["worst_plan"],
        "devices": result["devices"],
        "params": result["params"],
        "initial_state": result["initial_state"],
        "chart_files": chart_files,
    }

    return JSONResponse(content=response)


@app.get("/api/defaults")
async def get_defaults():
    """Return default device configuration and parameters."""
    return JSONResponse(content={
        "devices": [
            {
                "name": d.name,
                "priority": d.priority,
                "battery": d.battery,
                "consumption_rate": d.consumption_rate,
                "charge_rate": d.charge_rate,
            }
            for d in DEFAULT_DEVICES
        ],
        "params": DEFAULT_PARAMS,
    })


# Serve charts directory
app.mount("/charts", StaticFiles(directory="charts"), name="charts")

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")


if __name__ == "__main__":
    print("\n⚡ EV Charging Station — Energy Management System")
    print("   Open http://localhost:8000 in your browser\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
