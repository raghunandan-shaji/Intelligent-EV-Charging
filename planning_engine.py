"""
Intelligent Multi-Device Energy Management System
Classical Planning (Forward State-Space Search) + Decision Networks

Scenario: EV Charging Station
Formulas from assignment PDF:
  - Battery Deficiency Cost at step t = Σ(100 - b_i)
  - Total Cost = Σ_t Σ_i (100 - b_i) + (Number of Switching Actions × s)
  - P(success) = p, P(failure) = 1 - p
  - EU = P(success) × Total Reward - P(failure) × Total Penalty - Total Cost
"""

from dataclasses import dataclass, field
from itertools import combinations
from typing import List, Tuple, Dict, Any
import copy


@dataclass
class Device:
    """Represents an EV at the charging station."""
    name: str
    priority: int          # 1 (low) to 5 (critical)
    battery: float         # Current battery level (0-100)
    consumption_rate: float  # Battery drain per step when NOT charging
    charge_rate: float     # Battery gain per step when charging


@dataclass
class PlanStep:
    """A single step in a charging plan."""
    charging_devices: Tuple[int, ...]  # Indices of devices being charged
    state_before: Tuple[float, ...]
    state_after: Tuple[float, ...]


@dataclass
class Plan:
    """A complete charging schedule over the planning horizon."""
    steps: List[PlanStep] = field(default_factory=list)
    total_cost: float = 0.0
    total_reward: float = 0.0
    total_penalty: float = 0.0
    expected_utility: float = 0.0
    switching_count: int = 0


# ── Default EV Charging Station Devices ──────────────────────────────

DEFAULT_DEVICES = [
    Device(name="Tesla Model S",     priority=5, battery=40, consumption_rate=15, charge_rate=25),
    Device(name="Nissan Leaf",       priority=4, battery=60, consumption_rate=10, charge_rate=20),
    Device(name="Chevy Bolt",        priority=4, battery=35, consumption_rate=12, charge_rate=20),
    Device(name="BMW i3",            priority=3, battery=80, consumption_rate=8,  charge_rate=18),
    Device(name="Hyundai Kona EV",   priority=1, battery=70, consumption_rate=5,  charge_rate=15),
]

DEFAULT_PARAMS = {
    "horizon": 5,
    "max_charging_slots": 2,
    "charge_success_prob": 0.9,
    "switching_penalty": 5,
    "priority_reward_multiplier": 10,
    "low_battery_threshold": 20,
    "low_battery_penalty": 50,
    "depletion_penalty": 100,
}


# ── State Transition ─────────────────────────────────────────────────

def transition(devices: List[Device], state: Tuple[float, ...],
               charging_indices: Tuple[int, ...]) -> Tuple[float, ...]:
    """
    Apply one time step: charging devices gain battery, others lose battery.
    Values are clamped to [0, 100].
    """
    new_state = list(state)
    for i, device in enumerate(devices):
        if i in charging_indices:
            new_state[i] = min(100.0, new_state[i] + device.charge_rate)
        else:
            new_state[i] = max(0.0, new_state[i] - device.consumption_rate)
    return tuple(new_state)


# ── Forward State-Space Search ───────────────────────────────────────

def get_all_charging_actions(num_devices: int,
                             max_slots: int) -> List[Tuple[int, ...]]:
    """
    Generate all valid subsets of devices that can be charged simultaneously.
    Includes charging 0 to max_slots devices.
    """
    actions = [()]  # no-charge action
    for r in range(1, max_slots + 1):
        actions.extend(combinations(range(num_devices), r))
    return actions


def forward_search(devices: List[Device],
                   initial_state: Tuple[float, ...],
                   horizon: int,
                   max_slots: int) -> List[Plan]:
    """
    Forward state-space search: exhaustively explore all possible
    charging schedules over the planning horizon.
    Returns a list of all generated Plans.
    """
    actions = get_all_charging_actions(len(devices), max_slots)
    all_plans: List[Plan] = []

    def _search(current_state: Tuple[float, ...], step: int,
                current_steps: List[PlanStep]):
        if step == horizon:
            plan = Plan(steps=list(current_steps))
            all_plans.append(plan)
            return

        for action in actions:
            new_state = transition(devices, current_state, action)
            plan_step = PlanStep(
                charging_devices=action,
                state_before=current_state,
                state_after=new_state,
            )
            current_steps.append(plan_step)
            _search(new_state, step + 1, current_steps)
            current_steps.pop()

    _search(initial_state, 0, [])
    return all_plans


# ── Counting Switching Actions ───────────────────────────────────────

def count_switches(plan: Plan) -> int:
    """
    Count the number of times a charging decision changes between
    consecutive steps (i.e., the set of devices being charged differs).
    """
    switches = 0
    for i in range(1, len(plan.steps)):
        if set(plan.steps[i].charging_devices) != set(plan.steps[i - 1].charging_devices):
            switches += 1
    return switches


# ── Cost & Utility Calculation (exact PDF formulas) ──────────────────

def compute_plan_metrics(plan: Plan, devices: List[Device],
                         params: Dict[str, Any]) -> Plan:
    """
    Compute Total Cost, Total Reward, Total Penalty, and Expected Utility
    for a plan using the exact formulas from the assignment PDF.

    Battery Deficiency Cost at step t = Σ_i (100 - b_i)
    Total Cost = Σ_t Σ_i (100 - b_i) + (Number of Switching Actions × s)
    EU = P(success) × Total Reward - P(failure) × Total Penalty - Total Cost
    """
    p = params["charge_success_prob"]
    s = params["switching_penalty"]
    priority_mult = params["priority_reward_multiplier"]
    low_thresh = params["low_battery_threshold"]
    low_pen = params["low_battery_penalty"]
    depl_pen = params["depletion_penalty"]

    # ── Total Cost (from PDF) ──
    # Battery Deficiency Cost = Σ_t Σ_i (100 - b_i) using state_after each step
    battery_deficiency_cost = 0.0
    for step in plan.steps:
        for b in step.state_after:
            battery_deficiency_cost += (100.0 - b)

    switching_count = count_switches(plan)
    total_cost = battery_deficiency_cost + (switching_count * s)

    # ── Total Reward ──
    # Higher rewards for maintaining high-priority devices above safe thresholds
    total_reward = 0.0
    for step in plan.steps:
        for i, b in enumerate(step.state_after):
            if b >= low_thresh:
                total_reward += devices[i].priority * priority_mult

    # ── Total Penalty ──
    # Penalties for low battery and depletion
    total_penalty = 0.0
    for step in plan.steps:
        for i, b in enumerate(step.state_after):
            if b <= 0:
                total_penalty += depl_pen * devices[i].priority
            elif b < low_thresh:
                total_penalty += low_pen * devices[i].priority

    # ── Expected Utility (from PDF) ──
    # P(success) = p^H, P(failure) = 1 - P(success)
    # EU = P(success) × Total Reward - P(failure) × Total Penalty - Total Cost
    horizon = len(plan.steps)
    p_success = p ** horizon
    p_failure = 1 - p_success
    expected_utility = (p_success * total_reward) - (p_failure * total_penalty) - total_cost

    plan.total_cost = total_cost
    plan.total_reward = total_reward
    plan.total_penalty = total_penalty
    plan.expected_utility = expected_utility
    plan.switching_count = switching_count
    return plan


# ── Optimal Plan Selection ───────────────────────────────────────────

def find_optimal_plan(devices: List[Device],
                      params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run forward search, evaluate all plans, and return the optimal one
    along with summary statistics.
    """
    initial_state = tuple(d.battery for d in devices)
    horizon = params["horizon"]
    max_slots = params["max_charging_slots"]

    # Generate all plans
    all_plans = forward_search(devices, initial_state, horizon, max_slots)

    # Evaluate each plan
    for plan in all_plans:
        compute_plan_metrics(plan, devices, params)

    # Sort by Expected Utility (descending)
    all_plans.sort(key=lambda p: p.expected_utility, reverse=True)

    optimal = all_plans[0]

    # Build result summary
    result = {
        "total_plans": len(all_plans),
        "optimal_plan": _plan_to_dict(optimal, devices),
        "top_plans": [_plan_to_dict(p, devices) for p in all_plans[:10]],
        "worst_plan": _plan_to_dict(all_plans[-1], devices),
        "all_plans": all_plans,  # kept for visualization (not serialized)
        "devices": [_device_to_dict(d) for d in devices],
        "params": params,
        "initial_state": list(initial_state),
    }
    return result


# ── Serialization Helpers ────────────────────────────────────────────

def _plan_to_dict(plan: Plan, devices: List[Device]) -> Dict[str, Any]:
    steps = []
    for i, step in enumerate(plan.steps):
        charging_names = [devices[idx].name for idx in step.charging_devices]
        steps.append({
            "step": i + 1,
            "charging_devices": list(step.charging_devices),
            "charging_names": charging_names,
            "state_before": [round(b, 2) for b in step.state_before],
            "state_after": [round(b, 2) for b in step.state_after],
        })
    return {
        "steps": steps,
        "total_cost": round(plan.total_cost, 2),
        "total_reward": round(plan.total_reward, 2),
        "total_penalty": round(plan.total_penalty, 2),
        "expected_utility": round(plan.expected_utility, 2),
        "switching_count": plan.switching_count,
    }


def _device_to_dict(device: Device) -> Dict[str, Any]:
    return {
        "name": device.name,
        "priority": device.priority,
        "battery": device.battery,
        "consumption_rate": device.consumption_rate,
        "charge_rate": device.charge_rate,
    }


# ── State-Space Tree (small horizon for visualization) ───────────────

def build_state_tree(devices: List[Device],
                     initial_state: Tuple[float, ...],
                     horizon: int,
                     max_slots: int) -> Dict[str, Any]:
    """
    Build a tree structure for visualization (limited to small horizon like 2-3).
    Each node has state, children with action labels.
    """
    actions = get_all_charging_actions(len(devices), max_slots)

    def _build(state: Tuple[float, ...], depth: int) -> Dict[str, Any]:
        node = {
            "state": [round(b, 1) for b in state],
            "children": [],
        }
        if depth >= horizon:
            return node

        for action in actions:
            new_state = transition(devices, state, action)
            action_label = ", ".join(devices[i].name for i in action) if action else "No Charge"
            child = _build(new_state, depth + 1)
            child["action"] = action_label
            node["children"].append(child)

        return node

    return _build(initial_state, 0)
