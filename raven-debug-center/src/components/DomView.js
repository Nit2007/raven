/**
 * RAVEN Debug Center — M2 Semantic DOM Perception & Spatial Analysis View
 * Integrates:
 * 1. Live M2 Status & Counts (Total, Visible, Interactive, Editable, Occluded, Latency)
 * 2. Hierarchical Collapsible DOM Tree
 * 3. Element Inspector (Semantic name, role, state, spatial coordinates, hierarchy path)
 * 4. Spatial Overlay: Real M2 bounding boxes overlaid onto M1 Screenshot
 * 5. Instant Trigger Button: Dispatches RAVEN_TRIGGER_M2 to analyze live tab
 */

import { store } from '../models/store.js';

export function renderDomView(container) {
  let searchTerm = '';
  let filterRole = 'all';
  let activeTabMode = 'tree'; // 'tree', 'spatial', 'table'
  let selectedElementId = null;
  let collapsedNodes = new Set();

  function update() {
    const state = store.getState();
    const dom = state.dom;
    const m2Milestone = state.milestones?.M2 || {};
    const elements = dom.tree || dom.elements || [];
    const hasData = elements.length > 0 || dom.totalElements > 0;

    // Derived counts
    const totalCount = dom.totalElements || elements.length;
    const visibleCount = dom.visibleElements || elements.filter(e => e.state?.visibility === 'VISIBLE').length;
    const interactiveCount = dom.interactiveElements || elements.filter(e => e.state?.interactive).length;
    const editableCount = dom.editableElements || elements.filter(e => e.state?.editable).length;
    const occludedCount = dom.occludedElements || elements.filter(e => e.occlusion === 'OCCLUDED').length;
    const latencyMs = dom.latencyMs || m2Milestone.executionTimeMs || 0;
    const perceptionCycleId = dom.perceptionCycleId || m2Milestone.details?.perceptionCycleId || '—';
    const status = m2Milestone.status || (hasData ? 'success' : 'waiting');

    // Filter elements for search & role
    const filteredElements = elements.filter(el => {
      const matchSearch = !searchTerm ||
        (el.tag && el.tag.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (el.text && el.text.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (el.semanticName && el.semanticName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (el.target_id && el.target_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (el.role && el.role.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchRole = filterRole === 'all' || (el.role && el.role.toLowerCase() === filterRole.toLowerCase());
      return matchSearch && matchRole;
    });

    const roleKeys = Object.keys(dom.roles || {});

    // Currently selected element (default to first interactive element if none selected)
    let selectedElement = elements.find(e => e.target_id === selectedElementId);
    if (!selectedElement && elements.length > 0) {
      selectedElement = elements.find(e => e.state?.interactive) || elements[0];
      selectedElementId = selectedElement?.target_id;
    }

    // Build parent-to-children tree mapping for hierarchy rendering
    const childrenMap = new Map();
    const rootElements = [];

    elements.forEach(el => {
      const pId = el.hierarchy?.parent_id;
      if (pId) {
        if (!childrenMap.has(pId)) childrenMap.set(pId, []);
        childrenMap.get(pId).push(el);
      } else {
        rootElements.push(el);
      }
    });

    const statusBadgeClass =
      status === 'success' ? 'badge-success' :
      status === 'running' ? 'badge-running' :
      status === 'error' ? 'badge-failed' : 'badge-waiting';

    container.innerHTML = `
      <div class="panel-container">
        <!-- Panel Header -->
        <div class="panel-section-header">
          <div>
            <div class="panel-title">
              <span>🌳</span>
              <span>M2 — Semantic DOM Perception & Spatial Analysis</span>
            </div>
            <div class="panel-subtitle">
              Inspect semantic nodes, ARIA roles, interactable targets, and element bounding boxes aligned with the M1 screenshot.
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button class="btn-cyber btn-cyber-primary" id="m2-analyze-btn" style="padding: 6px 14px; font-size: 12px;" title="Trigger live M2 DOM analysis on active browser tab">
              <span>⚡</span>
              <span>Analyze DOM (M2)</span>
            </button>
            <span class="badge-pill ${statusBadgeClass}">
              ${status.toUpperCase()}
            </span>
          </div>
        </div>

        <!-- Metric Stat Counters -->
        <div class="stat-group-row">
          <div class="stat-box">
            <span class="stat-box-label">Perception Cycle</span>
            <span class="stat-box-value cyan" style="font-size: 13px; font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${perceptionCycleId}">${perceptionCycleId}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Total Elements</span>
            <span class="stat-box-value">${totalCount}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Interactive</span>
            <span class="stat-box-value cyan">${interactiveCount}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Visible</span>
            <span class="stat-box-value emerald">${visibleCount}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Editable</span>
            <span class="stat-box-value" style="color: #f59e0b;">${editableCount}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Occluded</span>
            <span class="stat-box-value" style="color: #ef4444;">${occludedCount}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Analysis Latency</span>
            <span class="stat-box-value violet">${latencyMs} ms</span>
          </div>
        </div>

        <!-- Mode Toggle Segmented Controls -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div class="segmented-control" style="display: inline-flex; background: var(--bg-surface-2); padding: 3px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <button class="segment-btn ${activeTabMode === 'tree' ? 'active' : ''}" data-mode="tree" style="padding: 6px 14px; font-size: 12px; border-radius: var(--radius-sm); border: none; cursor: pointer; background: ${activeTabMode === 'tree' ? 'var(--primary-cyan)' : 'transparent'}; color: ${activeTabMode === 'tree' ? '#000' : 'var(--text-secondary)'}; font-weight: 600;">
              🌳 Tree & Inspector
            </button>
            <button class="segment-btn ${activeTabMode === 'spatial' ? 'active' : ''}" data-mode="spatial" style="padding: 6px 14px; font-size: 12px; border-radius: var(--radius-sm); border: none; cursor: pointer; background: ${activeTabMode === 'spatial' ? 'var(--primary-cyan)' : 'transparent'}; color: ${activeTabMode === 'spatial' ? '#000' : 'var(--text-secondary)'}; font-weight: 600;">
              📐 Spatial View (M1 + M2)
            </button>
            <button class="segment-btn ${activeTabMode === 'table' ? 'active' : ''}" data-mode="table" style="padding: 6px 14px; font-size: 12px; border-radius: var(--radius-sm); border: none; cursor: pointer; background: ${activeTabMode === 'table' ? 'var(--primary-cyan)' : 'transparent'}; color: ${activeTabMode === 'table' ? '#000' : 'var(--text-secondary)'}; font-weight: 600;">
              📋 Table View
            </button>
          </div>

          <div style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono);">
            ${hasData ? `Indexed: ${elements.length} nodes | Selected: ${selectedElementId || 'None'}` : 'Awaiting M2 trigger'}
          </div>
        </div>

        ${!hasData ? `
          <div class="empty-state">
            <div class="empty-state-icon">🌳</div>
            <div class="empty-state-title">No DOM Analysis Data Available</div>
            <div class="empty-state-desc">
              Click <strong>"Analyze DOM (M2)"</strong> above or trigger an observation in the Simple-UI extension to analyze the live DOM structure, ARIA semantics, and spatial bounding boxes.
            </div>
            <div style="margin-top: 16px;">
              <button class="btn-cyber btn-cyber-primary" id="m2-analyze-empty-btn">
                <span>⚡</span>
                <span>Analyze Current Tab Now</span>
              </button>
            </div>
          </div>
        ` : `
          <!-- MODE 1: HIERARCHY TREE & ELEMENT INSPECTOR -->
          ${activeTabMode === 'tree' ? `
            <div style="display: grid; grid-template-columns: 1fr 380px; gap: 16px; align-items: start;">
              <!-- Left: DOM Tree Explorer -->
              <div class="debug-card" style="min-height: 520px; display: flex; flex-direction: column;">
                <div class="filter-bar-row" style="margin-bottom: 12px;">
                  <input
                    type="text"
                    class="search-input-cyber"
                    id="dom-search-input"
                    placeholder="Search by tag, role, text, or target ID..."
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

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 11.5px; color: var(--text-muted);">
                  <span>Showing ${filteredElements.length} elements</span>
                  <div>
                    <button class="btn-cyber btn-cyber-ghost" id="expand-all-tree" style="padding: 2px 8px; font-size: 11px;">Expand All</button>
                    <button class="btn-cyber btn-cyber-ghost" id="collapse-all-tree" style="padding: 2px 8px; font-size: 11px; margin-left: 4px;">Collapse All</button>
                  </div>
                </div>

                <div class="dom-tree-scroll" style="flex: 1; max-height: 560px; overflow-y: auto; background: var(--bg-surface-2); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); padding: 8px;">
                  ${filteredElements.length === 0 ? `
                    <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                      No elements match current filter.
                    </div>
                  ` : filteredElements.map(el => {
                    const isSelected = el.target_id === selectedElementId;
                    const hasKids = (el.hierarchy?.children_ids && el.hierarchy.children_ids.length > 0);
                    const isCollapsed = collapsedNodes.has(el.target_id);
                    const depth = el.hierarchy?.depth || 0;
                    const indentPx = Math.min(depth * 14, 140);

                    return `
                      <div class="tree-node-row ${isSelected ? 'tree-node-selected' : ''}" data-target-id="${el.target_id}" style="
                        display: flex; align-items: center; gap: 6px; padding: 5px 8px; margin-bottom: 2px;
                        margin-left: ${indentPx}px;
                        border-radius: var(--radius-sm); cursor: pointer;
                        background: ${isSelected ? 'rgba(6, 182, 212, 0.15)' : 'transparent'};
                        border: 1px solid ${isSelected ? 'var(--primary-cyan)' : 'transparent'};
                        transition: background 0.15s ease;
                      ">
                        ${hasKids ? `
                          <span class="tree-toggle" data-toggle-id="${el.target_id}" style="font-size: 10px; color: var(--text-muted); cursor: pointer; user-select: none; width: 12px;">
                            ${isCollapsed ? '▶' : '▼'}
                          </span>
                        ` : '<span style="width: 12px;"></span>'}

                        <span class="badge-pill" style="padding: 1px 6px; font-size: 10.5px; color: var(--text-cyan); font-family: var(--font-mono); background: rgba(6, 182, 212, 0.1);">
                          ${el.target_id}
                        </span>

                        <span class="tag-badge" style="font-size: 11px;">
                          &lt;${el.tag}&gt;
                        </span>

                        ${el.role && el.role !== 'generic' ? `
                          <span class="role-badge" style="font-size: 10px;">${el.role}</span>
                        ` : ''}

                        <span style="flex: 1; font-size: 11.5px; color: ${isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                          ${el.semanticName || el.text || '<span style="color: var(--text-muted); font-style: italic;">(unnamed)</span>'}
                        </span>

                        ${el.state?.interactive ? `
                          <span style="font-size: 10px; padding: 1px 5px; border-radius: 4px; background: rgba(37, 99, 235, 0.2); color: #60a5fa;">interactive</span>
                        ` : ''}

                        ${el.state?.editable ? `
                          <span style="font-size: 10px; padding: 1px 5px; border-radius: 4px; background: rgba(245, 158, 11, 0.2); color: #fbbf24;">editable</span>
                        ` : ''}

                        ${el.occlusion === 'OCCLUDED' ? `
                          <span style="font-size: 10px; padding: 1px 5px; border-radius: 4px; background: rgba(239, 68, 68, 0.2); color: #f87171;">occluded</span>
                        ` : ''}

                        <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
                          [${el.spatial?.x || 0}, ${el.spatial?.y || 0}]
                        </span>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- Right: Element Inspector Panel -->
              <div class="debug-card" style="min-height: 520px; display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
                  <span style="font-weight: 700; color: var(--text-cyan); font-size: 13px;">🔍 ELEMENT INSPECTOR</span>
                  <span class="badge-pill" style="font-family: var(--font-mono);">${selectedElement?.target_id || '—'}</span>
                </div>

                ${!selectedElement ? `
                  <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    Select any element from the tree to inspect details.
                  </div>
                ` : `
                  <div style="display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1;">
                    <!-- Identity & Semantic Overview -->
                    <div style="background: var(--bg-surface-2); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                      <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 6px;">Identity & Role</div>
                      <div style="display: grid; grid-template-columns: 80px 1fr; gap: 6px; font-size: 12px;">
                        <span style="color: var(--text-muted);">Tag:</span>
                        <span style="font-weight: 600; color: var(--text-primary); font-family: var(--font-mono);">&lt;${selectedElement.tag}&gt;</span>

                        <span style="color: var(--text-muted);">Role:</span>
                        <span style="color: var(--text-cyan); font-weight: 600;">${selectedElement.role || 'none'}</span>

                        <span style="color: var(--text-muted);">Name:</span>
                        <span style="color: var(--text-primary); word-break: break-word;">${selectedElement.semanticName || '(none)'}</span>

                        <span style="color: var(--text-muted);">Text:</span>
                        <span style="color: var(--text-secondary); word-break: break-word;">${selectedElement.text || '(none)'}</span>
                      </div>
                    </div>

                    <!-- State Flags -->
                    <div style="background: var(--bg-surface-2); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                      <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 6px;">State & Interactability</div>
                      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        <span class="badge-pill ${selectedElement.actionable ? 'badge-success' : 'badge-waiting'}">
                          ${selectedElement.actionable ? 'Actionable' : 'Nested / Non-Actionable'}
                        </span>
                        <span class="badge-pill ${selectedElement.state?.interactive ? 'badge-success' : 'badge-waiting'}">
                          ${selectedElement.state?.interactive ? 'Interactive' : 'Non-Interactive'}
                        </span>
                        <span class="badge-pill ${selectedElement.state?.clickable ? 'badge-success' : 'badge-waiting'}">
                          ${selectedElement.state?.clickable ? 'Clickable' : 'Not Clickable'}
                        </span>
                        <span class="badge-pill ${selectedElement.state?.editable ? 'badge-success' : 'badge-waiting'}">
                          ${selectedElement.state?.editable ? 'Editable' : 'Non-Editable'}
                        </span>
                        <span class="badge-pill ${selectedElement.state?.focusable ? 'badge-success' : 'badge-waiting'}">
                          ${selectedElement.state?.focusable ? 'Focusable' : 'Not Focusable'}
                        </span>
                        <span class="badge-pill ${selectedElement.state?.enabled ? 'badge-success' : 'badge-failed'}">
                          ${selectedElement.state?.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <span class="badge-pill" style="color: ${selectedElement.state?.visibility === 'VISIBLE' ? '#10b981' : '#f59e0b'};">
                          ${selectedElement.state?.visibility || 'UNKNOWN'}
                        </span>
                        <span class="badge-pill" style="color: ${selectedElement.occlusion === 'NOT_OCCLUDED' ? '#10b981' : selectedElement.occlusion === 'OCCLUDED' ? '#ef4444' : '#f59e0b'};">
                          Occlusion: ${selectedElement.occlusion || 'UNKNOWN'}
                        </span>
                      </div>
                    </div>

                    <!-- Spatial Bounding Box -->
                    <div style="background: var(--bg-surface-2); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                      <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 6px;">Spatial Bounding Box</div>
                      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; text-align: center;">
                        <div style="background: var(--bg-surface-1); padding: 4px; border-radius: 4px;">
                          <div style="font-size: 10px; color: var(--text-muted);">X</div>
                          <div style="font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: var(--text-cyan);">${selectedElement.spatial?.x ?? '—'}</div>
                        </div>
                        <div style="background: var(--bg-surface-1); padding: 4px; border-radius: 4px;">
                          <div style="font-size: 10px; color: var(--text-muted);">Y</div>
                          <div style="font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: var(--text-cyan);">${selectedElement.spatial?.y ?? '—'}</div>
                        </div>
                        <div style="background: var(--bg-surface-1); padding: 4px; border-radius: 4px;">
                          <div style="font-size: 10px; color: var(--text-muted);">Width</div>
                          <div style="font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: var(--text-emerald);">${selectedElement.spatial?.width ?? '—'}</div>
                        </div>
                        <div style="background: var(--bg-surface-1); padding: 4px; border-radius: 4px;">
                          <div style="font-size: 10px; color: var(--text-muted);">Height</div>
                          <div style="font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: var(--text-emerald);">${selectedElement.spatial?.height ?? '—'}</div>
                        </div>
                      </div>
                      <div style="margin-top: 6px; font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
                        Coordinates: [top: ${selectedElement.spatial?.top}, left: ${selectedElement.spatial?.left}, bottom: ${selectedElement.spatial?.bottom}, right: ${selectedElement.spatial?.right}]
                      </div>
                    </div>

                    <!-- Hierarchy & DOM Path -->
                    <div style="background: var(--bg-surface-2); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                      <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 6px;">Hierarchy Context</div>
                      <div style="font-size: 11.5px; display: grid; grid-template-columns: 110px 1fr; gap: 6px;">
                        <span style="color: var(--text-muted);">Depth:</span>
                        <span style="font-family: var(--font-mono);">${selectedElement.hierarchy?.depth || 0}</span>

                        <span style="color: var(--text-muted);">Parent:</span>
                        <span>
                          ${selectedElement.hierarchy?.parent_id ? `
                            <a href="#" class="select-target-link" data-link-id="${selectedElement.hierarchy.parent_id}" style="color: var(--text-cyan); font-family: var(--font-mono);">${selectedElement.hierarchy.parent_id}</a>
                          ` : '<span style="color: var(--text-muted);">root</span>'}
                        </span>

                        <span style="color: var(--text-muted);">Interactive Ancestor:</span>
                        <span>
                          ${selectedElement.hierarchy?.interactive_ancestor ? `
                            <a href="#" class="select-target-link" data-link-id="${selectedElement.hierarchy.interactive_ancestor.target_id}" style="color: #f59e0b; font-weight: 600; font-family: var(--font-mono);">
                              ${selectedElement.hierarchy.interactive_ancestor.target_id} (${selectedElement.hierarchy.interactive_ancestor.tag})
                            </a>
                          ` : '<span style="color: var(--text-muted); font-style: italic;">None (Self)</span>'}
                        </span>

                        <span style="color: var(--text-muted);">Structural Sig:</span>
                        <span style="font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary); word-break: break-all;">
                          ${selectedElement.structuralSignature || '—'}
                        </span>

                        <span style="color: var(--text-muted);">Children:</span>
                        <span style="font-family: var(--font-mono); font-size: 11px;">
                          ${selectedElement.hierarchy?.children_ids && selectedElement.hierarchy.children_ids.length > 0 ?
                            selectedElement.hierarchy.children_ids.map(cId => `
                              <a href="#" class="select-target-link" data-link-id="${cId}" style="color: var(--text-cyan); margin-right: 4px;">${cId}</a>
                            `).join('') : '<span style="color: var(--text-muted); font-style: italic;">none</span>'}
                        </span>

                        <span style="color: var(--text-muted);">DOM Path:</span>
                        <span style="font-family: var(--font-mono); font-size: 10.5px; color: var(--text-secondary); word-break: break-all;">
                          ${selectedElement.hierarchy?.path || '—'}
                        </span>
                      </div>
                    </div>

                    <!-- Attributes -->
                    <div style="background: var(--bg-surface-2); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                      <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 6px;">Relevant Attributes</div>
                      <pre style="margin: 0; font-family: var(--font-mono); font-size: 10.5px; color: var(--text-secondary); white-space: pre-wrap; word-break: break-all;">${JSON.stringify(selectedElement.attributes || {}, null, 2)}</pre>
                    </div>
                  </div>
                `}
              </div>
            </div>
          ` : ''}

          <!-- MODE 2: SPATIAL VIEW (M1 SCREENSHOT + M2 BOUNDING BOX OVERLAY) -->
          ${activeTabMode === 'spatial' ? `
            <div class="debug-card">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div>
                  <span style="font-weight: 700; color: var(--text-cyan); font-size: 13px;">📐 SPATIAL ALIGNMENT OVERLAY</span>
                  <span style="font-size: 11.5px; color: var(--text-muted); margin-left: 8px;">
                    M2 DOM bounding boxes overlaid directly onto the real M1 screenshot viewport.
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px; font-size: 11.5px; font-family: var(--font-mono);">
                  <span style="display: flex; align-items: center; gap: 4px;">
                    <span style="width: 10px; height: 10px; background: rgba(6, 182, 212, 0.4); border: 1px solid #06b6d4; display: inline-block;"></span>
                    <span>Interactive (${interactiveCount})</span>
                  </span>
                  <span style="display: flex; align-items: center; gap: 4px;">
                    <span style="width: 10px; height: 10px; background: rgba(168, 85, 247, 0.2); border: 1px dashed #a855f7; display: inline-block;"></span>
                    <span>Other Elements</span>
                  </span>
                </div>
              </div>

              ${!state.browser.screenshotUrl ? `
                <div style="background: var(--bg-surface-2); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); padding: 40px; text-align: center;">
                  <div style="font-size: 28px; margin-bottom: 8px;">📷</div>
                  <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">No M1 Screenshot in Session</div>
                  <div style="font-size: 12px; color: var(--text-muted); max-width: 460px; margin: 0 auto 16px auto;">
                    To align M2 bounding boxes, trigger M1 Viewport Capture first so the background canvas has the actual browser viewport reference.
                  </div>
                  <button class="btn-cyber btn-cyber-primary" id="trigger-m1-spatial-btn">
                    <span>📷</span>
                    <span>Capture M1 Viewport Now</span>
                  </button>
                </div>
              ` : `
                <!-- Canvas Container for Image + SVG Overlay -->
                <div style="position: relative; width: 100%; overflow: auto; background: #000; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); display: flex; justify-content: center;">
                  <div style="position: relative; display: inline-block; max-width: 100%;">
                    <!-- Background Screenshot Image -->
                    <img
                      src="${state.browser.screenshotUrl}"
                      alt="Real Browser Viewport"
                      id="spatial-bg-image"
                      style="display: block; max-width: 100%; height: auto;"
                    />

                    <!-- SVG Overlay for Bounding Boxes (coordinates match CSS viewport) -->
                    <svg
                      id="spatial-svg-overlay"
                      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: auto;"
                      viewBox="0 0 ${dom.viewport?.width || 1365} ${dom.viewport?.height || 768}"
                      preserveAspectRatio="none"
                    >
                      ${elements.filter(e => e.state?.visibility === 'VISIBLE' || e.state?.visibility === 'PARTIALLY_VISIBLE').map(el => {
                        const sp = el.spatial;
                        if (!sp || sp.width <= 0 || sp.height <= 0) return '';
                        const isInteractive = el.state?.interactive;
                        const isSelected = el.target_id === selectedElementId;
                        const strokeColor = isSelected ? '#ffffff' : (isInteractive ? '#06b6d4' : 'rgba(168, 85, 247, 0.6)');
                        const fillColor = isSelected ? 'rgba(255, 255, 255, 0.3)' : (isInteractive ? 'rgba(6, 182, 212, 0.12)' : 'rgba(168, 85, 247, 0.05)');
                        const strokeWidth = isSelected ? '3' : (isInteractive ? '1.5' : '1');
                        const strokeDash = isInteractive ? 'none' : '3 2';

                        return `
                          <rect
                            x="${sp.x}"
                            y="${sp.y}"
                            width="${sp.width}"
                            height="${sp.height}"
                            fill="${fillColor}"
                            stroke="${strokeColor}"
                            stroke-width="${strokeWidth}"
                            stroke-dasharray="${strokeDash}"
                            style="cursor: pointer;"
                            data-spatial-target-id="${el.target_id}"
                          >
                            <title>${el.target_id}: &lt;${el.tag}&gt; ${el.role ? `role="${el.role}"` : ''} — "${el.semanticName || el.text}" [${sp.x}, ${sp.y}, ${sp.width}x${sp.height}]</title>
                          </rect>
                        `;
                      }).join('')}
                    </svg>
                  </div>
                </div>

                <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
                  <span>Viewport: ${dom.viewport?.width || 0}×${dom.viewport?.height || 0} (DPR ${dom.viewport?.devicePixelRatio || 1})</span>
                  <span>Click any box to inspect element</span>
                </div>
              `}
            </div>
          ` : ''}

          <!-- MODE 3: TABLE VIEW -->
          ${activeTabMode === 'table' ? `
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
                      <th>Semantic / Visible Text</th>
                      <th>State</th>
                      <th>Occlusion</th>
                      <th>Bounding Box</th>
                      <th>Depth</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filteredElements.length === 0 ? `
                      <tr>
                        <td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted);">
                          No DOM elements matching query.
                        </td>
                      </tr>
                    ` : filteredElements.map(el => `
                      <tr class="${el.target_id === selectedElementId ? 'table-row-selected' : ''}" data-target-id="${el.target_id}" style="cursor: pointer;">
                        <td><span class="badge-pill" style="color: var(--text-cyan); font-family: var(--font-mono);">${el.target_id}</span></td>
                        <td><span class="tag-badge">&lt;${el.tag}&gt;</span></td>
                        <td>${el.role && el.role !== 'generic' ? `<span class="role-badge">${el.role}</span>` : '<span style="color: var(--text-muted);">none</span>'}</td>
                        <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${el.semanticName || el.text || ''}">
                          ${el.semanticName || el.text || '<span style="color: var(--text-muted); font-style: italic;">(empty)</span>'}
                        </td>
                        <td>
                          ${el.state?.interactive ? '<span style="color: #60a5fa; font-size: 11px;">interactive </span>' : ''}
                          ${el.state?.editable ? '<span style="color: #fbbf24; font-size: 11px;">editable </span>' : ''}
                          ${el.state?.visibility === 'VISIBLE' ? '<span style="color: #34d399; font-size: 11px;">visible</span>' : `<span style="color: #9ca3af; font-size: 11px;">${el.state?.visibility}</span>`}
                        </td>
                        <td>
                          <span style="font-size: 11px; color: ${el.occlusion === 'NOT_OCCLUDED' ? '#10b981' : el.occlusion === 'OCCLUDED' ? '#ef4444' : '#9ca3af'};">
                            ${el.occlusion || 'UNKNOWN'}
                          </span>
                        </td>
                        <td style="font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted);">
                          ${el.spatial ? `[${el.spatial.x}, ${el.spatial.y}, ${el.spatial.width}x${el.spatial.height}]` : '—'}
                        </td>
                        <td style="font-family: var(--font-mono); font-size: 11px;">
                          ${el.hierarchy?.depth || 0}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}
        `}
      </div>
    `;

    // Bind event listeners
    container.querySelectorAll('.segment-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeTabMode = e.currentTarget.getAttribute('data-mode');
        update();
      });
    });

    // M2 trigger buttons
    const triggerM2 = () => {
      window.postMessage({ type: 'RAVEN_TRIGGER_M2' }, '*');
    };
    container.querySelector('#m2-analyze-btn')?.addEventListener('click', triggerM2);
    container.querySelector('#m2-analyze-empty-btn')?.addEventListener('click', triggerM2);

    // M1 trigger button inside spatial empty view
    container.querySelector('#trigger-m1-spatial-btn')?.addEventListener('click', () => {
      window.postMessage({ type: 'RAVEN_TRIGGER_M1' }, '*');
    });

    // Filter controls
    container.querySelector('#dom-search-input')?.addEventListener('input', (e) => {
      searchTerm = e.target.value;
      update();
    });

    container.querySelector('#dom-role-select')?.addEventListener('change', (e) => {
      filterRole = e.target.value;
      update();
    });

    // Tree element selection
    container.querySelectorAll('.tree-node-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('tree-toggle')) return;
        selectedElementId = row.getAttribute('data-target-id');
        update();
      });
    });

    // Tree node expand/collapse
    container.querySelectorAll('.tree-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-toggle-id');
        if (collapsedNodes.has(id)) {
          collapsedNodes.delete(id);
        } else {
          collapsedNodes.add(id);
        }
        update();
      });
    });

    container.querySelector('#expand-all-tree')?.addEventListener('click', () => {
      collapsedNodes.clear();
      update();
    });

    container.querySelector('#collapse-all-tree')?.addEventListener('click', () => {
      elements.forEach(e => {
        if (e.hierarchy?.children_ids && e.hierarchy.children_ids.length > 0) {
          collapsedNodes.add(e.target_id);
        }
      });
      update();
    });

    // Table row selection
    container.querySelectorAll('tbody tr[data-target-id]').forEach(row => {
      row.addEventListener('click', () => {
        selectedElementId = row.getAttribute('data-target-id');
        activeTabMode = 'tree';
        update();
      });
    });

    // Spatial bounding box selection
    container.querySelectorAll('[data-spatial-target-id]').forEach(rect => {
      rect.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedElementId = rect.getAttribute('data-spatial-target-id');
        update();
      });
    });

    // Target link clicks in inspector
    container.querySelectorAll('.select-target-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        selectedElementId = link.getAttribute('data-link-id');
        update();
      });
    });
  }

  store.subscribe(update);
  update();
}
