/* ============================================================
   EV Charging Station — Single Window Simulation Controller

   All innerHTML usage in this file sets content derived from
   our own trusted API responses (device names, numeric values),
   not from untrusted user input. No XSS risk.
   ============================================================ */

// -- State ----------------------------------------------------
let devices = [];
let result = null;
let currentStep = 0;
let totalSteps = 0;
let isPlaying = false;
let playTimer = null;
const PLAY_INTERVAL = 1200; // ms per step

const PRIORITY_LABELS = { 5: 'CRIT', 4: 'HIGH', 3: 'MED', 2: 'LOW', 1: 'MIN' };

// -- Init -----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('app').classList.add('mode-config');
    loadDefaults();
});

// -- Load Defaults --------------------------------------------
async function loadDefaults() {
    try {
        const resp = await fetch('/api/defaults');
        const data = await resp.json();
        devices = data.devices;
    } catch (e) {
        devices = [
            { name: 'Tesla Model S', priority: 5, battery: 40, consumption_rate: 15, charge_rate: 25 },
            { name: 'Nissan Leaf', priority: 4, battery: 60, consumption_rate: 10, charge_rate: 20 },
            { name: 'Chevy Bolt', priority: 4, battery: 35, consumption_rate: 12, charge_rate: 20 },
            { name: 'BMW i3', priority: 3, battery: 80, consumption_rate: 8, charge_rate: 18 },
            { name: 'Hyundai Kona EV', priority: 1, battery: 70, consumption_rate: 5, charge_rate: 15 },
        ];
    }
    renderConfigLeft();
    renderConfigParams();
}

// -- Render Config: Device Inputs -----------------------------
function renderConfigLeft() {
    const container = document.getElementById('deviceInputs');
    container.textContent = '';
    devices.forEach((d, i) => {
        const row = document.createElement('div');
        row.className = 'device-input-row';

        // Header
        const header = document.createElement('div');
        header.className = 'device-row-header';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'device-row-name';
        nameSpan.title = d.name;
        nameSpan.textContent = d.name;
        const priSpan = document.createElement('span');
        priSpan.className = 'device-row-priority pri-' + d.priority;
        priSpan.textContent = PRIORITY_LABELS[d.priority];
        header.appendChild(nameSpan);
        header.appendChild(priSpan);
        row.appendChild(header);

        // Fields grid
        const fields = document.createElement('div');
        fields.className = 'device-fields';

        const fieldDefs = [
            { label: 'Battery%', field: 'battery', type: 'number', value: d.battery, cls: '', min: 0, max: 100 },
            { label: 'Priority', field: 'priority', type: 'number', value: d.priority, cls: '', min: 1, max: 5 },
            { label: 'Drain/step', field: 'consumption_rate', type: 'number', value: d.consumption_rate, cls: '', min: 0, max: 50 },
            { label: 'Charge/step', field: 'charge_rate', type: 'number', value: d.charge_rate, cls: '', min: 0, max: 50 },
        ];

        fieldDefs.forEach(fd => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'device-field' + (fd.cls ? ' ' + fd.cls : '');
            const lbl = document.createElement('label');
            lbl.textContent = fd.label;
            const inp = document.createElement('input');
            inp.type = fd.type;
            inp.value = fd.value;
            inp.dataset.idx = i;
            inp.dataset.field = fd.field;
            if (fd.min !== null) inp.min = fd.min;
            if (fd.max !== null) inp.max = fd.max;
            fieldDiv.appendChild(lbl);
            fieldDiv.appendChild(inp);
            fields.appendChild(fieldDiv);
        });

        row.appendChild(fields);
        container.appendChild(row);
    });

    // Attach change listeners
    container.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const field = e.target.dataset.field;
            if (field === 'name') {
                devices[idx][field] = e.target.value;
            } else {
                devices[idx][field] = parseFloat(e.target.value);
            }
            const row = e.target.closest('.device-input-row');
            const nameEl = row.querySelector('.device-row-name');
            const priEl = row.querySelector('.device-row-priority');
            nameEl.textContent = devices[idx].name;
            nameEl.title = devices[idx].name;
            priEl.textContent = PRIORITY_LABELS[devices[idx].priority] || 'P' + devices[idx].priority;
            priEl.className = 'device-row-priority pri-' + devices[idx].priority;
        });
    });
}

// -- Render Config: Parameters --------------------------------
function renderConfigParams() {
    const container = document.getElementById('paramInputs');
    const params = [
        { id: 'horizon', label: 'Horizon', min: 2, max: 8, value: 5, step: 1, fmt: v => String(v) },
        { id: 'slots', label: 'Max Slots', min: 1, max: 4, value: 2, step: 1, fmt: v => String(v) },
        { id: 'prob', label: 'Success P', min: 70, max: 100, value: 90, step: 1, fmt: v => (v / 100).toFixed(2) },
        { id: 'penalty', label: 'Switch Pen.', min: 0, max: 20, value: 5, step: 1, fmt: v => String(v) },
    ];

    container.textContent = '';
    params.forEach(p => {
        const row = document.createElement('div');
        row.className = 'param-row';

        const lbl = document.createElement('span');
        lbl.className = 'param-label';
        lbl.textContent = p.label;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'param-slider';
        slider.id = 'param-' + p.id;
        slider.min = p.min;
        slider.max = p.max;
        slider.value = p.value;
        slider.step = p.step;

        const valSpan = document.createElement('span');
        valSpan.className = 'param-val';
        valSpan.id = 'paramVal-' + p.id;
        valSpan.textContent = p.fmt(p.value);

        slider.addEventListener('input', () => {
            valSpan.textContent = p.fmt(parseFloat(slider.value));
        });

        row.appendChild(lbl);
        row.appendChild(slider);
        row.appendChild(valSpan);
        container.appendChild(row);
    });
}

// -- Run Planning Engine --------------------------------------
async function runPlanning() {
    const btn = document.getElementById('runBtn');
    btn.classList.add('loading');
    btn.disabled = true;

    const payload = {
        devices: devices,
        horizon: parseInt(document.getElementById('param-horizon').value),
        max_charging_slots: parseInt(document.getElementById('param-slots').value),
        charge_success_prob: parseInt(document.getElementById('param-prob').value) / 100,
        switching_penalty: parseInt(document.getElementById('param-penalty').value),
    };

    try {
        const resp = await fetch('/api/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!resp.ok) throw new Error('Server error: ' + resp.status);
        result = await resp.json();
        totalSteps = result.optimal_plan.steps.length;
        currentStep = 0;
        enterSimMode();
    } catch (err) {
        console.error('Planning failed:', err);
        alert('Planning failed: ' + err.message);
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

// -- Enter Simulation Mode ------------------------------------
function enterSimMode() {
    const app = document.getElementById('app');
    app.classList.remove('mode-config');
    app.classList.add('mode-sim');

    document.getElementById('modeTag').textContent = 'SIMULATION';
    document.getElementById('statPlans').textContent = result.total_plans.toLocaleString();
    document.getElementById('statEU').textContent = result.optimal_plan.expected_utility.toFixed(1);

    document.getElementById('simLeft').style.display = '';
    document.getElementById('simCenter').style.display = '';
    document.getElementById('simRight').style.display = '';
    document.getElementById('bottomSim').style.display = '';

    document.getElementById('configLeft').style.display = 'none';
    document.getElementById('configCenter').style.display = 'none';
    document.getElementById('configRight').style.display = 'none';
    document.getElementById('bottomConfig').style.display = 'none';

    buildBatteryViz();
    buildStateTree();
    renderStep(0);

    setTimeout(() => togglePlay(), 500);
}

// -- Reset to Config Mode -------------------------------------
function resetToConfig() {
    stopPlay();
    result = null;
    currentStep = 0;
    totalSteps = 0;

    const app = document.getElementById('app');
    app.classList.remove('mode-sim');
    app.classList.add('mode-config');

    document.getElementById('modeTag').textContent = 'CONFIGURE';
    const stepInd = document.getElementById('stepIndicator');
    stepInd.textContent = '';
    const stepLabel = document.createElement('span');
    stepLabel.className = 'step-label';
    stepLabel.textContent = 'CONFIG';
    stepInd.appendChild(stepLabel);

    document.getElementById('simLeft').style.display = 'none';
    document.getElementById('simCenter').style.display = 'none';
    document.getElementById('simRight').style.display = 'none';
    document.getElementById('bottomSim').style.display = 'none';

    document.getElementById('configLeft').style.display = '';
    document.getElementById('configCenter').style.display = '';
    document.getElementById('configRight').style.display = '';
    document.getElementById('bottomConfig').style.display = '';
}

// -- Build Battery Visualization (center) ---------------------
function buildBatteryViz() {
    const container = document.getElementById('batteryViz');
    container.textContent = '';
    result.devices.forEach((d, i) => {
        const group = document.createElement('div');
        group.className = 'viz-bar-group';

        const pctEl = document.createElement('div');
        pctEl.className = 'viz-bar-pct';
        pctEl.id = 'vizPct-' + i;
        pctEl.textContent = '0%';

        const barContainer = document.createElement('div');
        barContainer.className = 'viz-bar-container';
        const barFill = document.createElement('div');
        barFill.className = 'viz-bar-fill';
        barFill.id = 'vizFill-' + i;
        barContainer.appendChild(barFill);

        const nameEl = document.createElement('div');
        nameEl.className = 'viz-bar-name';
        nameEl.id = 'vizName-' + i;
        nameEl.textContent = shortName(d.name);

        group.appendChild(pctEl);
        group.appendChild(barContainer);
        group.appendChild(nameEl);
        container.appendChild(group);
    });
}

// -- Build State Tree (right panel) ---------------------------
function buildStateTree() {
    const container = document.getElementById('stateTree');
    if (!result || !result.optimal_plan || result.optimal_plan.steps.length < 1) {
        container.textContent = 'No tree data';
        return;
    }

    const steps = result.optimal_plan.steps;
    const initialState = result.initial_state;
    const devs = result.devices;
    const step1 = steps[0];
    const numDevices = devs.length;

    const alternatives = generateAlternatives(numDevices, result.params.max_charging_slots, step1.charging_devices);

    container.textContent = '';
    const treeEl = document.createElement('div');
    treeEl.className = 'state-tree-container';

    // Root node
    const rootNode = document.createElement('div');
    rootNode.className = 'tree-node';
    const rootBox = document.createElement('div');
    rootBox.className = 'tree-node-box active';
    rootBox.id = 'treeRoot';
    rootBox.textContent = formatState(initialState);
    rootNode.appendChild(rootBox);

    const rootConn = document.createElement('div');
    rootConn.className = 'tree-connector active-conn';
    rootNode.appendChild(rootConn);

    // Children row
    const childrenRow = document.createElement('div');
    childrenRow.className = 'tree-children';

    // Optimal branch
    const optBranch = document.createElement('div');
    optBranch.className = 'tree-branch';

    const edge0 = document.createElement('div');
    edge0.className = 'tree-edge-label active-edge';
    edge0.id = 'treeEdge0';
    edge0.textContent = truncEdge(step1.charging_names.map(n => shortName(n)).join(', ') || 'None');
    optBranch.appendChild(edge0);

    const node0 = document.createElement('div');
    node0.className = 'tree-node-box active';
    node0.id = 'treeNode0';
    node0.textContent = formatState(step1.state_after);
    optBranch.appendChild(node0);

    // Depth 2
    if (steps.length >= 2) {
        const step2 = steps[1];
        const conn1 = document.createElement('div');
        conn1.className = 'tree-connector active-conn';
        optBranch.appendChild(conn1);

        const edge1 = document.createElement('div');
        edge1.className = 'tree-edge-label active-edge';
        edge1.id = 'treeEdge1';
        edge1.style.fontSize = '6px';
        edge1.textContent = truncEdge(step2.charging_names.map(n => shortName(n)).join(', ') || 'None');
        optBranch.appendChild(edge1);

        const node1 = document.createElement('div');
        node1.className = 'tree-node-box active';
        node1.id = 'treeNode1';
        node1.textContent = formatState(step2.state_after);
        optBranch.appendChild(node1);
    }

    childrenRow.appendChild(optBranch);

    // Alternative branches
    alternatives.slice(0, 2).forEach((alt) => {
        const altState = simulateStep(initialState, alt, devs);
        const altNames = alt.map(idx => shortName(devs[idx].name)).join(', ') || 'None';

        const branch = document.createElement('div');
        branch.className = 'tree-branch';

        const edgeLabel = document.createElement('div');
        edgeLabel.className = 'tree-edge-label';
        edgeLabel.textContent = altNames;
        branch.appendChild(edgeLabel);

        const nodeBox = document.createElement('div');
        nodeBox.className = 'tree-node-box';
        nodeBox.textContent = formatState(altState);
        branch.appendChild(nodeBox);

        childrenRow.appendChild(branch);
    });

    rootNode.appendChild(childrenRow);
    treeEl.appendChild(rootNode);
    container.appendChild(treeEl);
}

// -- Render a Specific Step -----------------------------------
function renderStep(stepIdx) {
    currentStep = stepIdx;
    const steps = result.optimal_plan.steps;
    const devs = result.devices;
    const params = result.params;

    const step = steps[stepIdx];
    const stateAfter = step.state_after;
    const chargingSet = new Set(step.charging_devices);

    // Update top bar step indicator
    const stepInd = document.getElementById('stepIndicator');
    stepInd.textContent = '';
    const sl = document.createElement('span');
    sl.className = 'step-label';
    sl.textContent = 'STEP ' + step.step + ' / ' + totalSteps;
    stepInd.appendChild(sl);

    document.getElementById('statStep').textContent = step.step + '/' + totalSteps;
    document.getElementById('centerStepBadge').textContent = 'Step ' + step.step;

    // Left panel: battery bars
    renderBatteryBars(devs, stateAfter, chargingSet);

    // Left panel: decision network
    renderDecisionNetwork(step, params);

    // Center: animated bars
    devs.forEach((d, i) => {
        const pct = Math.max(0, Math.min(100, stateAfter[i]));
        const fill = document.getElementById('vizFill-' + i);
        const pctEl = document.getElementById('vizPct-' + i);
        const nameEl = document.getElementById('vizName-' + i);

        if (fill) {
            fill.style.height = pct + '%';
            fill.style.backgroundColor = batteryColor(pct);
            if (chargingSet.has(i)) {
                fill.classList.add('charging');
            } else {
                fill.classList.remove('charging');
            }
        }
        if (pctEl) {
            const oldText = pctEl.textContent;
            const newText = Math.round(pct) + '%';
            pctEl.textContent = newText;
            if (oldText !== newText) {
                pctEl.classList.remove('num-flash');
                void pctEl.offsetWidth;
                pctEl.classList.add('num-flash');
            }
        }
        if (nameEl) {
            if (chargingSet.has(i)) {
                nameEl.classList.add('charging-name');
            } else {
                nameEl.classList.remove('charging-name');
            }
        }
    });

    // Center: charging indicator
    const chargingNames = step.charging_names.join(', ') || 'None';
    const indEl = document.getElementById('chargingIndicator');
    indEl.textContent = '';
    const indSpan = document.createElement('span');
    indSpan.textContent = 'CHARGING: ' + chargingNames;
    indEl.appendChild(indSpan);

    // Right: live math
    renderLiveMath(stepIdx);
}

// -- Render Battery Bars (left) -------------------------------
function renderBatteryBars(devs, state, chargingSet) {
    const container = document.getElementById('batteryBars');
    if (container.children.length !== devs.length) {
        container.textContent = '';
        devs.forEach((d, i) => {
            const row = document.createElement('div');
            row.className = 'battery-row';
            row.id = 'batRow-' + i;

            const icon = document.createElement('span');
            icon.className = 'bat-charge-icon';
            icon.id = 'batIcon-' + i;

            const name = document.createElement('span');
            name.className = 'bat-name';
            name.textContent = shortName(d.name);

            const track = document.createElement('div');
            track.className = 'bat-bar-track';
            const fill = document.createElement('div');
            fill.className = 'bat-bar-fill';
            fill.id = 'batFill-' + i;
            track.appendChild(fill);

            const pct = document.createElement('span');
            pct.className = 'bat-pct';
            pct.id = 'batPct-' + i;
            pct.textContent = '0%';

            row.appendChild(icon);
            row.appendChild(name);
            row.appendChild(track);
            row.appendChild(pct);
            container.appendChild(row);
        });
    }

    devs.forEach((d, i) => {
        const pct = Math.max(0, Math.min(100, state[i]));
        const isCharging = chargingSet.has(i);
        const row = document.getElementById('batRow-' + i);
        const fill = document.getElementById('batFill-' + i);
        const pctEl = document.getElementById('batPct-' + i);
        const iconEl = document.getElementById('batIcon-' + i);

        if (isCharging) {
            row.classList.add('is-charging');
        } else {
            row.classList.remove('is-charging');
        }
        fill.style.width = pct + '%';
        fill.style.backgroundColor = batteryColor(pct);
        pctEl.textContent = Math.round(pct) + '%';
        pctEl.style.color = batteryColor(pct);
        iconEl.textContent = isCharging ? '\u26A1' : '';
    });
}

// -- Render Decision Network (left) ---------------------------
function renderDecisionNetwork(step, params) {
    const container = document.getElementById('decisionNetwork');
    const chanceP = params.charge_success_prob;
    const decisionNames = step.charging_names.map(n => shortName(n)).join(', ') || 'None';
    const eu = result.optimal_plan.expected_utility;

    // Use DOM API for SVG -- vertical layout: Decision top, Chance left, Utility right
    container.textContent = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'decision-net';

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 240 130');

    function svgEl(tag, attrs) {
        const el = document.createElementNS(svgNS, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        return el;
    }
    function svgText(x, y, text, cls, extraAttrs) {
        const el = svgEl('text', { x, y, class: cls, ...extraAttrs });
        el.textContent = text;
        return el;
    }

    // Layout: Decision rect at top center, Chance circle bottom-left, Utility diamond bottom-right
    // Edges
    svg.appendChild(svgEl('line', { x1: '120', y1: '42', x2: '55', y2: '78', stroke: 'rgba(255,255,255,0.1)', 'stroke-width': '1' }));
    svg.appendChild(svgEl('line', { x1: '120', y1: '42', x2: '185', y2: '78', stroke: 'rgba(255,255,255,0.1)', 'stroke-width': '1' }));

    // Decision node (rectangle) -- top center
    svg.appendChild(svgEl('rect', { x: '25', y: '8', width: '190', height: '34', rx: '3', fill: 'none', stroke: '#f5a623', 'stroke-width': '1.5', opacity: '0.7' }));
    svg.appendChild(svgText('120', '21', 'DECISION', 'dn-label', {}));
    const maxDecLen = 28;
    const truncDecision = decisionNames.length > maxDecLen ? decisionNames.substring(0, maxDecLen) + '..' : decisionNames;
    svg.appendChild(svgText('120', '35', truncDecision, 'dn-value', { fill: '#f5a623', 'font-size': '7' }));

    // Chance node (circle) -- bottom left
    svg.appendChild(svgEl('circle', { cx: '55', cy: '100', r: '22', fill: 'none', stroke: '#5ab8f5', 'stroke-width': '1.5', opacity: '0.7' }));
    svg.appendChild(svgText('55', '96', 'P(s)', 'dn-label', {}));
    svg.appendChild(svgText('55', '108', chanceP.toFixed(2), 'dn-value', { fill: '#5ab8f5' }));

    // Utility node (diamond) -- bottom right
    svg.appendChild(svgEl('polygon', { points: '185,76 209,100 185,124 161,100', fill: 'none', stroke: '#d4b8ff', 'stroke-width': '1.5', opacity: '0.7' }));
    svg.appendChild(svgText('185', '96', 'EU', 'dn-label', {}));
    svg.appendChild(svgText('185', '108', eu.toFixed(1), 'dn-value', { fill: '#d4b8ff' }));

    wrapper.appendChild(svg);
    container.appendChild(wrapper);
}

// -- Render Live Math (right) ---------------------------------
function renderLiveMath(stepIdx) {
    const container = document.getElementById('liveMath');
    const steps = result.optimal_plan.steps;
    const params = result.params;
    const opt = result.optimal_plan;

    let deficiencySum = 0;
    for (let s = 0; s <= stepIdx; s++) {
        deficiencySum += steps[s].state_after.reduce((sum, b) => sum + (100 - Math.max(0, b)), 0);
    }

    const switchCost = opt.switching_count * params.switching_penalty;
    const totalCost = opt.total_cost;
    const reward = opt.total_reward;
    const penalty = opt.total_penalty;
    const eu = opt.expected_utility;

    container.textContent = '';

    // P(success) = p^H
    const H = steps.length;
    const p = params.charge_success_prob;
    const pSuccess = Math.pow(p, H);

    // Formula header
    const formulaDiv = document.createElement('div');
    formulaDiv.className = 'math-formula';
    formulaDiv.textContent = '\u03A3(100 - b_i) through step ' + (stepIdx + 1);
    container.appendChild(formulaDiv);

    // Rows
    const rows = [
        { label: 'Deficiency', value: deficiencySum.toFixed(0), id: 'mathDef', style: '' },
        { label: 'Switch Cost', value: opt.switching_count + ' x ' + params.switching_penalty + ' = ' + switchCost.toFixed(0), id: '', style: '' },
    ];

    rows.forEach(r => {
        const rowEl = document.createElement('div');
        rowEl.className = 'math-row';
        const lbl = document.createElement('span');
        lbl.className = 'math-label';
        lbl.textContent = r.label;
        const val = document.createElement('span');
        val.className = 'math-value';
        if (r.id) val.id = r.id;
        val.textContent = r.value;
        rowEl.appendChild(lbl);
        rowEl.appendChild(val);
        container.appendChild(rowEl);
    });

    // Divider
    const div1 = document.createElement('div');
    div1.className = 'math-divider';
    container.appendChild(div1);

    // Cost / Reward / Penalty
    const rows2 = [
        { label: 'Total Cost', value: totalCost.toFixed(1), color: '' },
        { label: 'Reward', value: reward.toFixed(1), color: 'var(--accent-charge)' },
        { label: 'Penalty', value: penalty.toFixed(1), color: 'var(--accent-critical)' },
    ];
    rows2.forEach(r => {
        const rowEl = document.createElement('div');
        rowEl.className = 'math-row';
        const lbl = document.createElement('span');
        lbl.className = 'math-label';
        lbl.textContent = r.label;
        const val = document.createElement('span');
        val.className = 'math-value';
        if (r.color) val.style.color = r.color;
        val.textContent = r.value;
        rowEl.appendChild(lbl);
        rowEl.appendChild(val);
        container.appendChild(rowEl);
    });

    // Divider
    const div2 = document.createElement('div');
    div2.className = 'math-divider';
    container.appendChild(div2);

    // P(success) row
    const pRow = document.createElement('div');
    pRow.className = 'math-row';
    const pLabel = document.createElement('span');
    pLabel.className = 'math-label';
    pLabel.textContent = 'P(success) = p^' + H;
    const pVal = document.createElement('span');
    pVal.className = 'math-value';
    pVal.textContent = pSuccess.toFixed(4);
    pRow.appendChild(pLabel);
    pRow.appendChild(pVal);
    container.appendChild(pRow);

    // EU
    const euRow = document.createElement('div');
    euRow.className = 'math-row';
    const euLabel = document.createElement('span');
    euLabel.className = 'math-label';
    euLabel.textContent = 'Expected Utility';
    const euVal = document.createElement('span');
    euVal.className = 'math-value eu-value ' + (eu >= 0 ? 'eu-positive' : 'eu-negative');
    euVal.textContent = eu.toFixed(2);
    euRow.appendChild(euLabel);
    euRow.appendChild(euVal);
    container.appendChild(euRow);

    // Flash deficiency
    const defEl = document.getElementById('mathDef');
    if (defEl) {
        defEl.classList.remove('num-flash');
        void defEl.offsetWidth;
        defEl.classList.add('num-flash');
    }
}

// -- Playback Controls ----------------------------------------
function togglePlay() {
    if (isPlaying) {
        stopPlay();
    } else {
        startPlay();
    }
}

function startPlay() {
    isPlaying = true;
    document.getElementById('playBtn').textContent = '\u23F8'; // pause
    playTimer = setInterval(() => {
        if (currentStep < totalSteps - 1) {
            renderStep(currentStep + 1);
        } else {
            stopPlay();
        }
    }, PLAY_INTERVAL);
}

function stopPlay() {
    isPlaying = false;
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
    document.getElementById('playBtn').textContent = '\u25B6'; // play
}

function goFirst() { stopPlay(); renderStep(0); }
function goPrev() { stopPlay(); if (currentStep > 0) renderStep(currentStep - 1); }
function goNext() { stopPlay(); if (currentStep < totalSteps - 1) renderStep(currentStep + 1); }
function goLast() { stopPlay(); renderStep(totalSteps - 1); }

// -- Utility Functions ----------------------------------------
function batteryColor(level) {
    if (level <= 15) return 'var(--bat-critical)';
    if (level <= 30) return 'var(--bat-low)';
    if (level <= 55) return 'var(--bat-mid)';
    if (level <= 80) return 'var(--bat-good)';
    return 'var(--bat-full)';
}

function shortName(name) {
    const parts = name.split(' ');
    if (parts.length <= 2) return name;
    if (parts.length === 3) return parts[0] + ' ' + parts[2];
    return parts.slice(-2).join(' ');
}

function truncEdge(text) {
    const maxLen = 20;
    if (text.length > maxLen) return text.substring(0, maxLen) + '..';
    return text;
}

function formatState(state) {
    // Show compact: first 3 values + ellipsis if more
    const vals = state.map(v => Math.round(v));
    if (vals.length <= 3) return '(' + vals.join(',') + ')';
    return '(' + vals.slice(0, 3).join(',') + ',..)';
}

function simulateStep(state, chargingIndices, devs) {
    return state.map((b, i) => {
        let val = b - devs[i].consumption_rate;
        if (chargingIndices.includes(i)) {
            val += devs[i].charge_rate;
        }
        return Math.max(0, Math.min(100, val));
    });
}

// -- Analysis Overlay -----------------------------------------
function toggleAnalysis() {
    const overlay = document.getElementById('analysisOverlay');
    if (overlay.style.display === 'none') {
        renderAnalysis();
        overlay.style.display = '';
    } else {
        overlay.style.display = 'none';
    }
}

function renderAnalysis() {
    const body = document.getElementById('analysisBody');
    body.textContent = '';
    if (!result) return;

    const opt = result.optimal_plan;
    const worst = result.worst_plan;
    const topPlans = result.top_plans;
    const devs = result.devices;
    const params = result.params;
    const H = params.horizon;
    const p = params.charge_success_prob;
    const pSuccess = Math.pow(p, H);

    // 1. Summary stats
    const summarySection = document.createElement('div');
    summarySection.className = 'analysis-section';
    const summaryTitle = document.createElement('h3');
    summaryTitle.textContent = 'Optimal Plan Summary';
    summarySection.appendChild(summaryTitle);

    const statGrid = document.createElement('div');
    statGrid.className = 'analysis-stat-grid';
    const stats = [
        { label: 'Total Plans', value: result.total_plans.toLocaleString() },
        { label: 'P(success) = p^H', value: pSuccess.toFixed(4) },
        { label: 'EU (Optimal)', value: opt.expected_utility.toFixed(2) },
        { label: 'EU (Worst)', value: worst.expected_utility.toFixed(2) },
        { label: 'Total Cost', value: opt.total_cost.toFixed(1) },
        { label: 'Switches', value: String(opt.switching_count) },
    ];
    stats.forEach(s => {
        const stat = document.createElement('div');
        stat.className = 'analysis-stat';
        const lbl = document.createElement('div');
        lbl.className = 'analysis-stat-label';
        lbl.textContent = s.label;
        const val = document.createElement('div');
        val.className = 'analysis-stat-value';
        val.textContent = s.value;
        stat.appendChild(lbl);
        stat.appendChild(val);
        summarySection.appendChild(stat);
    });
    summarySection.appendChild(statGrid);
    body.appendChild(summarySection);

    // 2. EU Comparison (top 10 plans)
    const euSection = document.createElement('div');
    euSection.className = 'analysis-section';
    const euTitle = document.createElement('h3');
    euTitle.textContent = 'EU Comparison — Top Plans';
    euSection.appendChild(euTitle);

    const chart = document.createElement('div');
    chart.className = 'eu-bar-chart';
    const maxEU = topPlans.length > 0 ? topPlans[0].expected_utility : 0;
    const minEU = topPlans.length > 0 ? topPlans[topPlans.length - 1].expected_utility : 0;
    const euRange = Math.max(Math.abs(maxEU), Math.abs(minEU), 1);

    topPlans.slice(0, 10).forEach((plan, i) => {
        const row = document.createElement('div');
        row.className = 'eu-bar-row';
        const label = document.createElement('span');
        label.className = 'eu-bar-label';
        label.textContent = 'Plan ' + (i + 1);
        const track = document.createElement('div');
        track.className = 'eu-bar-track';
        const fill = document.createElement('div');
        fill.className = 'eu-bar-fill ' + (i === 0 ? 'optimal' : 'other');
        const widthPct = Math.max(5, (Math.abs(plan.expected_utility) / euRange) * 100);
        fill.style.width = widthPct + '%';
        track.appendChild(fill);
        const value = document.createElement('span');
        value.className = 'eu-bar-value';
        value.textContent = plan.expected_utility.toFixed(1);
        row.appendChild(label);
        row.appendChild(track);
        row.appendChild(value);
        chart.appendChild(row);
    });
    euSection.appendChild(chart);
    body.appendChild(euSection);

    // 3. Failure Risk per device
    const riskSection = document.createElement('div');
    riskSection.className = 'analysis-section';
    const riskTitle = document.createElement('h3');
    riskTitle.textContent = 'Failure Risk by Device';
    riskSection.appendChild(riskTitle);

    const steps = opt.steps;
    const lowThresh = params.low_battery_threshold || 20;
    devs.forEach((d, i) => {
        const lowCount = steps.filter(s => s.state_after[i] < lowThresh).length;
        const depletedCount = steps.filter(s => s.state_after[i] <= 0).length;
        const riskScore = ((lowCount * 0.5 + depletedCount * 1.0) / steps.length * 100);

        const row = document.createElement('div');
        row.className = 'risk-row';
        const name = document.createElement('span');
        name.className = 'risk-name';
        name.textContent = d.name + ' (P' + d.priority + ')';
        const badge = document.createElement('span');
        let riskClass, riskText;
        if (riskScore === 0) { riskClass = 'risk-safe'; riskText = 'Safe'; }
        else if (riskScore < 30) { riskClass = 'risk-low'; riskText = 'Low ' + riskScore.toFixed(0) + '%'; }
        else if (riskScore < 60) { riskClass = 'risk-medium'; riskText = 'Med ' + riskScore.toFixed(0) + '%'; }
        else { riskClass = 'risk-high'; riskText = 'High ' + riskScore.toFixed(0) + '%'; }
        badge.className = 'risk-badge ' + riskClass;
        badge.textContent = riskText;
        row.appendChild(name);
        row.appendChild(badge);
        riskSection.appendChild(row);
    });
    body.appendChild(riskSection);

    // 4. Charging priority analysis
    const chargeSection = document.createElement('div');
    chargeSection.className = 'analysis-section';
    const chargeTitle = document.createElement('h3');
    chargeTitle.textContent = 'Charging Allocation';
    chargeSection.appendChild(chargeTitle);

    const chargeCount = {};
    devs.forEach(d => chargeCount[d.name] = 0);
    steps.forEach(step => step.charging_names.forEach(n => chargeCount[n]++));

    Object.entries(chargeCount)
        .sort((a, b) => b[1] - a[1])
        .forEach(([name, count]) => {
            const row = document.createElement('div');
            row.className = 'risk-row';
            const nm = document.createElement('span');
            nm.className = 'risk-name';
            nm.textContent = name;
            const val = document.createElement('span');
            val.style.fontFamily = 'var(--font-mono)';
            val.style.fontSize = '11px';
            val.style.color = 'var(--text-secondary)';
            val.textContent = count + '/' + steps.length + ' steps';
            row.appendChild(nm);
            row.appendChild(val);
            chargeSection.appendChild(row);
        });
    body.appendChild(chargeSection);
}

function generateAlternatives(numDevices, maxSlots, optimalAction) {
    const alternatives = [];
    const optKey = [...optimalAction].sort().join(',');

    for (let i = 0; i < numDevices && alternatives.length < 3; i++) {
        const action = [i];
        if (action.sort().join(',') !== optKey) {
            alternatives.push(action);
        }
    }

    return alternatives.slice(0, 2);
}
