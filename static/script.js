/* ═══════════════════════════════════════════════════════
   EV Charging Station — Energy Management System
   Frontend Logic
   ═══════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────
let currentDevices = [];
let currentResult = null;

const PRIORITY_LABELS = {
    5: "Critical",
    4: "High",
    3: "Medium",
    2: "Low",
    1: "Minimal",
};

const DEVICE_ICONS = ["🚗", "🚙", "🚕", "🏎️", "🚐"];

const VIZ_META = {
    "battery_evolution.png": {
        title: "Battery Evolution Over Time",
        desc: "Battery levels of all EVs across planning horizon under the optimal schedule",
    },
    "charging_schedule.png": {
        title: "Optimal Charging Schedule",
        desc: "Gantt-style timeline showing which EVs are charged at each step",
    },
    "eu_comparison.png": {
        title: "Expected Utility Comparison",
        desc: "Comparing Expected Utility across the top 10 generated plans",
    },
    "device_stability.png": {
        title: "Device Battery Stability Heatmap",
        desc: "Battery levels across devices and time steps visualized as a heatmap",
    },
    "cost_breakdown.png": {
        title: "Cost Breakdown Analysis",
        desc: "Reward, Cost, and Penalty breakdown for the top plans",
    },
    "failure_risk.png": {
        title: "Failure Risk Analysis",
        desc: "Risk of battery depletion per EV based on the optimal plan",
    },
    "state_tree.png": {
        title: "State-Space Search Tree",
        desc: "Tree representation of the forward state-space search (limited depth)",
    },
};

// ── Init ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    loadDefaults();
    setupSliders();
    setupScrollReveal();
});

// ── Load Defaults ────────────────────────────────────────
async function loadDefaults() {
    try {
        const resp = await fetch("/api/defaults");
        const data = await resp.json();
        currentDevices = data.devices;
        renderDeviceCards(currentDevices);
    } catch (e) {
        console.error("Failed to load defaults:", e);
        // Fallback defaults
        currentDevices = [
            { name: "Tesla Model S", priority: 5, battery: 40, consumption_rate: 15, charge_rate: 25 },
            { name: "Nissan Leaf", priority: 4, battery: 60, consumption_rate: 10, charge_rate: 20 },
            { name: "Chevy Bolt", priority: 4, battery: 35, consumption_rate: 12, charge_rate: 20 },
            { name: "BMW i3", priority: 3, battery: 80, consumption_rate: 8, charge_rate: 18 },
            { name: "Hyundai Kona EV", priority: 1, battery: 70, consumption_rate: 5, charge_rate: 15 },
        ];
        renderDeviceCards(currentDevices);
    }
}

// ── Render Device Cards ──────────────────────────────────
function renderDeviceCards(devices) {
    const grid = document.getElementById("deviceGrid");
    grid.innerHTML = "";

    devices.forEach((d, i) => {
        const batteryColor = getBatteryColor(d.battery);
        const card = document.createElement("div");
        card.className = `device-card reveal-delay-${i + 1}`;
        card.dataset.priority = d.priority;
        card.innerHTML = `
            <div class="device-header">
                <span class="device-name">${DEVICE_ICONS[i % DEVICE_ICONS.length]} ${d.name}</span>
                <span class="device-priority priority-${d.priority}">${PRIORITY_LABELS[d.priority]}</span>
            </div>
            <div class="device-battery">
                <div class="battery-label">
                    <span>Battery Level</span>
                    <span style="color:${batteryColor}; font-weight:700; font-family:var(--font-mono);">${d.battery}%</span>
                </div>
                <div class="battery-bar-bg">
                    <div class="battery-bar-fill" style="width:${d.battery}%; background:${batteryColor};"></div>
                </div>
            </div>
            <div class="device-inputs-grid">
                <div class="device-input-group">
                    <label class="device-input-label">Battery (%)</label>
                    <input class="device-input" type="number" min="0" max="100" value="${d.battery}" 
                           onchange="updateDevice(${i},'battery',this.value)">
                </div>
                <div class="device-input-group">
                    <label class="device-input-label">Priority (1-5)</label>
                    <input class="device-input" type="number" min="1" max="5" value="${d.priority}"
                           onchange="updateDevice(${i},'priority',this.value)">
                </div>
                <div class="device-input-group">
                    <label class="device-input-label">Consumption/step</label>
                    <input class="device-input" type="number" min="0" max="50" value="${d.consumption_rate}"
                           onchange="updateDevice(${i},'consumption_rate',this.value)">
                </div>
                <div class="device-input-group">
                    <label class="device-input-label">Charge Rate/step</label>
                    <input class="device-input" type="number" min="0" max="50" value="${d.charge_rate}"
                           onchange="updateDevice(${i},'charge_rate',this.value)">
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    // Trigger reveal for new cards
    setTimeout(() => {
        grid.querySelectorAll(".device-card").forEach((c) => c.classList.add("visible"));
    }, 100);
}

function updateDevice(index, field, value) {
    currentDevices[index][field] = parseFloat(value);
    if (field === "battery" || field === "priority") {
        renderDeviceCards(currentDevices);
    }
}

function getBatteryColor(level) {
    if (level <= 20) return "#ff6b6b";
    if (level <= 40) return "#ff9f43";
    if (level <= 60) return "#ffd93d";
    if (level <= 80) return "#6bcb77";
    return "#00d2ff";
}

// ── Slider Setup ─────────────────────────────────────────
function setupSliders() {
    const sliders = [
        { id: "paramHorizon", valId: "paramHorizonVal", format: (v) => v },
        { id: "paramSlots", valId: "paramSlotsVal", format: (v) => v },
        { id: "paramProb", valId: "paramProbVal", format: (v) => (v / 100).toFixed(2) },
        { id: "paramSwitch", valId: "paramSwitchVal", format: (v) => v },
    ];

    sliders.forEach(({ id, valId, format }) => {
        const slider = document.getElementById(id);
        const label = document.getElementById(valId);
        if (slider && label) {
            slider.addEventListener("input", () => {
                label.textContent = format(slider.value);
            });
        }
    });
}

// ── Run Planning ─────────────────────────────────────────
async function runPlanning() {
    const btn = document.getElementById("runBtn");
    const hint = document.getElementById("runHint");

    // Loading state
    btn.classList.add("loading");
    btn.disabled = true;
    hint.textContent = "Generating all possible plans and computing Expected Utility...";

    const payload = {
        devices: currentDevices,
        horizon: parseInt(document.getElementById("paramHorizon").value),
        max_charging_slots: parseInt(document.getElementById("paramSlots").value),
        charge_success_prob: parseInt(document.getElementById("paramProb").value) / 100,
        switching_penalty: parseInt(document.getElementById("paramSwitch").value),
    };

    try {
        const resp = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!resp.ok) throw new Error(`Server error: ${resp.status}`);

        currentResult = await resp.json();

        // Render results
        renderSummary(currentResult);
        renderPlanDetails(currentResult);
        renderVisualizations(currentResult);
        renderAnalysis(currentResult);

        // Show sections with animation
        ["resultsSection", "vizSection", "analysisSection"].forEach((id) => {
            const sec = document.getElementById(id);
            sec.style.display = "";
            // Re-trigger reveals in this section
            setTimeout(() => {
                sec.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"));
            }, 100);
        });

        // Scroll to results
        document.getElementById("resultsSection").scrollIntoView({ behavior: "smooth" });

        hint.textContent = `✅ Generated ${currentResult.total_plans.toLocaleString()} plans — optimal plan found!`;
    } catch (err) {
        console.error("Planning failed:", err);
        hint.textContent = `❌ Error: ${err.message}`;
    } finally {
        btn.classList.remove("loading");
        btn.disabled = false;
    }
}

// ── Render Summary Cards ─────────────────────────────────
function renderSummary(result) {
    const grid = document.getElementById("summaryGrid");
    const opt = result.optimal_plan;

    const cards = [
        { icon: "📋", value: result.total_plans.toLocaleString(), label: "Total Plans", cls: "value-neutral" },
        { icon: "🎯", value: opt.expected_utility.toFixed(1), label: "Expected Utility", cls: opt.expected_utility >= 0 ? "value-positive" : "value-negative" },
        { icon: "💰", value: opt.total_cost.toFixed(1), label: "Total Cost", cls: "value-warning" },
        { icon: "🏆", value: opt.total_reward.toFixed(1), label: "Total Reward", cls: "value-positive" },
        { icon: "⚠️", value: opt.total_penalty.toFixed(1), label: "Total Penalty", cls: "value-negative" },
        { icon: "🔄", value: opt.switching_count, label: "Switches", cls: "value-neutral" },
    ];

    grid.innerHTML = cards
        .map(
            (c) => `
        <div class="summary-card">
            <div class="summary-card-icon">${c.icon}</div>
            <div class="summary-card-value ${c.cls}">${c.value}</div>
            <div class="summary-card-label">${c.label}</div>
        </div>
    `
        )
        .join("");
}

// ── Render Plan Details Table ────────────────────────────
function renderPlanDetails(result) {
    const div = document.getElementById("planDetails");
    const opt = result.optimal_plan;
    const devices = result.devices;

    let tableHTML = `
        <h3>⚡ Step-by-Step Optimal Schedule</h3>
        <table class="plan-table">
            <thead>
                <tr>
                    <th>Step</th>
                    <th>Charging EVs</th>
                    ${devices.map((d) => `<th>${d.name}</th>`).join("")}
                </tr>
            </thead>
            <tbody>
    `;

    opt.steps.forEach((step) => {
        const chargingBadges = step.charging_names.length
            ? step.charging_names.map((n) => `<span class="charging-badge">⚡ ${n}</span>`).join(" ")
            : '<span style="color:var(--text-muted)">None</span>';

        const batteryCells = step.state_after
            .map((b, i) => {
                const color = getBatteryColor(b);
                const arrow = step.charging_devices.includes(i) ? "↑" : "↓";
                return `<td class="battery-cell"><span style="color:${color}">${b.toFixed(0)}%</span> <span style="opacity:0.5">${arrow}</span></td>`;
            })
            .join("");

        tableHTML += `
            <tr>
                <td><strong>Step ${step.step}</strong></td>
                <td>${chargingBadges}</td>
                ${batteryCells}
            </tr>
        `;
    });

    tableHTML += `</tbody></table>`;
    div.innerHTML = tableHTML;
}

// ── Render Visualizations ────────────────────────────────
function renderVisualizations(result) {
    const grid = document.getElementById("vizGrid");
    const timestamp = Date.now(); // cache-bust

    grid.innerHTML = result.chart_files
        .map((file) => {
            const meta = VIZ_META[file] || { title: file, desc: "" };
            return `
            <div class="viz-card reveal">
                <div class="viz-card-header">
                    <div class="viz-card-title">${meta.title}</div>
                    <div class="viz-card-desc">${meta.desc}</div>
                </div>
                <img src="/charts/${file}?t=${timestamp}" alt="${meta.title}" loading="lazy">
            </div>
        `;
        })
        .join("");

    // Trigger reveals
    setTimeout(() => {
        grid.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"));
    }, 200);
}

// ── Render Analysis ──────────────────────────────────────
function renderAnalysis(result) {
    const div = document.getElementById("analysisContent");
    const opt = result.optimal_plan;
    const worst = result.worst_plan;
    const devices = result.devices;
    const params = result.params;

    // Find which devices are charged most often
    const chargeCount = {};
    devices.forEach((d) => (chargeCount[d.name] = 0));
    opt.steps.forEach((step) => {
        step.charging_names.forEach((n) => chargeCount[n]++);
    });
    const mostCharged = Object.entries(chargeCount).sort((a, b) => b[1] - a[1]);

    // Check final battery levels
    const finalState = opt.steps[opt.steps.length - 1].state_after;
    const criticalDevices = devices.filter((d, i) => finalState[i] < 20);

    div.innerHTML = `
        <div class="analysis-card">
            <div class="analysis-card-icon">🎯</div>
            <h4>Optimal Plan Selection</h4>
            <p>Out of <strong>${result.total_plans.toLocaleString()}</strong> possible charging schedules, 
               the optimal plan achieves an Expected Utility of 
               <strong style="color:var(--accent-cyan)">${opt.expected_utility.toFixed(2)}</strong>.</p>
            <ul>
                <li>The worst plan had EU = ${worst.expected_utility.toFixed(2)}, a difference of 
                    ${(opt.expected_utility - worst.expected_utility).toFixed(2)}</li>
                <li>Charging success probability: ${(params.charge_success_prob * 100).toFixed(0)}%</li>
                <li>Switching penalty applied: ${params.switching_penalty} per switch (${opt.switching_count} switches)</li>
            </ul>
        </div>

        <div class="analysis-card">
            <div class="analysis-card-icon">⚡</div>
            <h4>Charging Priority Analysis</h4>
            <p>The planning engine correctly prioritizes high-priority EVs while balancing overall fleet health.</p>
            <ul>
                ${mostCharged.map(([name, count]) => {
                    const dev = devices.find((d) => d.name === name);
                    return `<li>${name} (Priority ${dev.priority}): Charged in ${count}/${opt.steps.length} steps</li>`;
                }).join("")}
            </ul>
        </div>

        <div class="analysis-card">
            <div class="analysis-card-icon">🔋</div>
            <h4>Final Battery State</h4>
            <p>Battery levels at the end of the planning horizon:</p>
            <ul>
                ${devices.map((d, i) => {
                    const level = finalState[i].toFixed(0);
                    const status = finalState[i] <= 0 ? "🔴 DEPLETED" : finalState[i] < 20 ? "🟡 LOW" : "🟢 OK";
                    return `<li>${d.name}: ${level}% — ${status}</li>`;
                }).join("")}
            </ul>
        </div>

        <div class="analysis-card">
            <div class="analysis-card-icon">📊</div>
            <h4>Cost Analysis</h4>
            <p>Breakdown of the objective function components:</p>
            <ul>
                <li>Battery Deficiency Cost: integrated over all steps and devices via Σₜ Σᵢ (100 − bᵢ)</li>
                <li>Switching Penalty: ${opt.switching_count} × ${params.switching_penalty} = ${(opt.switching_count * params.switching_penalty).toFixed(0)}</li>
                <li>Total Cost: ${opt.total_cost.toFixed(2)}</li>
                <li>P(success) × Reward = ${(params.charge_success_prob * opt.total_reward).toFixed(2)}</li>
                <li>P(failure) × Penalty = ${((1 - params.charge_success_prob) * opt.total_penalty).toFixed(2)}</li>
            </ul>
        </div>

        <div class="analysis-card">
            <div class="analysis-card-icon">⚙️</div>
            <h4>Decision Network</h4>
            <p>The decision network models uncertainty in the charging process:</p>
            <ul>
                <li>Chance node: Charging succeeds with P = ${params.charge_success_prob}, fails with P = ${(1 - params.charge_success_prob).toFixed(2)}</li>
                <li>Decision node: Which subset of EVs to charge at each step</li>
                <li>Utility node: EU = P(s)×Reward − P(f)×Penalty − Cost</li>
                <li>Higher priority devices receive proportionally larger rewards and penalties</li>
            </ul>
        </div>

        <div class="analysis-card">
            <div class="analysis-card-icon">🚀</div>
            <h4>Observations & Future Scope</h4>
            <p>Key insights and potential improvements:</p>
            <ul>
                <li>Forward search explores all combinations exhaustively — optimal for small horizons</li>
                <li>For larger horizons, heuristic pruning or A* search could improve scalability</li>
                <li>Real-world extension: dynamic pricing, renewable energy integration, V2G (vehicle-to-grid)</li>
                <li>Could incorporate real-time demand prediction using ML models</li>
                <li>Multi-objective optimization for cost vs. sustainability trade-offs</li>
            </ul>
        </div>
    `;
}

// ── Scroll Reveal (IntersectionObserver) ─────────────────
function setupScrollReveal() {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                }
            });
        },
        { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

    // Re-observe on DOM changes (for dynamically added elements)
    const mutObs = new MutationObserver(() => {
        document.querySelectorAll(".reveal:not(.visible)").forEach((el) => observer.observe(el));
    });
    mutObs.observe(document.body, { childList: true, subtree: true });
}
