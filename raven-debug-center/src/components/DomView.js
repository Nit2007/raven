/**
 * RAVEN Debug Center — DOM Analysis View (M2)
 * Displays real DOM analysis data: total elements, interactive vs visible, roles, hierarchy tree, attributes, and bounds.
 * Does NOT hardcode example website elements.
 */

import { store } from '../models/store.js';

export function renderDomView(container) {
  let searchTerm = '';
  let filterRole = 'all';

  function update() {
    const state = store.getState();
    const dom = state.dom;
    const hasData = (dom.totalElements > 0 || (dom.tree && dom.tree.length > 0));

    // Filter elements
    const elements = dom.tree || [];
    const filteredElements = elements.filter(el => {
      const matchSearch = !searchTerm ||
        (el.tag && el.tag.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (el.text && el.text.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (el.target_id && el.target_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (el.role && el.role.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchRole = filterRole === 'all' || (el.role && el.role.toLowerCase() === filterRole.toLowerCase());
      return matchSearch && matchRole;
    });

    const roleKeys = Object.keys(dom.roles || {});

    container.innerHTML = `
      <div class="panel-container">
        <div class="panel-section-header">
          <div>
            <div class="panel-title">
              <span>🌳</span>
              <span>M2 — DOM Analysis & Interactive Index</span>
            </div>
            <div class="panel-subtitle">
              Inspect semantic nodes, ARIA roles, interactable targets, and element bounding boxes parsed from the page.
            </div>
          </div>
          <span class="badge-pill ${hasData ? 'badge-success' : 'badge-waiting'}">
            ${hasData ? `${dom.totalElements} ELEMENTS INDEXED` : 'WAITING FOR M2'}
          </span>
        </div>

        <!-- Metric Stat Counters -->
        <div class="stat-group-row">
          <div class="stat-box">
            <span class="stat-box-label">Total Elements</span>
            <span class="stat-box-value">${dom.totalElements || 0}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Interactive Elements</span>
            <span class="stat-box-value cyan">${dom.interactiveElements || 0}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Visible Elements</span>
            <span class="stat-box-value emerald">${dom.visibleElements || 0}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Unique Roles</span>
            <span class="stat-box-value violet">${roleKeys.length}</span>
          </div>
        </div>

        ${!hasData ? `
          <div class="empty-state">
            <div class="empty-state-icon">🌳</div>
            <div class="empty-state-title">No DOM Analysis Data Available</div>
            <div class="empty-state-desc">
              When RAVEN's M2 DOM Analysis milestone traverses the target page, interactive nodes, element roles, and bounding coordinates will be rendered here.
            </div>
          </div>
        ` : `
          <!-- DOM Inspector Card -->
          <div class="debug-card">
            <div class="filter-bar-row">
              <input
                type="text"
                class="search-input-cyber"
                id="dom-search-input"
                placeholder="Search by tag, text, ID, or role..."
                value="${searchTerm}"
              />
              <div style="display: flex; align-items: center; gap: 8px;">
                <label style="font-size: 11.5px; color: var(--text-muted); font-family: var(--font-mono);">Role:</label>
                <select id="dom-role-select" class="form-input" style="padding: 4px 8px; font-size: 11.5px;">
                  <option value="all">All Roles</option>
                  ${roleKeys.map(r => `<option value="${r}" ${filterRole === r ? 'selected' : ''}>${r} (${dom.roles[r]})</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="dom-table-container">
              <table class="cyber-table">
                <thead>
                  <tr>
                    <th>Target ID</th>
                    <th>Tag</th>
                    <th>Role</th>
                    <th>Label / Text Content</th>
                    <th>Attributes</th>
                    <th>Bounding Box</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredElements.length === 0 ? `
                    <tr>
                      <td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">
                        No DOM elements matching query.
                      </td>
                    </tr>
                  ` : filteredElements.map(el => `
                    <tr>
                      <td><span class="badge-pill" style="color: var(--text-cyan);">${el.target_id || el.id || '—'}</span></td>
                      <td><span class="tag-badge">&lt;${el.tag || el.tagName || 'node'}&gt;</span></td>
                      <td>${el.role ? `<span class="role-badge">${el.role}</span>` : '<span style="color: var(--text-muted);">none</span>'}</td>
                      <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${el.text || ''}">
                        ${el.text || el.label || el.placeholder || '<span style="color: var(--text-muted); font-style: italic;">(empty)</span>'}
                      </td>
                      <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px;">
                        ${el.attributes ? JSON.stringify(el.attributes) : (el.type ? `type="${el.type}"` : '—')}
                      </td>
                      <td style="font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted);">
                        ${el.bounds ? `[${el.bounds.x}, ${el.bounds.y}, ${el.bounds.width}x${el.bounds.height}]` : '—'}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `}
      </div>
    `;

    // Event listeners
    const searchInput = container.querySelector('#dom-search-input');
    searchInput?.addEventListener('input', (e) => {
      searchTerm = e.target.value;
      update();
    });

    const roleSelect = container.querySelector('#dom-role-select');
    roleSelect?.addEventListener('change', (e) => {
      filterRole = e.target.value;
      update();
    });
  }

  store.subscribe(update);
  update();
}
