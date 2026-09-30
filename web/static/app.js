/**
 * AI-Verified Secure Data Wiping & Certification Tool
 * Client-Side Application Logic (Offline, Vanilla JS)
 */

let state = {
  currentStep: 1,
  targets: [],
  selectedTarget: ".",
  prescanResults: null,
  currentJobId: null,
  pollInterval: null,
  wipeManifest: null,
  issuedCertificate: null
};

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  loadTargets();
  setupCanvasResize();
});

function showAlert(message, type = "danger") {
  const box = document.getElementById("alert-box");
  const msg = document.getElementById("alert-message");
  box.className = `alert alert-${type}`;
  msg.textContent = message;
  box.classList.remove("hidden");
}

function hideAlert() {
  const box = document.getElementById("alert-box");
  box.classList.add("hidden");
}

function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function shortenHash(hash, lead = 8, trail = 8) {
  if (!hash || hash.length <= lead + trail) return hash || '-';
  return `${hash.slice(0, lead)}...${hash.slice(-trail)}`;
}

// --- Stepper Navigation ---
function switchStep(stepNumber) {
  state.currentStep = stepNumber;
  for (let i = 1; i <= 4; i++) {
    const nav = document.getElementById(`step-nav-${i}`);
    const sec = document.getElementById(`step-section-${i}`);
    if (i === stepNumber) {
      nav.classList.add("active");
      sec.classList.remove("hidden");
    } else {
      nav.classList.remove("active");
      sec.classList.add("hidden");
    }
  }
}

function proceedToStep(nextStep) {
  // Mark previous as completed
  const prevNav = document.getElementById(`step-nav-${state.currentStep}`);
  if (prevNav) prevNav.classList.add("completed");
  switchStep(nextStep);
}

// --- STEP 1: Targets & Samples ---
async function loadTargets() {
  hideAlert();
  const select = document.getElementById("target-select");
  select.innerHTML = '<option value="">Scanning sandbox/ directory...</option>';

  try {
    const res = await fetch("/api/targets");
    if (!res.ok) throw new Error("Failed to load targets from server");
    const targets = await res.json();
    state.targets = targets;

    select.innerHTML = "";
    if (targets.length === 0) {
      select.innerHTML = '<option value=".">sandbox/ (empty - click Create Samples)</option>';
    } else {
      targets.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.target;
        opt.textContent = `${t.name} (${t.file_count} files, ${formatBytes(t.size)})`;
        select.appendChild(opt);
      });
    }

    state.selectedTarget = select.value || ".";
    onTargetChanged();
  } catch (err) {
    showAlert(`Error loading targets: ${err.message}`, "danger");
  }
}

function onTargetChanged() {
  const select = document.getElementById("target-select");
  state.selectedTarget = select.value || ".";
  const item = state.targets.find(t => t.target === state.selectedTarget);
  const summary = document.getElementById("target-summary");

  if (item) {
    summary.innerHTML = `Selected: <strong style="color: #fff;">${item.name}</strong> &bull; Total Files: <strong style="color: #fff;">${item.file_count}</strong> &bull; Aggregate Size: <strong style="color: #fff;">${formatBytes(item.size)}</strong>`;
  } else {
    summary.innerHTML = `Target: <strong style="color: #fff;">sandbox/</strong>`;
  }
}

async function createSamples() {
  hideAlert();
  const btn = document.getElementById("btn-create-samples");
  btn.disabled = true;
  btn.textContent = "Creating...";

  try {
    const res = await fetch("/api/samples", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create sample files");
    showAlert(data.message, "success");
    await loadTargets();
  } catch (err) {
    showAlert(err.message, "danger");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"></path></svg> Create Sample Files`;
  }
}

// --- STEP 2: Pre-Wipe AI Scan ---
async function runPreScan() {
  hideAlert();
  const spinner = document.getElementById("prescan-spinner");
  const container = document.getElementById("prescan-results-container");
  const tbody = document.getElementById("prescan-tbody");
  const btn = document.getElementById("btn-run-prescan");

  spinner.classList.remove("hidden");
  container.classList.add("hidden");
  btn.disabled = true;

  try {
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: state.selectedTarget })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Pre-scan failed");

    state.prescanResults = data.files;
    tbody.innerHTML = "";

    let totalFlagged = 0;
    data.files.forEach(f => {
      totalFlagged += f.flagged_blocks;
      const tr = document.createElement("tr");

      let verdictBadge = '';
      if (f.verdict === "FAIL") {
        verdictBadge = `<span class="badge badge-fail">FAIL (Residual Data)</span>`;
      } else if (f.verdict === "PASS") {
        verdictBadge = `<span class="badge badge-pass">PASS</span>`;
      } else {
        verdictBadge = `<span class="badge badge-empty">EMPTY</span>`;
      }

      tr.innerHTML = `
        <td style="font-weight: 600;">${f.name}</td>
        <td class="mono">${formatBytes(f.size)}</td>
        <td class="mono">${f.blocks}</td>
        <td class="mono" style="${f.flagged_blocks > 0 ? 'color: var(--accent-rose); font-weight: 700;' : ''}">${f.flagged_blocks}</td>
        <td class="mono">${f.max_risk}</td>
        <td>${verdictBadge}</td>
      `;
      tbody.appendChild(tr);
    });

    const summaryText = document.getElementById("prescan-summary-text");
    summaryText.innerHTML = `Scanned <strong>${data.files.length}</strong> files. Detected <strong>${totalFlagged}</strong> suspicious residual blocks prior to wipe.`;

    spinner.classList.add("hidden");
    container.classList.remove("hidden");
  } catch (err) {
    spinner.classList.add("hidden");
    showAlert(err.message, "danger");
  } finally {
    btn.disabled = false;
  }
}

// --- STEP 3: Wipe & Comparison ---
function onConfirmInputChanged() {
  const val = document.getElementById("wipe-confirm-input").value.trim();
  const btn = document.getElementById("btn-start-wipe");
  btn.disabled = (val !== "WIPE");
}

async function startWipe() {
  hideAlert();
  const isDelete = document.getElementById("wipe-delete-checkbox").checked;
  const btn = document.getElementById("btn-start-wipe");
  const progressSec = document.getElementById("wipe-progress-section");
  const resultsSec = document.getElementById("wipe-results-section");

  btn.disabled = true;
  progressSec.classList.remove("hidden");
  resultsSec.classList.add("hidden");

  try {
    const res = await fetch("/api/wipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: state.selectedTarget,
        delete: isDelete,
        confirm: "WIPE"
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to start wipe process");

    state.currentJobId = data.job_id;
    pollJobStatus(data.job_id);
  } catch (err) {
    showAlert(err.message, "danger");
    btn.disabled = false;
    progressSec.classList.add("hidden");
  }
}

function pollJobStatus(jobId) {
  if (state.pollInterval) clearInterval(state.pollInterval);

  state.pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) throw new Error("Failed to poll wipe status");
      const job = await res.json();

      updateWipeProgress(job);

      if (job.status === "completed") {
        clearInterval(state.pollInterval);
        state.pollInterval = null;
        state.wipeManifest = job.result;
        renderWipeResults(job.result);
      } else if (job.status === "failed") {
        clearInterval(state.pollInterval);
        state.pollInterval = null;
        showAlert(`Wipe failed: ${job.error}`, "danger");
        document.getElementById("btn-start-wipe").disabled = false;
      }
    } catch (err) {
      clearInterval(state.pollInterval);
      state.pollInterval = null;
      showAlert(`Polling error: ${err.message}`, "danger");
      document.getElementById("btn-start-wipe").disabled = false;
    }
  }, 500);
}

function updateWipeProgress(job) {
  const p = job.progress || {};
  const pct = p.percent || 0;
  const bar = document.getElementById("progress-bar-fill");
  const pctText = document.getElementById("progress-pct-text");
  const currFile = document.getElementById("progress-current-file");
  const fileIdx = document.getElementById("progress-file-index");
  const fileTot = document.getElementById("progress-file-total");
  const pill = document.getElementById("progress-phase-pill");

  bar.style.width = `${pct}%`;
  pctText.textContent = `${pct}%`;
  currFile.textContent = p.file || 'Preparing passes...';
  fileIdx.textContent = (p.index !== undefined) ? p.index + 1 : 0;
  fileTot.textContent = p.total || 0;
  pill.textContent = p.phase || 'running';
}

function renderWipeResults(manifest) {
  const resultsSec = document.getElementById("wipe-results-section");
  const tbody = document.getElementById("comparison-tbody");
  const fileSelect = document.getElementById("viz-file-select");

  tbody.innerHTML = "";
  fileSelect.innerHTML = "";

  manifest.files.forEach((f, idx) => {
    const tr = document.createElement("tr");

    const preVerdict = (f.block_scan_before && f.block_scan_before.verdict) || "UNKNOWN";
    const postVerdict = (f.block_scan && f.block_scan.verdict) || "UNKNOWN";

    const preBadge = (preVerdict === "PASS") 
      ? `<span class="badge badge-pass">PASS</span>` 
      : `<span class="badge badge-fail">${preVerdict}</span>`;

    const postBadge = (postVerdict === "PASS") 
      ? `<span class="badge badge-pass">PASS</span>` 
      : `<span class="badge badge-fail">${postVerdict}</span>`;

    const preFlagged = f.block_scan_before ? f.block_scan_before.flagged_blocks : 0;
    const postFlagged = f.block_scan ? f.block_scan.flagged_blocks : 0;
    const rbZero = f.readback_zero === true;
    const rbBadge = rbZero
      ? `<span class="badge badge-pass">&#10003; Zero Read-Back</span>`
      : `<span class="badge badge-fail">&#10007; Failed</span>`;

    tr.innerHTML = `
      <td style="font-weight: 600;">${f.name}</td>
      <td class="mono">${formatBytes(f.size)}</td>
      <td>${preBadge}</td>
      <td>${postBadge}</td>
      <td>${rbBadge}</td>
      <td class="mono">
        <span style="color: var(--accent-rose);">${preFlagged}</span>
        &rarr;
        <span style="color: var(--accent-emerald); font-weight: 700;">${postFlagged}</span>
      </td>
      <td><span class="hash-pill" title="${f.sha256_before}">${shortenHash(f.sha256_before)}</span></td>
      <td><span class="hash-pill" title="${f.sha256_after}">${shortenHash(f.sha256_after)}</span></td>
    `;
    tbody.appendChild(tr);

    const opt = document.createElement("option");
    opt.value = idx;
    opt.textContent = `${f.name} (${f.block_scan ? f.block_scan.blocks : 0} blocks)`;
    fileSelect.appendChild(opt);
  });

  resultsSec.classList.remove("hidden");
  renderBlockVisualization();
}

// --- Heat-Strip Canvas Visualization ---
function renderBlockVisualization() {
  if (!state.wipeManifest || !state.wipeManifest.files) return;
  const select = document.getElementById("viz-file-select");
  const idx = parseInt(select.value, 10) || 0;
  const file = state.wipeManifest.files[idx];
  if (!file) return;

  const beforeRisks = (file.block_scan_before && file.block_scan_before.block_risks) || [];
  const afterRisks = (file.block_scan && file.block_scan.block_risks) || [];

  const canvasBefore = document.getElementById("canvas-before");
  const canvasAfter = document.getElementById("canvas-after");

  drawRiskHeatStrip(canvasBefore, beforeRisks);
  drawRiskHeatStrip(canvasAfter, afterRisks);

  const beforeStats = document.getElementById("viz-before-stats");
  const afterStats = document.getElementById("viz-after-stats");

  const preFlag = file.block_scan_before ? file.block_scan_before.flagged_blocks : 0;
  const preMax = file.block_scan_before ? file.block_scan_before.max_risk : 0;
  beforeStats.textContent = `Flagged: ${preFlag}/${beforeRisks.length} | Max Risk: ${preMax}`;

  const postFlag = file.block_scan ? file.block_scan.flagged_blocks : 0;
  const postMax = file.block_scan ? file.block_scan.max_risk : 0;
  afterStats.textContent = `Flagged: ${postFlag}/${afterRisks.length} | Max Risk: ${postMax}`;
}

function drawRiskHeatStrip(canvas, risks) {
  const ctx = canvas.getContext("2d");
  const width = canvas.clientWidth || 600;
  const height = canvas.clientHeight || 40;
  canvas.width = width;
  canvas.height = height;

  ctx.clearRect(0, 0, width, height);

  if (!risks || risks.length === 0) {
    ctx.fillStyle = "#334155";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.fillText("No 4KB blocks found", 12, height / 2 + 4);
    return;
  }

  const blockWidth = Math.max(1, width / risks.length);

  risks.forEach((risk, i) => {
    let color;
    if (risk < 0.2) {
      color = "#10b981"; // Emerald green
    } else if (risk < 0.5) {
      color = "#f59e0b"; // Amber warning
    } else {
      color = "#f43f5e"; // Rose / red alert
    }

    ctx.fillStyle = color;
    const x = i * blockWidth;
    ctx.fillRect(x, 0, blockWidth + 0.5, height);
  });
}

function setupCanvasResize() {
  window.addEventListener("resize", () => {
    if (state.wipeManifest) renderBlockVisualization();
  });
}

async function issueCertificate() {
  hideAlert();
  if (!state.currentJobId) {
    showAlert("No completed wipe job available. Please run Step 3 first.", "danger");
    return;
  }

  const label = document.getElementById("cert-device-label").value.trim() || "Demo-Device-01";
  const btn = document.getElementById("btn-issue-cert");
  btn.disabled = true;
  btn.textContent = "Issuing...";

  try {
    const res = await fetch("/api/certificate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: state.currentJobId, label })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to issue certificate");

    state.issuedCertificate = data.certificate;
    displayIssuedCertificate(data.certificate, data.ledger_entry);
    showAlert("Erasure certificate cryptographically signed with Ed25519 and recorded in ledger!", "success");
    loadLedger();
  } catch (err) {
    showAlert(err.message, "danger");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Issue Signed Certificate`;
  }
}

function displayIssuedCertificate(cert, ledgerEntry) {
  const card = document.getElementById("certificate-display-card");
  const p = cert.payload;

  document.getElementById("cert-id-value").textContent = p.cert_id;
  document.getElementById("cert-label-val").textContent = p.device.label;
  document.getElementById("cert-host-val").textContent = `${p.device.hostname} (${p.device.os.split('-')[0]})`;
  document.getElementById("cert-time-val").textContent = p.issued_at;
  document.getElementById("cert-algo-val").textContent = `${cert.algorithm}${cert.key_id ? ' · key_id: ' + cert.key_id : ''}`;
  document.getElementById("cert-files-val").textContent = `${p.erasure.file_count} files (${formatBytes(p.erasure.bytes)})`;

  if (ledgerEntry) {
    const ledgerVal = document.getElementById("cert-ledger-val");
    const ledgerEntryVal = document.getElementById("cert-ledger-entry-val");
    if (ledgerVal) ledgerVal.textContent = "Recorded \u2022 Chain Intact";
    if (ledgerEntryVal) ledgerEntryVal.textContent = `#${ledgerEntry.index} · ${ledgerEntry.entry_hash.slice(0, 16)}...`;
  }

  const btnCert = document.getElementById("btn-download-cert");
  const btnMan = document.getElementById("btn-download-manifest");

  btnCert.href = `/api/download/certificate/${state.currentJobId}`;
  btnMan.href = `/api/download/manifest/${state.currentJobId}`;

  card.classList.remove("hidden");
}

// --- Independent Verification & Tamper Demo ---
async function submitVerify() {
  hideAlert();
  const certInput = document.getElementById("verify-cert-file");
  const manInput = document.getElementById("verify-manifest-file");

  if (!certInput.files || certInput.files.length === 0) {
    showAlert("Please select a certificate.json file to verify.", "danger");
    return;
  }

  const formData = new FormData();
  formData.append("certificate", certInput.files[0]);
  if (manInput.files && manInput.files.length > 0) {
    formData.append("manifest", manInput.files[0]);
  }

  try {
    const res = await fetch("/api/verify", { method: "POST", body: formData });
    const data = await res.json();
    displayVerifyResult(data);
  } catch (err) {
    showAlert(err.message, "danger");
  }
}

async function runTamperDemo() {
  hideAlert();
  const btn = document.getElementById("btn-tamper-demo");
  btn.disabled = true;
  try {
    const res = await fetch("/api/tamper-demo", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Tamper demo failed");
    displayVerifyResult(data, true);
  } catch (err) {
    showAlert(err.message, "danger");
  } finally {
    btn.disabled = false;
  }
}

function displayVerifyResult(result, isTamperDemo = false) {
  const box = document.getElementById("verify-result-box");
  const content = document.getElementById("verify-result-content");
  box.style.display = "block";

  if (result.valid) {
    box.className = "verify-result valid";
    const ledger = result.details && result.details.ledger;
    const ledgerHtml = ledger
      ? `<div>Ledger: <strong style="color:${ledger.chain_valid ? '#34d399' : '#fb7185'}">${ledger.chain_valid ? '&#10003; Chain Intact' : '&#10007; ' + ledger.chain_message}</strong> &bull; Recorded: <strong>${ledger.recorded ? '&#10003; Yes' : '&#10007; No'}</strong></div>`
      : '';
    content.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 1.05rem; margin-bottom: 0.5rem;">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>
        ${result.reason}
      </div>
      <div style="font-size: 0.85rem; line-height: 1.6;">
        <div>Cert ID: <strong class="mono">${result.details.cert_id}</strong></div>
        <div>Device: <strong>${result.details.device.label || '-'}</strong> (${result.details.device.hostname || '-'})</div>
        <div>Issued: <strong>${result.details.issued_at}</strong></div>
        <div>AI Result: <strong style="color: #34d399;">${result.details.result} (${result.details.file_count} files)</strong></div>
        ${ledgerHtml}
      </div>
    `;
  } else {
    box.className = "verify-result invalid";
    let tamperInfo = "";
    if (isTamperDemo) {
      tamperInfo = `
        <div style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(0,0,0,0.25); border-radius: 4px; font-size: 0.8rem;">
          <strong>Tamper In-Memory Modification:</strong><br>
          Altered field <code>${result.tamper_field || 'erasure.file_count'}</code>:
          <del style="color: #94a3b8;">${result.original_value}</del> &rarr; <span style="color: #fb7185; font-weight: 700;">${result.tampered_value}</span><br>
          <em>${result.details && result.details.note ? result.details.note : ''}</em>
        </div>
      `;
    }
    content.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 1.05rem; margin-bottom: 0.5rem;">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>
        INVALID: ${result.reason}
      </div>
      ${tamperInfo}
    `;
  }
}

// --- Ledger Audit Functions ---
async function loadLedger() {
  try {
    const res = await fetch("/api/ledger");
    if (!res.ok) return;
    const data = await res.json();
    renderLedgerTable(data);
    const badge = document.getElementById("ledger-live-badge");
    if (badge) {
      badge.className = data.valid ? "badge badge-pass" : "badge badge-fail";
      badge.textContent = data.valid ? `CHAIN INTACT (${data.count} entries)` : `CHAIN BROKEN`;
    }
  } catch (e) { /* ledger may not exist yet */ }
}

function renderLedgerTable(data) {
  const tbody = document.getElementById("ledger-tbody");
  if (!tbody) return;
  const entries = data.entries || [];
  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-dim);">No ledger entries yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = entries.map(e => `
    <tr>
      <td class="mono" style="font-weight:700;color:var(--accent-cyan);">#${e.index}</td>
      <td class="mono" style="font-size:0.8rem;">${e.timestamp}</td>
      <td class="mono" style="font-size:0.78rem;color:#cbd5e1;">${e.cert_id}</td>
      <td><span class="hash-pill">${e.entry_hash.slice(0,16)}...</span></td>
      <td><span class="hash-pill">${e.prev_hash.slice(0,16)}...</span></td>
    </tr>
  `).join("");
}

async function verifyLedger() {
  const btn = document.getElementById("btn-verify-ledger");
  const box = document.getElementById("ledger-result-box");
  const content = document.getElementById("ledger-result-content");
  btn.disabled = true;
  try {
    const res = await fetch("/api/ledger/verify", { method: "POST" });
    const data = await res.json();
    box.style.display = "block";
    if (data.valid) {
      box.className = "verify-result valid";
      content.innerHTML = `<strong>&#10003; LEDGER VALID: ${data.message}</strong><br><span style="font-size:0.85rem;">Total entries: ${data.count}</span>`;
    } else {
      box.className = "verify-result invalid";
      content.innerHTML = `<strong>&#10007; LEDGER INVALID: ${data.message}</strong>`;
    }
    const badge = document.getElementById("ledger-live-badge");
    if (badge) {
      badge.className = data.valid ? "badge badge-pass" : "badge badge-fail";
      badge.textContent = data.valid ? `CHAIN INTACT (${data.count} entries)` : "CHAIN BROKEN";
    }
  } catch (err) {
    showAlert(err.message, "danger");
  } finally {
    btn.disabled = false;
  }
}

async function runLedgerTamperDemo() {
  const btn = document.getElementById("btn-ledger-tamper-demo");
  const box = document.getElementById("ledger-result-box");
  const content = document.getElementById("ledger-result-content");
  btn.disabled = true;
  try {
    const res = await fetch("/api/ledger/tamper-demo", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ledger tamper demo failed");
    box.style.display = "block";
    box.className = "verify-result invalid";
    content.innerHTML = `
      <div style="font-weight:700;font-size:1.05rem;margin-bottom:0.5rem;">&#10007; LEDGER INVALID: ${data.message}</div>
      <div style="font-size:0.85rem;line-height:1.7;padding:0.5rem;background:rgba(0,0,0,0.25);border-radius:4px;">
        <strong>Tampered:</strong> Entry <strong>#${data.tampered_index}</strong> cert_id modified in-memory<br>
        <strong>Rule:</strong> ${data.details.rule}<br>
        <strong>Original cert_id:</strong> <span class="mono" style="font-size:0.75rem;color:#94a3b8;">${data.original_cert_id}</span><br>
        <strong>Tampered cert_id:</strong> <span class="mono" style="font-size:0.75rem;color:#fb7185;">${data.tampered_cert_id}</span><br>
        <em>${data.details.note}</em>
      </div>
    `;
  } catch (err) {
    showAlert(err.message, "danger");
  } finally {
    btn.disabled = false;
  }
}

// Load ledger when step 4 is shown
const _origProceedToStep = proceedToStep;
function proceedToStep(nextStep) {
  const prevNav = document.getElementById(`step-nav-${state.currentStep}`);
  if (prevNav) prevNav.classList.add("completed");
  switchStep(nextStep);
  if (nextStep === 4) loadLedger();
}
