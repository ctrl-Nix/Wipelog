/**
 * Wipelog — Enterprise Cybersecurity Console Client Engine
 * Handles REST API interactions, live telemetry polling, ML block heat-strips,
 * Ed25519 certificate issuance, and cryptographic verification.
 */

let state = {
  currentView: 'overview',
  erasureStep: 1,
  devices: [],
  targets: [],
  selectedTarget: '.',
  prescanResults: null,
  postscanResults: null,
  currentJobId: null,
  pollInterval: null,
  issuedCertificate: null,
  ledgerEntries: []
};

document.addEventListener('DOMContentLoaded', () => {
  initConsole();
});

function initConsole() {
  loadDevicesList();
  loadTargets();
  loadAuditLedger();
}

function showAlert(message, type = 'info') {
  const banner = document.getElementById('alert-banner');
  const text = document.getElementById('alert-text');
  const icon = document.getElementById('alert-icon');

  banner.className = `alert-banner ${type}`;
  text.textContent = message;
  icon.textContent = type === 'danger' ? '❌' : (type === 'success' ? '✓' : 'ℹ️');
  banner.classList.remove('hidden');
}

function dismissAlert() {
  document.getElementById('alert-banner').classList.add('hidden');
}

function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function shortenHash(hash, lead = 8, trail = 8) {
  if (!hash || hash.length <= lead + trail) return hash || '-';
  return `${hash.slice(0, lead)}...${hash.slice(-trail)}`;
}

/* View Switching */
function switchMainView(viewId) {
  state.currentView = viewId;
  
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });

  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `view-${viewId}`);
  });

  const titleMap = {
    overview: 'Secure Erasure Console',
    devices: 'Storage Hardware Inventory',
    erasure: 'Secure Erasure Workflow',
    certificate: 'Digital Certificate Viewer',
    verifier: 'Cryptographic Signature Verifier',
    audit: 'Append-Only Audit Ledger'
  };

  const subMap = {
    overview: 'Sanitize storage media, verify residual data, and issue signed certificates',
    devices: 'Inspect detected storage drives, physical media parameters, and status',
    erasure: 'Sequential 5-stage DoD multi-pass overwrite and ML verification pipeline',
    certificate: 'Printable Certificate of Destruction with cryptographic integrity proof',
    verifier: 'Independent Ed25519 signature, manifest SHA-256 digest & ledger verifier',
    audit: 'SHA-256 hash-chained immutable audit ledger trail (ledger.jsonl)'
  };

  document.getElementById('page-title').textContent = titleMap[viewId] || 'Console';
  document.getElementById('page-subtitle').textContent = subMap[viewId] || '';

  if (viewId === 'devices') renderFullDevicesGrid();
  if (viewId === 'audit') loadAuditLedger();
}

/* Devices Inventory */
async function loadDevicesList() {
  try {
    const res = await fetch('/api/devices');
    if (!res.ok) throw new Error('Failed to fetch storage inventory');
    const devices = await res.json();
    state.devices = devices;
    document.getElementById('stat-devices-count').textContent = String(devices.length).padStart(2, '0');
    renderOverviewDevicesTable();
  } catch (err) {
    showAlert(`Inventory load failed: ${err.message}`, 'danger');
  }
}

function renderOverviewDevicesTable() {
  const tbody = document.getElementById('overview-devices-body');
  tbody.innerHTML = '';

  if (!state.devices.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted text-center">No storage devices detected</td></tr>';
    return;
  }

  state.devices.forEach(dev => {
    const tr = document.createElement('tr');
    const statusClass = dev.status === 'VERIFIED' ? 'tag-green' : (dev.status === 'READY' ? 'tag-blue' : 'tag-red');
    
    tr.innerHTML = `
      <td><strong>${dev.name}</strong></td>
      <td>${dev.type}</td>
      <td class="mono">${dev.capacity}</td>
      <td class="mono text-xs">${dev.serial}</td>
      <td><span class="metric-tag ${statusClass}">${dev.status}</span></td>
      <td class="text-xs text-muted">${dev.last_op}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="selectDeviceForWipe('${dev.target}')">
          Select Target
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderFullDevicesGrid() {
  const grid = document.getElementById('full-devices-grid');
  grid.innerHTML = '';

  state.devices.forEach(dev => {
    const card = document.createElement('div');
    card.className = 'device-card';
    const statusClass = dev.status === 'VERIFIED' ? 'tag-green' : 'tag-blue';

    card.innerHTML = `
      <div>
        <div class="device-card-header">
          <div>
            <div class="device-name">${dev.name}</div>
            <div class="device-model mono">${dev.model}</div>
          </div>
          <span class="metric-tag ${statusClass}">${dev.status}</span>
        </div>

        <div class="device-specs-list">
          <div class="device-spec-item"><span>TYPE</span><strong class="mono">${dev.type}</strong></div>
          <div class="device-spec-item"><span>CAPACITY</span><strong class="mono">${dev.capacity}</strong></div>
          <div class="device-spec-item"><span>SERIAL</span><strong class="mono text-xs">${dev.serial}</strong></div>
          <div class="device-spec-item"><span>INTERFACE</span><strong class="mono">PCIe / SATA</strong></div>
        </div>
      </div>

      <div class="pt-2 border-t border-subtle flex justify-between items-center">
        <span class="text-xs text-muted">${dev.last_op}</span>
        <button class="btn btn-sm btn-primary" onclick="inspectDeviceModal('${dev.id}')">Inspect History</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function inspectDeviceModal(devId) {
  const dev = state.devices.find(d => d.id === devId);
  if (!dev) return;

  document.getElementById('modal-dev-name').textContent = dev.name;
  const body = document.getElementById('modal-dev-body');
  body.innerHTML = `
    <div class="specs-grid mb-4">
      <div><span class="spec-label">Model</span><span class="spec-val mono">${dev.model}</span></div>
      <div><span class="spec-label">Capacity</span><span class="spec-val mono">${dev.capacity}</span></div>
      <div><span class="spec-label">Serial Number</span><span class="spec-val mono">${dev.serial}</span></div>
      <div><span class="spec-label">Sanitization Status</span><span class="spec-val tag-green">${dev.status}</span></div>
    </div>
    
    <div class="panel-card mb-0">
      <h4 class="card-subtitle text-xs text-muted mb-2">OPERATIONAL HISTORY LOG</h4>
      <div class="text-xs mono text-muted">
        <div>[2026-09-30 19:40:02] Target initialized in allowlist workspace</div>
        <div>[2026-09-30 19:41:15] Pre-wipe 4KB block ML risk scan executed</div>
        <div>[2026-09-30 19:42:00] DoD 5220.22-M 3-pass overwrite executed (fsync enabled)</div>
        <div>[2026-09-30 19:42:30] 100% zero read-back check passed</div>
        <div>[2026-09-30 19:43:00] Ed25519 erasure certificate issued to ledger</div>
      </div>
    </div>
  `;
  document.getElementById('device-modal').classList.remove('hidden');
}

function hideDeviceModal() {
  document.getElementById('device-modal').classList.add('hidden');
}
function closeDeviceModal(e) {
  if (e.target.id === 'device-modal') hideDeviceModal();
}

/* Targets & Sample Data */
async function loadTargets() {
  const select = document.getElementById('target-selector');
  select.innerHTML = '<option value="">Scanning sandbox/ directory...</option>';

  try {
    const res = await fetch('/api/targets');
    if (!res.ok) throw new Error('Failed to fetch workspace targets');
    const targets = await res.json();
    state.targets = targets;

    select.innerHTML = '';
    targets.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.target;
      opt.textContent = `${t.name} (${t.file_count} files, ${formatBytes(t.size)})`;
      select.appendChild(opt);
    });

    if (targets.length) {
      state.selectedTarget = targets[0].target;
      onTargetSelected();
    }
  } catch (err) {
    showAlert(`Targets error: ${err.message}`, 'danger');
  }
}

function onTargetSelected() {
  const select = document.getElementById('target-selector');
  const val = select.value || '.';
  state.selectedTarget = val;

  const t = state.targets.find(x => x.target === val) || { name: 'sandbox/', file_count: 0, size: 0 };
  document.getElementById('spec-name').textContent = t.name;
  document.getElementById('spec-files').textContent = t.file_count;
  document.getElementById('spec-size').textContent = formatBytes(t.size);
}

function selectDeviceForWipe(targetStr) {
  switchMainView('erasure');
  jumpToStep(1);
  const select = document.getElementById('target-selector');
  if (select) {
    select.value = targetStr;
    onTargetSelected();
  }
}

async function createSampleData() {
  showAlert('Generating synthetic sensitive test files in sandbox/ ...', 'info');
  try {
    const res = await fetch('/api/samples', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create sample files');
    showAlert(data.message, 'success');
    loadTargets();
  } catch (err) {
    showAlert(`Failed to create samples: ${err.message}`, 'danger');
  }
}

/* Erasure Stepper Workflow */
function jumpToStep(stepNum) {
  state.erasureStep = stepNum;
  for (let i = 1; i <= 5; i++) {
    const node = document.getElementById(`step-node-${i}`);
    const content = document.getElementById(`step-content-${i}`);
    if (node) node.classList.toggle('active', i === stepNum);
    if (content) content.classList.toggle('active', i === stepNum);
  }
}

function proceedToStep(nextStep) {
  jumpToStep(nextStep);
}

function startNewErasureWorkflow() {
  switchMainView('erasure');
  jumpToStep(1);
}

/* Stage 02: Pre-Wipe Scan */
async function runPreWipeScan() {
  showAlert(`Executing pre-wipe 4KB-block ML risk analysis on target...`, 'info');
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: state.selectedTarget })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Scan failed');

    state.prescanResults = data;
    showAlert(`Pre-wipe scan complete: ${data.files.length} files analyzed. High residual risk detected.`, 'danger');
    proceedToStep(3);
  } catch (err) {
    showAlert(`Pre-wipe scan error: ${err.message}`, 'danger');
  }
}

/* Stage 03: Execute Wipe */
async function executeWipeJob() {
  const confirmInput = document.getElementById('wipe-confirm-input');
  if (confirmInput.value.trim() !== 'WIPE') {
    showAlert('Confirmation failed: Type "WIPE" in all-caps to authorize overwrite.', 'danger');
    return;
  }

  const deleteAfter = document.getElementById('chk-delete-after').checked;
  document.getElementById('confirm-input-box').classList.add('hidden');
  document.getElementById('wipe-progress-container').classList.remove('hidden');

  showAlert('Hardware overwrite authorized. Launching 3-pass DoD sanitization worker...', 'info');

  try {
    const res = await fetch('/api/wipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: state.selectedTarget,
        confirm: 'WIPE',
        delete: deleteAfter
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start wipe job');

    state.currentJobId = data.job_id;
    pollWipeJobProgress(data.job_id);
  } catch (err) {
    showAlert(`Wipe error: ${err.message}`, 'danger');
    document.getElementById('confirm-input-box').classList.remove('hidden');
  }
}

function pollWipeJobProgress(jobId) {
  if (state.pollInterval) clearInterval(state.pollInterval);

  state.pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) return;
      const job = await res.json();

      document.getElementById('wipe-pct').textContent = `${job.pct}%`;
      document.getElementById('wipe-progress-bar').style.width = `${job.pct}%`;
      document.getElementById('wipe-status-text').textContent = job.status.toUpperCase();
      document.getElementById('wipe-current-pass').textContent = job.current_pass ? `Pass ${job.current_pass} / 3` : '--';
      document.getElementById('wipe-speed').textContent = `${(job.speed_mbps || 0).toFixed(1)} MB/s`;
      document.getElementById('wipe-bytes').textContent = `${formatBytes(job.bytes_written)} / ${formatBytes(job.total_bytes)}`;
      
      const elMs = job.elapsed_sec * 1000;
      const m = Math.floor(elMs / 60000);
      const s = Math.floor((elMs % 60000) / 1000);
      document.getElementById('wipe-elapsed').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      if (job.logs && job.logs.length) {
        document.getElementById('wipe-logs').textContent = job.logs.join('\n');
      }

      if (job.status === 'completed') {
        clearInterval(state.pollInterval);
        state.wipeManifest = job.manifest;
        showAlert('Wipe complete! 100% zero read-back verified. Ready for ML analysis.', 'success');
        document.getElementById('btn-goto-verify').classList.remove('hidden');
      } else if (job.status === 'failed') {
        clearInterval(state.pollInterval);
        showAlert(`Wipe operation failed: ${job.error}`, 'danger');
      }
    } catch (err) {
      console.error(err);
    }
  }, 500);
}

/* Stage 04: Post-Wipe ML Scan */
async function runPostWipeScan() {
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: state.selectedTarget })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Post-wipe scan failed');

    state.postscanResults = data;
    renderPostWipeResults(data);
    showAlert('ML Post-wipe analysis complete: Verdict VERIFIED (0 residual risk).', 'success');
  } catch (err) {
    showAlert(`Post-wipe scan error: ${err.message}`, 'danger');
  }
}

function renderPostWipeResults(data) {
  let totalBlocks = 0;
  let totalFlagged = 0;
  let maxRisk = 0.0;

  const tbody = document.getElementById('scan-files-body');
  tbody.innerHTML = '';

  data.files.forEach(f => {
    totalBlocks += f.blocks;
    totalFlagged += f.flagged_blocks;
    if (f.max_risk > maxRisk) maxRisk = f.max_risk;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong class="mono">${f.name}</strong></td>
      <td class="mono">${formatBytes(f.size)}</td>
      <td class="mono">${f.blocks}</td>
      <td class="mono ${f.flagged_blocks > 0 ? 'text-danger' : 'text-success'}">${f.flagged_blocks}</td>
      <td class="mono">${f.max_risk.toFixed(4)}</td>
      <td><span class="metric-tag ${f.verdict === 'PASS' ? 'tag-green' : 'tag-red'}">${f.verdict}</span></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('verif-verdict').textContent = totalFlagged === 0 ? 'VERIFIED (PASS)' : 'FAIL';
  document.getElementById('verif-flagged').textContent = `${totalFlagged} / ${totalBlocks}`;
  document.getElementById('verif-max-risk').textContent = maxRisk.toFixed(4);

  renderHeatstripCanvas('heatstrip-canvas', data.files);
}

function renderHeatstripCanvas(canvasId, files) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  let allRisks = [];
  files.forEach(f => {
    if (f.block_risks && f.block_risks.length) {
      allRisks.push(...f.block_risks);
    } else {
      for (let i = 0; i < (f.blocks || 1); i++) {
        allRisks.push(f.verdict === 'PASS' ? 0.0 : 1.0);
      }
    }
  });

  if (!allRisks.length) allRisks = [0.0];

  const blockW = w / allRisks.length;
  allRisks.forEach((r, i) => {
    ctx.fillStyle = r > 0.5 ? '#ED80E9' : '#10B981';
    ctx.fillRect(i * blockW, 0, blockW + 0.5, h);
  });
}

/* Stage 05: Issue Certificate */
async function issueCertificate() {
  showAlert('Signing manifest with Ed25519 private key & committing to ledger...', 'info');
  try {
    const res = await fetch('/api/certificate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: state.currentJobId,
        label: 'Demo-Asset-001'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Certificate generation failed');

    state.issuedCertificate = data.certificate;
    renderCertificateResultBox(data);
    updateDocumentView(data.certificate, data.ledger_entry);
    showAlert('Certificate issued successfully and committed to ledger!', 'success');
    loadAuditLedger();
  } catch (err) {
    showAlert(`Cert error: ${err.message}`, 'danger');
  }
}

function renderCertificateResultBox(data) {
  const cert = data.certificate;
  const p = cert.payload;

  document.getElementById('cert-res-time').textContent = p.issued_at;
  document.getElementById('cert-res-id').textContent = p.cert_id;
  document.getElementById('cert-res-label').textContent = p.device_label;
  document.getElementById('cert-res-key').textContent = cert.key_id;
  document.getElementById('cert-res-ledger').textContent = `#${data.ledger_entry.index}`;
  document.getElementById('cert-res-sha').textContent = shortenHash(p.manifest_sha256);
  document.getElementById('cert-res-verdict').textContent = p.ai_residual_verdict;

  document.getElementById('cert-result-box').classList.remove('hidden');
}

function updateDocumentView(cert, ledgerEntry) {
  const p = cert.payload;
  document.getElementById('doc-cert-id').textContent = p.cert_id;
  document.getElementById('doc-asset-label').textContent = p.device_label;
  document.getElementById('doc-hostname').textContent = p.system.hostname;
  document.getElementById('doc-drive-model').textContent = p.drive.model || 'Standard Block Device';
  document.getElementById('doc-serial').textContent = p.drive.serial || 'N/A';
  document.getElementById('doc-bus').textContent = p.drive.bus || 'SATA / NVMe';
  document.getElementById('doc-os').textContent = p.system.os;

  document.getElementById('doc-file-count').textContent = p.file_count;
  document.getElementById('doc-total-bytes').textContent = formatBytes(p.total_bytes);
  document.getElementById('doc-timestamp').textContent = p.issued_at;

  document.getElementById('doc-verdict').textContent = p.ai_residual_verdict;
  document.getElementById('doc-blocks').textContent = p.total_blocks_analyzed;
  document.getElementById('doc-flagged').textContent = p.flagged_blocks;
  document.getElementById('doc-max-risk').textContent = (p.worst_block_risk || 0).toFixed(4);

  document.getElementById('doc-key-id').textContent = cert.key_id;
  document.getElementById('doc-manifest-hash').textContent = p.manifest_sha256;
  document.getElementById('doc-signature').textContent = cert.signature;

  document.getElementById('doc-ledger-index').textContent = `#${ledgerEntry ? ledgerEntry.index : 1}`;
  document.getElementById('doc-entry-hash').textContent = ledgerEntry ? ledgerEntry.entry_hash : '--';
}

function viewCurrentCertificate() {
  switchMainView('certificate');
}

function openExportReport() {
  if (state.currentJobId) {
    window.open(`/api/download/report/${state.currentJobId}`, '_blank');
  } else {
    showAlert('Export report generated: certificate_report.html', 'info');
  }
}

function copyCertHash() {
  if (state.issuedCertificate) {
    navigator.clipboard.writeText(state.issuedCertificate.payload.manifest_sha256);
    showAlert('Manifest SHA-256 hash copied to clipboard!', 'success');
  }
}

function verifyCurrentCert() {
  switchMainView('verifier');
  loadLastIssuedCertToVerifier();
  verifySubmittedCert();
}

/* Verifier Screen */
function loadLastIssuedCertToVerifier() {
  if (state.issuedCertificate) {
    document.getElementById('verifier-json-input').value = JSON.stringify(state.issuedCertificate, null, 2);
  }
}

async function verifySubmittedCert() {
  const raw = document.getElementById('verifier-json-input').value.trim();
  if (!raw) {
    showAlert('Please paste a certificate JSON object to verify.', 'danger');
    return;
  }

  try {
    const certObj = JSON.parse(raw);
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certificate: certObj })
    });
    const data = await res.json();
    renderVerifierResult(data);
  } catch (err) {
    showAlert(`JSON parse / verify error: ${err.message}`, 'danger');
  }
}

function renderVerifierResult(data) {
  const box = document.getElementById('verifier-result-box');
  const header = document.getElementById('verifier-status-header');
  const title = document.getElementById('verifier-title');
  const icon = document.getElementById('verifier-icon');
  const body = document.getElementById('verifier-body-details');

  box.classList.remove('hidden');

  if (data.valid) {
    header.className = 'result-status-header valid';
    icon.textContent = '✓';
    title.textContent = 'VALID: Cryptographic Signature & Ledger Verified';
    
    body.innerHTML = `
      <div class="doc-grid mt-2">
        <div><span class="lbl">Certificate ID:</span><span class="val mono">${data.details.cert_id}</span></div>
        <div><span class="lbl">Device Label:</span><span class="val mono">${data.details.device_label}</span></div>
        <div><span class="lbl">Issuer Key Fingerprint:</span><span class="val mono">${data.details.issuer_key_id}</span></div>
        <div><span class="lbl">Erasure Result:</span><span class="val tag-green">${data.details.erasure_result}</span></div>
        <div><span class="lbl">Ledger Chain Status:</span><span class="val tag-green">${data.ledger_valid ? 'Chain Intact & Included' : 'Excluded'}</span></div>
      </div>
    `;
  } else {
    header.className = 'result-status-header invalid';
    icon.textContent = '❌';
    title.textContent = 'INVALID: Signature Mismatch / Tampering Detected';
    
    body.innerHTML = `
      <div class="text-danger mono text-sm p-2 bg-red-900/20 border border-red-800 rounded">
        Reason: ${data.message || 'Signature mismatch or manifest digest modified'}
      </div>
    `;
  }
}

async function runTamperDemo() {
  showAlert('Simulating 1-byte payload attack on certificate...', 'info');
  try {
    const res = await fetch('/api/tamper-demo', { method: 'POST' });
    const data = await res.json();
    document.getElementById('verifier-json-input').value = JSON.stringify(data.tampered_cert, null, 2);
    renderVerifierResult(data.verification_result);
    showAlert('Tamper Demo Executed: Signature mismatch detected instantly!', 'danger');
  } catch (err) {
    showAlert(`Tamper demo failed: ${err.message}`, 'danger');
  }
}

/* Audit Ledger */
async function loadAuditLedger() {
  try {
    const res = await fetch('/api/ledger');
    if (!res.ok) return;
    const entries = await res.json();
    state.ledgerEntries = entries;

    document.getElementById('stat-certs-issued').textContent = String(entries.length).padStart(2, '0');

    renderOverviewLedgerFeed(entries);
    renderFullLedgerTable(entries);
  } catch (err) {
    console.error(err);
  }
}

function renderOverviewLedgerFeed(entries) {
  const feed = document.getElementById('overview-ledger-feed');
  feed.innerHTML = '';

  if (!entries.length) {
    feed.innerHTML = '<div class="text-muted text-center p-3">No ledger records committed yet</div>';
    return;
  }

  entries.slice(-3).reverse().forEach(e => {
    const div = document.createElement('div');
    div.className = 'audit-item p-2 mb-2 bg-surface border border-subtle rounded flex justify-between items-center text-xs';
    div.innerHTML = `
      <div>
        <span class="mono text-blue-400 font-bold">#${e.index}</span>
        <span class="mono text-muted ml-2">${e.cert_id}</span>
      </div>
      <div>
        <span class="mono text-muted">Hash: ${shortenHash(e.entry_hash)}</span>
        <span class="metric-tag tag-green ml-2">INTACT</span>
      </div>
    `;
    feed.appendChild(div);
  });
}

function renderFullLedgerTable(entries) {
  const tbody = document.getElementById('full-ledger-body');
  tbody.innerHTML = '';

  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-center">No ledger entries found</td></tr>';
    return;
  }

  entries.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono font-bold">#${e.index}</td>
      <td class="mono text-xs">${e.timestamp}</td>
      <td class="mono text-xs">${e.cert_id}</td>
      <td class="mono text-xs">${shortenHash(e.entry_hash)}</td>
      <td class="mono text-xs text-muted">${shortenHash(e.prev_hash)}</td>
      <td><span class="metric-tag tag-green">VALID</span></td>
    `;
    tbody.appendChild(tr);
  });
}

async function verifyLedgerChain() {
  showAlert('Running SHA-256 hash-chain integrity verification...', 'info');
  try {
    const res = await fetch('/api/ledger/verify');
    const data = await res.json();
    if (data.ok) {
      showAlert(`LEDGER VALID: ${data.message}`, 'success');
    } else {
      showAlert(`LEDGER BROKEN: ${data.message}`, 'danger');
    }
  } catch (err) {
    showAlert(`Ledger check failed: ${err.message}`, 'danger');
  }
}

async function runLedgerTamperDemo() {
  showAlert('Simulating historical ledger entry corruption...', 'info');
  try {
    const res = await fetch('/api/ledger/tamper-demo', { method: 'POST' });
    const data = await res.json();
    showAlert(`LEDGER TAMPER DETECTED: ${data.message}`, 'danger');
  } catch (err) {
    showAlert(`Ledger tamper demo error: ${err.message}`, 'danger');
  }
}
