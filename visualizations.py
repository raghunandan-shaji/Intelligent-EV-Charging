"""
Visualization module for the Energy Management System.
Generates matplotlib charts and saves them as PNG files.
"""

import matplotlib
matplotlib.use("Agg")  # Non-interactive backend for server use

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
import os
from typing import List, Dict, Any, Tuple


# Color palette
COLORS = ["#00d2ff", "#ff6b6b", "#ffd93d", "#6bcb77", "#a855f7"]
BG_COLOR = "#0f172a"
CARD_COLOR = "#1e293b"
GRID_COLOR = "#334155"
TEXT_COLOR = "#e2e8f0"


def setup_style():
    """Apply dark theme styling to matplotlib."""
    plt.rcParams.update({
        "figure.facecolor": BG_COLOR,
        "axes.facecolor": CARD_COLOR,
        "axes.edgecolor": GRID_COLOR,
        "axes.labelcolor": TEXT_COLOR,
        "text.color": TEXT_COLOR,
        "xtick.color": TEXT_COLOR,
        "ytick.color": TEXT_COLOR,
        "grid.color": GRID_COLOR,
        "grid.alpha": 0.3,
        "font.family": "sans-serif",
        "font.size": 11,
    })


def ensure_output_dir(output_dir: str):
    os.makedirs(output_dir, exist_ok=True)


def generate_all_charts(result: Dict[str, Any], output_dir: str = "charts"):
    """Generate all visualization charts and save as PNGs."""
    setup_style()
    ensure_output_dir(output_dir)

    devices = result["devices"]
    optimal = result["optimal_plan"]
    top_plans = result["top_plans"]
    params = result["params"]
    initial_state = result["initial_state"]

    chart_battery_evolution(optimal, devices, initial_state, output_dir)
    chart_eu_comparison(top_plans, output_dir)
    chart_device_stability(optimal, devices, initial_state, params, output_dir)
    chart_failure_risk(optimal, devices, params, output_dir)
    chart_cost_breakdown(top_plans, output_dir)
    chart_charging_schedule(optimal, devices, output_dir)

    return [
        "battery_evolution.png",
        "eu_comparison.png",
        "device_stability.png",
        "failure_risk.png",
        "cost_breakdown.png",
        "charging_schedule.png",
    ]


# ── 1. Battery Evolution Over Time ──────────────────────────────────

def chart_battery_evolution(optimal: Dict, devices: List[Dict],
                            initial_state: List[float], output_dir: str):
    """Line chart showing battery levels of all devices over time for the optimal plan."""
    fig, ax = plt.subplots(figsize=(12, 6))

    num_devices = len(devices)
    steps = optimal["steps"]
    horizon = len(steps)

    # Build battery trajectories
    for i in range(num_devices):
        levels = [initial_state[i]]
        for step in steps:
            levels.append(step["state_after"][i])

        x = list(range(horizon + 1))
        ax.plot(x, levels, marker="o", linewidth=2.5, markersize=8,
                color=COLORS[i % len(COLORS)], label=devices[i]["name"],
                zorder=3)

    # Danger zone
    ax.axhspan(0, 20, alpha=0.15, color="#ff6b6b", zorder=1)
    ax.axhline(y=20, color="#ff6b6b", linestyle="--", alpha=0.5, linewidth=1)
    ax.text(horizon + 0.1, 20, "Low Battery\nThreshold", fontsize=8,
            color="#ff6b6b", va="center")

    ax.set_xlabel("Time Step", fontsize=13, fontweight="bold")
    ax.set_ylabel("Battery Level (%)", fontsize=13, fontweight="bold")
    ax.set_title("Battery Evolution — Optimal Charging Schedule",
                 fontsize=16, fontweight="bold", pad=15)
    ax.set_xlim(-0.3, horizon + 0.3)
    ax.set_ylim(-5, 105)
    ax.set_xticks(range(horizon + 1))
    ax.legend(loc="upper right", framealpha=0.8, facecolor=CARD_COLOR,
              edgecolor=GRID_COLOR)
    ax.grid(True, alpha=0.2)
    fig.tight_layout()
    fig.savefig(os.path.join(output_dir, "battery_evolution.png"), dpi=150,
                bbox_inches="tight")
    plt.close(fig)


# ── 2. Expected Utility Comparison ──────────────────────────────────

def chart_eu_comparison(top_plans: List[Dict], output_dir: str):
    """Horizontal bar chart comparing EU of top plans."""
    fig, ax = plt.subplots(figsize=(12, 6))

    n = min(len(top_plans), 10)
    plans = top_plans[:n]
    labels = [f"Plan {i+1}" for i in range(n)]
    eus = [p["expected_utility"] for p in plans]

    # Color gradient: best = cyan, worst = dim
    colors = []
    max_eu = max(eus) if eus else 1
    min_eu = min(eus) if eus else 0
    for eu in eus:
        if max_eu == min_eu:
            t = 1.0
        else:
            t = (eu - min_eu) / (max_eu - min_eu)
        r = int(15 + (0 - 15) * t)
        g = int(41 + (210 - 41) * t)
        b = int(75 + (255 - 75) * t)
        colors.append(f"#{r:02x}{g:02x}{b:02x}")

    bars = ax.barh(labels[::-1], eus[::-1], color=colors[::-1], height=0.6,
                   edgecolor="none", zorder=3)

    # Value labels
    for bar, eu in zip(bars, eus[::-1]):
        ax.text(bar.get_width() + abs(max_eu) * 0.02, bar.get_y() + bar.get_height() / 2,
                f"{eu:.1f}", va="center", fontsize=10, fontweight="bold")

    ax.set_xlabel("Expected Utility", fontsize=13, fontweight="bold")
    ax.set_title("Expected Utility — Top 10 Plans", fontsize=16,
                 fontweight="bold", pad=15)
    ax.grid(True, axis="x", alpha=0.2)
    fig.tight_layout()
    fig.savefig(os.path.join(output_dir, "eu_comparison.png"), dpi=150,
                bbox_inches="tight")
    plt.close(fig)


# ── 3. Device-Wise Battery Stability ────────────────────────────────

def chart_device_stability(optimal: Dict, devices: List[Dict],
                           initial_state: List[float], params: Dict,
                           output_dir: str):
    """Heatmap showing battery levels across devices and time steps."""
    fig, ax = plt.subplots(figsize=(12, 5))

    steps = optimal["steps"]
    horizon = len(steps)
    num_devices = len(devices)

    # Build matrix
    matrix = np.zeros((num_devices, horizon + 1))
    for i in range(num_devices):
        matrix[i, 0] = initial_state[i]
        for t, step in enumerate(steps):
            matrix[i, t + 1] = step["state_after"][i]

    im = ax.imshow(matrix, cmap="RdYlGn", aspect="auto", vmin=0, vmax=100)
    cbar = fig.colorbar(im, ax=ax, shrink=0.8)
    cbar.set_label("Battery Level (%)", fontsize=11)

    # Labels
    ax.set_xticks(range(horizon + 1))
    ax.set_xticklabels([f"t={t}" for t in range(horizon + 1)])
    ax.set_yticks(range(num_devices))
    ax.set_yticklabels([d["name"] for d in devices])

    # Annotate cells
    for i in range(num_devices):
        for j in range(horizon + 1):
            val = matrix[i, j]
            color = "white" if val < 40 else "black"
            ax.text(j, i, f"{val:.0f}", ha="center", va="center",
                    fontsize=9, fontweight="bold", color=color)

    ax.set_title("Device Battery Stability Heatmap", fontsize=16,
                 fontweight="bold", pad=15)
    ax.set_xlabel("Time Step", fontsize=13, fontweight="bold")
    fig.tight_layout()
    fig.savefig(os.path.join(output_dir, "device_stability.png"), dpi=150,
                bbox_inches="tight")
    plt.close(fig)


# ── 4. Failure Risk Analysis ────────────────────────────────────────

def chart_failure_risk(optimal: Dict, devices: List[Dict],
                       params: Dict, output_dir: str):
    """Bar chart showing risk of battery depletion per device."""
    fig, ax = plt.subplots(figsize=(10, 6))

    steps = optimal["steps"]
    num_devices = len(devices)
    low_thresh = params.get("low_battery_threshold", 20)

    # Count steps where each device is below threshold
    risk_scores = []
    for i in range(num_devices):
        low_count = sum(1 for step in steps if step["state_after"][i] < low_thresh)
        depleted_count = sum(1 for step in steps if step["state_after"][i] <= 0)
        risk = (low_count * 0.5 + depleted_count * 1.0) / len(steps) * 100
        risk_scores.append(risk)

    colors_risk = []
    for r in risk_scores:
        if r == 0:
            colors_risk.append("#6bcb77")
        elif r < 30:
            colors_risk.append("#ffd93d")
        elif r < 60:
            colors_risk.append("#ff9f43")
        else:
            colors_risk.append("#ff6b6b")

    names = [d["name"] for d in devices]
    bars = ax.bar(names, risk_scores, color=colors_risk, edgecolor="none",
                  width=0.6, zorder=3)

    for bar, score in zip(bars, risk_scores):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1.5,
                f"{score:.0f}%", ha="center", fontsize=11, fontweight="bold")

    ax.set_ylabel("Risk Score (%)", fontsize=13, fontweight="bold")
    ax.set_title("Failure Risk Analysis by Device", fontsize=16,
                 fontweight="bold", pad=15)
    ax.set_ylim(0, max(risk_scores + [10]) * 1.3)
    ax.grid(True, axis="y", alpha=0.2)
    plt.xticks(rotation=15, ha="right")
    fig.tight_layout()
    fig.savefig(os.path.join(output_dir, "failure_risk.png"), dpi=150,
                bbox_inches="tight")
    plt.close(fig)


# ── 5. Cost Breakdown ───────────────────────────────────────────────

def chart_cost_breakdown(top_plans: List[Dict], output_dir: str):
    """Stacked bar chart showing cost, reward, penalty breakdown for top plans."""
    fig, ax = plt.subplots(figsize=(12, 6))

    n = min(len(top_plans), 10)
    plans = top_plans[:n]
    labels = [f"Plan {i+1}" for i in range(n)]
    x = np.arange(n)
    width = 0.25

    costs = [p["total_cost"] for p in plans]
    rewards = [p["total_reward"] for p in plans]
    penalties = [p["total_penalty"] for p in plans]

    ax.bar(x - width, rewards, width, label="Total Reward", color="#6bcb77",
           edgecolor="none", zorder=3)
    ax.bar(x, costs, width, label="Total Cost", color="#ffd93d",
           edgecolor="none", zorder=3)
    ax.bar(x + width, penalties, width, label="Total Penalty", color="#ff6b6b",
           edgecolor="none", zorder=3)

    ax.set_xlabel("Plan", fontsize=13, fontweight="bold")
    ax.set_ylabel("Value", fontsize=13, fontweight="bold")
    ax.set_title("Cost Breakdown — Top 10 Plans", fontsize=16,
                 fontweight="bold", pad=15)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, rotation=30, ha="right")
    ax.legend(framealpha=0.8, facecolor=CARD_COLOR, edgecolor=GRID_COLOR)
    ax.grid(True, axis="y", alpha=0.2)
    fig.tight_layout()
    fig.savefig(os.path.join(output_dir, "cost_breakdown.png"), dpi=150,
                bbox_inches="tight")
    plt.close(fig)


# ── 6. Charging Schedule Timeline ───────────────────────────────────

def chart_charging_schedule(optimal: Dict, devices: List[Dict],
                            output_dir: str):
    """Gantt-style chart showing which devices are charged at each step."""
    fig, ax = plt.subplots(figsize=(12, 5))

    steps = optimal["steps"]
    horizon = len(steps)
    num_devices = len(devices)

    for t, step in enumerate(steps):
        for idx in step["charging_devices"]:
            ax.barh(idx, 0.8, left=t + 0.1, height=0.6,
                    color=COLORS[idx % len(COLORS)], edgecolor="none",
                    alpha=0.9, zorder=3)
            ax.text(t + 0.5, idx, "⚡", ha="center", va="center",
                    fontsize=14, zorder=4)

    ax.set_yticks(range(num_devices))
    ax.set_yticklabels([d["name"] for d in devices])
    ax.set_xticks([t + 0.5 for t in range(horizon)])
    ax.set_xticklabels([f"Step {t+1}" for t in range(horizon)])
    ax.set_xlabel("Time Step", fontsize=13, fontweight="bold")
    ax.set_title("Optimal Charging Schedule", fontsize=16,
                 fontweight="bold", pad=15)
    ax.set_xlim(0, horizon + 0.2)
    ax.set_ylim(-0.5, num_devices - 0.5)
    ax.invert_yaxis()
    ax.grid(True, axis="x", alpha=0.2)
    fig.tight_layout()
    fig.savefig(os.path.join(output_dir, "charging_schedule.png"), dpi=150,
                bbox_inches="tight")
    plt.close(fig)


# ── State-Space Tree Visualization ──────────────────────────────────

def chart_state_tree(tree: Dict, devices: List[Dict], output_dir: str):
    """
    Render the state-space search tree as a graph image.
    For small horizons (2-3 steps) only.
    """
    try:
        fig, ax = plt.subplots(figsize=(20, 12))
        ax.set_xlim(0, 100)
        ax.set_ylim(0, 100)
        ax.axis("off")
        ax.set_title("State-Space Search Tree", fontsize=18,
                     fontweight="bold", pad=20)

        # Calculate layout
        _draw_tree(ax, tree, devices, x=50, y=95, width=90, depth=0, max_depth=2)

        fig.tight_layout()
        fig.savefig(os.path.join(output_dir, "state_tree.png"), dpi=150,
                    bbox_inches="tight")
        plt.close(fig)
        return "state_tree.png"
    except Exception:
        plt.close("all")
        return None


def _draw_tree(ax, node, devices, x, y, width, depth, max_depth):
    """Recursively draw tree nodes."""
    # Draw node
    state_str = ", ".join(f"{b:.0f}" for b in node["state"])
    bbox = dict(boxstyle="round,pad=0.4", facecolor=CARD_COLOR,
                edgecolor=COLORS[depth % len(COLORS)], linewidth=2)
    ax.text(x, y, f"({state_str})", ha="center", va="center",
            fontsize=7, bbox=bbox, zorder=5)

    if depth >= max_depth or not node.get("children"):
        return

    children = node["children"]
    n = len(children)
    child_width = width / max(n, 1)
    start_x = x - width / 2 + child_width / 2
    child_y = y - (80 / (max_depth + 1))

    for i, child in enumerate(children):
        cx = start_x + i * child_width
        # Draw edge
        ax.plot([x, cx], [y - 2, child_y + 2], color=GRID_COLOR,
                linewidth=0.8, zorder=2)
        # Action label
        action = child.get("action", "")
        mid_x = (x + cx) / 2
        mid_y = (y + child_y) / 2
        ax.text(mid_x, mid_y, action, ha="center", va="center",
                fontsize=5, color="#94a3b8", rotation=0, style="italic")

        _draw_tree(ax, child, devices, cx, child_y, child_width * 0.9,
                   depth + 1, max_depth)
