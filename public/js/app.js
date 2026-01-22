// State for screenshot comparison
let currentScreenshots = { old: null, new: null };
let showingBefore = false;
let currentZoom = 100;
let commonPages = [];
let selectedQuickPages = new Set();
let currentAddPageCompetitor = null;

async function loadDashboard() {
  try {
    const [dashboardRes, commonPagesRes] = await Promise.all([
      fetch('/api/dashboard'),
      fetch('/api/competitors/common-pages')
    ]);

    const data = await dashboardRes.json();
    commonPages = await commonPagesRes.json();

    updateStats(data.stats, data.competitors.length);
    renderCompetitors(data.competitors);
    renderChanges(data.recentChanges);
    renderQuickAddButtons();
  } catch (error) {
    console.error('Failed to load dashboard:', error);
  }
}

function updateStats(stats, competitorCount) {
  document.getElementById('stat-competitors').textContent = competitorCount;
  document.getElementById('stat-pages').textContent = stats.total_pages || 0;
  document.getElementById('stat-changes-24h').textContent = stats.changes_24h || 0;
  document.getElementById('stat-changes-7d').textContent = stats.changes_7d || 0;
}

function renderCompetitors(competitors) {
  const container = document.getElementById('competitors-list');

  if (competitors.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No competitors added yet.</p>
        <p>Click "Add Competitor" to start monitoring.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = competitors.map(c => `
    <div class="competitor-card" id="competitor-${c.id}">
      <div class="competitor-header" onclick="toggleCompetitor(${c.id})">
        <div class="competitor-info">
          <h3>${escapeHtml(c.name)}</h3>
          <div class="meta">Last checked: ${c.last_checked ? formatDate(c.last_checked) : 'Never'}</div>
        </div>
        <div class="competitor-toggle">
          <span class="page-count">${c.pages?.length || 0} page${c.pages?.length !== 1 ? 's' : ''}</span>
          <span class="expand-icon">▼</span>
        </div>
      </div>
      <div class="competitor-body">
        <div class="competitor-actions">
          <button class="btn btn-primary btn-small" onclick="checkCompetitorPages(${c.id}, event)">Check All Pages</button>
          <button class="btn btn-secondary btn-small" onclick="openAddPageModal(${c.id}, '${escapeHtml(c.name)}')">+ Add Page</button>
          <button class="btn btn-danger btn-small" onclick="deleteCompetitor(${c.id}, '${escapeHtml(c.name)}')">Delete</button>
        </div>
        <div class="pages-section">
          <h4>Monitored Pages</h4>
          ${renderPages(c.id, c.pages || [])}
        </div>
      </div>
    </div>
  `).join('');
}

function renderPages(competitorId, pages) {
  if (pages.length === 0) {
    return '<p style="color: #86868b; font-size: 0.875rem;">No pages configured. Add a page to start monitoring.</p>';
  }

  return pages.map(p => `
    <div class="page-item">
      <div class="page-info">
        <div class="label">${escapeHtml(p.label)}</div>
        <div class="url">${escapeHtml(p.url)}</div>
        <div class="last-checked">Checked: ${p.last_checked ? formatDate(p.last_checked) : 'Never'}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-small" onclick="checkPage(${competitorId}, ${p.id}, event)">Check</button>
        <button class="btn btn-secondary btn-small" onclick="viewPageScreenshots(${competitorId}, ${p.id}, '${escapeHtml(p.label)}')">Screenshots</button>
        <button class="btn btn-danger btn-small" onclick="deletePage(${competitorId}, ${p.id}, '${escapeHtml(p.label)}')">×</button>
      </div>
    </div>
  `).join('');
}

function toggleCompetitor(id) {
  const card = document.getElementById(`competitor-${id}`);
  card.classList.toggle('expanded');
}

function renderChanges(changes) {
  const container = document.getElementById('changes-list');

  if (changes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No changes detected yet.</p>
        <p>Changes will appear here when competitors update their pages.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = changes.map(c => `
    <div class="change-card" onclick="showChangeDetail(${c.id})">
      <div class="change-header">
        <h3>${escapeHtml(c.competitor_name)}${c.page_label ? ' - ' + escapeHtml(c.page_label) : ''}</h3>
        <span class="badge badge-${c.significance}">${c.significance}</span>
      </div>
      <div class="change-summary">${escapeHtml(c.change_summary)}</div>
      <div class="change-meta">${formatDate(c.detected_at)}</div>
    </div>
  `).join('');
}

function renderQuickAddButtons() {
  const container = document.getElementById('quick-add-buttons');
  if (container) {
    container.innerHTML = commonPages.map(p => `
      <button type="button" class="quick-add-btn" data-path="${p.path}" data-label="${p.label}" onclick="toggleQuickAdd(this)">
        ${p.label}
      </button>
    `).join('');
  }
}

function toggleQuickAdd(btn) {
  btn.classList.toggle('selected');
  const path = btn.dataset.path;
  const label = btn.dataset.label;

  if (btn.classList.contains('selected')) {
    selectedQuickPages.add(JSON.stringify({ path, label }));
    addPageInputFromQuick(path, label);
  } else {
    selectedQuickPages.delete(JSON.stringify({ path, label }));
    removePageInputByPath(path);
  }
}

function addPageInputFromQuick(path, label) {
  const baseUrl = document.getElementById('base-url').value;
  const url = baseUrl ? new URL(path, baseUrl).href : path;

  const container = document.getElementById('pages-list');
  const row = document.createElement('div');
  row.className = 'page-input-row';
  row.dataset.path = path;
  row.innerHTML = `
    <input type="text" name="pageLabel" value="${label}" placeholder="Label">
    <input type="url" name="pageUrl" value="${url}" placeholder="URL">
    <button type="button" class="remove-btn" onclick="removePageInput(this, '${path}')">×</button>
  `;
  container.appendChild(row);
}

function removePageInputByPath(path) {
  const row = document.querySelector(`.page-input-row[data-path="${path}"]`);
  if (row) row.remove();
}

function addPageInput() {
  const container = document.getElementById('pages-list');
  const row = document.createElement('div');
  row.className = 'page-input-row';
  row.innerHTML = `
    <input type="text" name="pageLabel" placeholder="Label (e.g., Pricing)">
    <input type="url" name="pageUrl" placeholder="URL (e.g., https://example.com/pricing)">
    <button type="button" class="remove-btn" onclick="removePageInput(this)">×</button>
  `;
  container.appendChild(row);
}

function removePageInput(btn, path) {
  btn.closest('.page-input-row').remove();
  if (path) {
    selectedQuickPages.delete(JSON.stringify({ path, label: '' }));
    const quickBtn = document.querySelector(`.quick-add-btn[data-path="${path}"]`);
    if (quickBtn) quickBtn.classList.remove('selected');
  }
}

// Update base URL and refresh quick-add pages
document.addEventListener('input', (e) => {
  if (e.target.id === 'base-url') {
    const baseUrl = e.target.value;
    document.querySelectorAll('.page-input-row[data-path]').forEach(row => {
      const path = row.dataset.path;
      const urlInput = row.querySelector('input[name="pageUrl"]');
      if (baseUrl && path) {
        try {
          urlInput.value = new URL(path, baseUrl).href;
        } catch (err) {
          // Invalid URL, ignore
        }
      }
    });
  }
});

function openAddModal() {
  selectedQuickPages.clear();
  document.getElementById('pages-list').innerHTML = '';
  document.getElementById('add-form').reset();
  renderQuickAddButtons();
  document.getElementById('add-modal').classList.add('active');
}

function closeAddModal() {
  document.getElementById('add-modal').classList.remove('active');
  selectedQuickPages.clear();
}

function openAddPageModal(competitorId, competitorName) {
  currentAddPageCompetitor = { id: competitorId, name: competitorName };
  document.getElementById('add-page-competitor-id').value = competitorId;
  document.getElementById('add-page-competitor-name').textContent = `Adding page to: ${competitorName}`;
  document.getElementById('add-page-form').reset();

  // Get competitor's base URL from their first page
  fetch(`/api/competitors/${competitorId}`)
    .then(res => res.json())
    .then(comp => {
      const baseUrl = comp.pages?.[0]?.url ? new URL(comp.pages[0].url).origin : '';
      renderQuickAddPageButtons(baseUrl);
    });

  document.getElementById('add-page-modal').classList.add('active');
}

function renderQuickAddPageButtons(baseUrl) {
  const container = document.getElementById('quick-add-page-buttons');
  if (container) {
    container.innerHTML = commonPages.map(p => `
      <button type="button" class="quick-add-btn" onclick="fillPageForm('${baseUrl}', '${p.path}', '${p.label}')">
        ${p.label}
      </button>
    `).join('');
  }
}

function fillPageForm(baseUrl, path, label) {
  document.getElementById('page-label').value = label;
  try {
    document.getElementById('page-url').value = new URL(path, baseUrl).href;
  } catch (e) {
    document.getElementById('page-url').value = baseUrl + path;
  }
}

function closeAddPageModal() {
  document.getElementById('add-page-modal').classList.remove('active');
  currentAddPageCompetitor = null;
}

function closeChangeModal() {
  document.getElementById('change-modal').classList.remove('active');
}

function closeScreenshotModal() {
  document.getElementById('screenshot-modal').classList.remove('active');
  currentScreenshots = { old: null, new: null };
}

async function addCompetitor(event) {
  event.preventDefault();

  const form = event.target;
  const name = document.getElementById('comp-name').value;

  // Collect pages from input rows
  const pageRows = document.querySelectorAll('.page-input-row');
  const pages = [];

  pageRows.forEach(row => {
    const label = row.querySelector('input[name="pageLabel"]').value;
    const url = row.querySelector('input[name="pageUrl"]').value;
    if (url) {
      pages.push({ label: label || 'Homepage', url });
    }
  });

  // If no pages added, use base URL as homepage
  if (pages.length === 0) {
    const baseUrl = document.getElementById('base-url').value;
    if (baseUrl) {
      pages.push({ label: 'Homepage', url: baseUrl });
    }
  }

  if (pages.length === 0) {
    alert('Please add at least one page to monitor');
    return;
  }

  try {
    const res = await fetch('/api/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pages })
    });

    if (!res.ok) {
      const error = await res.json();
      alert(error.error || 'Failed to add competitor');
      return;
    }

    closeAddModal();
    loadDashboard();
  } catch (error) {
    alert('Failed to add competitor');
  }
}

async function addPageToCompetitor(event) {
  event.preventDefault();

  const competitorId = document.getElementById('add-page-competitor-id').value;
  const url = document.getElementById('page-url').value;
  const label = document.getElementById('page-label').value || 'Custom Page';

  try {
    const res = await fetch(`/api/competitors/${competitorId}/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, label })
    });

    if (!res.ok) {
      const error = await res.json();
      alert(error.error || 'Failed to add page');
      return;
    }

    closeAddPageModal();
    loadDashboard();
  } catch (error) {
    alert('Failed to add page');
  }
}

async function checkCompetitorPages(id, event) {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Checking...';

  try {
    const res = await fetch(`/api/competitors/${id}/check`, { method: 'POST' });
    const result = await res.json();

    alert(`Checked ${result.checked} page(s). ${result.changes} change(s) found.`);
    loadDashboard();
  } catch (error) {
    alert('Check failed: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check All Pages';
  }
}

async function checkPage(competitorId, pageId, event) {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const res = await fetch(`/api/competitors/${competitorId}/pages/${pageId}/check`, { method: 'POST' });
    const result = await res.json();

    if (result.change) {
      alert(`Changes detected! Significance: ${result.change.significance}`);
    } else if (result.isFirstSnapshot) {
      alert('First snapshot captured!');
    } else {
      alert('No changes detected.');
    }

    loadDashboard();
  } catch (error) {
    alert('Check failed: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check';
  }
}

async function checkAll() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Checking...';

  try {
    const res = await fetch('/api/check-all', { method: 'POST' });
    const result = await res.json();
    alert(`Checked ${result.checked} page(s) across ${result.competitors} competitor(s). ${result.changes} change(s) found.`);
    loadDashboard();
  } catch (error) {
    alert('Check failed: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check All Now';
  }
}

async function deleteCompetitor(id, name) {
  if (!confirm(`Delete ${name}? This will remove all pages, snapshots, and change history.`)) {
    return;
  }

  try {
    await fetch(`/api/competitors/${id}`, { method: 'DELETE' });
    loadDashboard();
  } catch (error) {
    alert('Failed to delete competitor');
  }
}

async function deletePage(competitorId, pageId, label) {
  if (!confirm(`Delete page "${label}"? This will remove all snapshots and change history for this page.`)) {
    return;
  }

  try {
    await fetch(`/api/competitors/${competitorId}/pages/${pageId}`, { method: 'DELETE' });
    loadDashboard();
  } catch (error) {
    alert('Failed to delete page');
  }
}

async function showChangeDetail(changeId) {
  try {
    const [changeRes, screenshotsRes] = await Promise.all([
      fetch(`/api/changes/${changeId}`),
      fetch(`/api/changes/${changeId}/screenshots`)
    ]);

    const change = await changeRes.json();
    const screenshots = await screenshotsRes.json();

    let screenshotBtn = '';
    if (screenshots.old && screenshots.new) {
      screenshotBtn = `<button class="btn btn-secondary" style="margin-top: 16px;" onclick="showChangeScreenshots(${changeId})">View Screenshot Comparison</button>`;
    }

    const pageInfo = change.page_label ? ` - ${escapeHtml(change.page_label)}` : '';

    document.getElementById('change-detail').innerHTML = `
      <h2>Change Analysis</h2>
      <p style="color: #86868b; margin-bottom: 8px;">${escapeHtml(change.competitor_name)}${pageInfo}</p>
      <p style="color: #86868b; margin-bottom: 20px;">${formatDate(change.detected_at)}</p>
      <p><strong>Summary:</strong> ${escapeHtml(change.change_summary)}</p>
      <div style="margin-top: 20px;">
        <strong>AI Analysis:</strong>
        <div class="analysis-content">${escapeHtml(change.ai_analysis || 'No analysis available')}</div>
      </div>
      ${screenshotBtn}
    `;

    document.getElementById('change-modal').classList.add('active');
  } catch (error) {
    alert('Failed to load change details');
  }
}

async function viewPageScreenshots(competitorId, pageId, label) {
  try {
    const res = await fetch(`/api/competitors/${competitorId}/pages/${pageId}/screenshots`);
    const screenshots = await res.json();

    document.getElementById('screenshot-title').textContent = `Screenshots: ${label}`;

    if (screenshots.length === 0) {
      document.getElementById('screenshot-content').innerHTML = `
        <div class="no-screenshots">
          <p>No screenshots available yet.</p>
          <p>Screenshots are captured when you check a page.</p>
        </div>
      `;
      document.getElementById('screenshot-modal').classList.add('active');
      return;
    }

    if (screenshots.length === 1) {
      currentScreenshots = { old: null, new: screenshots[0] };
    } else {
      currentScreenshots = { old: screenshots[1], new: screenshots[0] };
    }

    setupScreenshotViewer();
    document.getElementById('screenshot-modal').classList.add('active');
  } catch (error) {
    alert('Failed to load screenshots');
  }
}

async function showChangeScreenshots(changeId) {
  try {
    closeChangeModal();

    const res = await fetch(`/api/changes/${changeId}/screenshots`);
    const screenshots = await res.json();

    document.getElementById('screenshot-title').textContent = 'Screenshot Comparison';

    currentScreenshots = {
      old: screenshots.old,
      new: screenshots.new
    };

    setupScreenshotViewer();
    document.getElementById('screenshot-modal').classList.add('active');
  } catch (error) {
    alert('Failed to load screenshots');
  }
}

function setupScreenshotViewer() {
  const content = document.getElementById('screenshot-content');
  currentZoom = 100;

  if (!currentScreenshots.new) {
    content.innerHTML = `
      <div class="no-screenshots">
        <p>No screenshots available.</p>
      </div>
    `;
    return;
  }

  if (!currentScreenshots.old) {
    content.innerHTML = `
      <div class="screenshot-toolbar">
        <div></div>
        <div class="zoom-controls">
          <button class="zoom-btn" onclick="zoomOut()">-</button>
          <span class="zoom-level" id="zoom-level">100%</span>
          <button class="zoom-btn" onclick="zoomIn()">+</button>
          <button class="zoom-btn" onclick="resetZoom()">Reset</button>
          <button class="open-fullsize" onclick="openFullSize('${currentScreenshots.new.url}')">
            Open Full Size ↗
          </button>
        </div>
      </div>
      <div class="toggle-view">
        <p style="color: #86868b; margin-bottom: 16px;">Only one snapshot available (no comparison yet)</p>
        <div class="zoomable-container">
          <img class="zoomable-img" id="single-img" src="${currentScreenshots.new.url}" alt="Screenshot" onclick="openFullSize('${currentScreenshots.new.url}')">
        </div>
        <p class="screenshot-date">Captured: ${formatDate(currentScreenshots.new.captured_at)}</p>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="screenshot-toolbar">
      <div class="screenshot-tabs">
        <button class="tab-btn active" data-tab="slider" onclick="switchTab('slider')">Slider Compare</button>
        <button class="tab-btn" data-tab="side-by-side" onclick="switchTab('side-by-side')">Side by Side</button>
        <button class="tab-btn" data-tab="toggle" onclick="switchTab('toggle')">Toggle View</button>
      </div>
      <div class="zoom-controls">
        <button class="zoom-btn" onclick="zoomOut()">-</button>
        <span class="zoom-level" id="zoom-level">100%</span>
        <button class="zoom-btn" onclick="zoomIn()">+</button>
        <button class="zoom-btn" onclick="resetZoom()">Reset</button>
        <button class="open-fullsize" onclick="openCurrentFullSize()">
          Open Full Size ↗
        </button>
      </div>
    </div>

    <div class="screenshot-viewer" id="viewer-slider">
      <div class="comparison-container">
        <div class="zoomable-container" style="max-height: 75vh;">
          <div class="comparison-wrapper" id="comparison-wrapper">
            <img id="img-new" class="comparison-img zoomable-img" src="${currentScreenshots.new.url}" alt="After">
            <div class="comparison-overlay" id="overlay">
              <img id="img-old-overlay" class="comparison-img" src="${currentScreenshots.old.url}" alt="Before">
            </div>
            <input type="range" min="0" max="100" value="50" class="comparison-slider" id="comparison-slider">
            <div class="slider-line" id="slider-line"></div>
          </div>
        </div>
        <div class="comparison-labels">
          <span class="label-before">Before (${formatDate(currentScreenshots.old.captured_at)})</span>
          <span class="label-after">After (${formatDate(currentScreenshots.new.captured_at)})</span>
        </div>
        <div style="display: flex; gap: 12px; justify-content: center; margin-top: 8px;">
          <button class="btn btn-secondary btn-small" onclick="openFullSize('${currentScreenshots.old.url}')">Open Before ↗</button>
          <button class="btn btn-secondary btn-small" onclick="openFullSize('${currentScreenshots.new.url}')">Open After ↗</button>
        </div>
      </div>
    </div>

    <div class="screenshot-viewer hidden" id="viewer-side-by-side">
      <div class="side-by-side">
        <div class="screenshot-panel">
          <h4>Before</h4>
          <p class="screenshot-date">${formatDate(currentScreenshots.old.captured_at)}</p>
          <div class="img-wrapper zoomable-container">
            <img class="zoomable-img" src="${currentScreenshots.old.url}" alt="Before" onclick="openFullSize('${currentScreenshots.old.url}')" title="Click to open full size">
          </div>
        </div>
        <div class="screenshot-panel">
          <h4>After</h4>
          <p class="screenshot-date">${formatDate(currentScreenshots.new.captured_at)}</p>
          <div class="img-wrapper zoomable-container">
            <img class="zoomable-img" src="${currentScreenshots.new.url}" alt="After" onclick="openFullSize('${currentScreenshots.new.url}')" title="Click to open full size">
          </div>
        </div>
      </div>
    </div>

    <div class="screenshot-viewer hidden" id="viewer-toggle">
      <div class="toggle-view">
        <button class="btn btn-secondary" id="toggle-btn" onclick="toggleScreenshot()">Show Before</button>
        <div class="zoomable-container" id="toggle-container">
          <img id="img-toggle" class="zoomable-img" src="${currentScreenshots.new.url}" alt="Screenshot" onclick="openToggleFullSize()" title="Click to open full size">
        </div>
        <p class="screenshot-date" id="date-toggle">After: ${formatDate(currentScreenshots.new.captured_at)}</p>
      </div>
    </div>
  `;

  setupSlider();
  showingBefore = false;
}

function setupSlider() {
  const slider = document.getElementById('comparison-slider');
  const overlay = document.getElementById('overlay');
  const sliderLine = document.getElementById('slider-line');
  const imgNew = document.getElementById('img-new');
  const imgOldOverlay = document.getElementById('img-old-overlay');

  if (!slider) return;

  function updateSlider(value) {
    overlay.style.width = value + '%';
    sliderLine.style.left = value + '%';
  }

  slider.addEventListener('input', (e) => {
    updateSlider(e.target.value);
  });

  imgNew.addEventListener('load', () => {
    imgOldOverlay.style.width = imgNew.offsetWidth + 'px';
  });

  updateSlider(50);
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  document.querySelectorAll('.screenshot-viewer').forEach(viewer => {
    viewer.classList.add('hidden');
  });

  document.getElementById(`viewer-${tab}`).classList.remove('hidden');

  if (tab === 'slider') {
    setupSlider();
  }
}

function toggleScreenshot() {
  showingBefore = !showingBefore;
  const img = document.getElementById('img-toggle');
  const btn = document.getElementById('toggle-btn');
  const dateLabel = document.getElementById('date-toggle');

  if (showingBefore && currentScreenshots.old) {
    img.src = currentScreenshots.old.url;
    btn.textContent = 'Show After';
    dateLabel.textContent = `Before: ${formatDate(currentScreenshots.old.captured_at)}`;
  } else {
    img.src = currentScreenshots.new.url;
    btn.textContent = 'Show Before';
    dateLabel.textContent = `After: ${formatDate(currentScreenshots.new.captured_at)}`;
  }
}

function zoomIn() {
  currentZoom = Math.min(currentZoom + 25, 300);
  applyZoom();
}

function zoomOut() {
  currentZoom = Math.max(currentZoom - 25, 50);
  applyZoom();
}

function resetZoom() {
  currentZoom = 100;
  applyZoom();
}

function applyZoom() {
  document.getElementById('zoom-level').textContent = currentZoom + '%';

  document.querySelectorAll('.zoomable-img').forEach(img => {
    img.style.transform = `scale(${currentZoom / 100})`;
    img.style.transformOrigin = 'top left';
  });

  const wrapper = document.getElementById('comparison-wrapper');
  if (wrapper) {
    wrapper.style.transform = `scale(${currentZoom / 100})`;
    wrapper.style.transformOrigin = 'top left';
  }
}

function openFullSize(url) {
  window.open(url, '_blank');
}

function openCurrentFullSize() {
  if (currentScreenshots.new) {
    window.open(currentScreenshots.new.url, '_blank');
  }
}

function openToggleFullSize() {
  if (showingBefore && currentScreenshots.old) {
    window.open(currentScreenshots.old.url, '_blank');
  } else if (currentScreenshots.new) {
    window.open(currentScreenshots.new.url, '_blank');
  }
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Close modals on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAddModal();
    closeAddPageModal();
    closeChangeModal();
    closeScreenshotModal();
  }
});

// Close modals on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('active');
  }
});

document.addEventListener('DOMContentLoaded', loadDashboard);
