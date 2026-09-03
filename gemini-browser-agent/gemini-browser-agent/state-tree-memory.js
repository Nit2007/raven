// state-tree-memory.js
//
// Production-grade Hierarchical State-Action Tree & MCTS Memory for Browser Agent.
// Replaces unstructured prompt injection with deterministic, graph-based memory:
// - Nodes: Unique semantic DOM states (keyed by stable pageHash + URL path).
// - Edges: Action transitions with outcome tracking (SUCCESS, NAVIGATION, STATE_CHANGED, NO_EFFECT, TARGET_DISAPPEARED, FAILED).
// - Semantic Failure Tracking: Detects multi-state retry loops and ping-pong patterns across alternating states.
// - Pruning: Automatic blacklisting of actions that fail or produce 0 state change at a given node or across cycling states.
// - Breadcrumbs: Root-to-current trajectory tracking for spatial/hierarchy awareness.

export class StateTreeMemory {
  constructor(data = {}) {
    this.rootHash = data.rootHash || null;
    this.currentHash = data.currentHash || null;
    // Map of pageHash -> Node { hash, url, title, visitCount, depth, parentHash, prunedActions: [] }
    this.nodes = data.nodes || {};
    // List of transitions: [ { from, to, actionSignature, targetId, structuralSignature, outcome, timestamp } ]
    this.edges = data.edges || [];
    // Active breadcrumb stack of state hashes: [rootHash, ..., currentHash]
    this.trajectory = data.trajectory || [];
    // Semantic Failure Evidence Tracker across observations:
    // Map of structuralSignature/actionSig -> { actionType, structuralSignature, semanticDescription, consecutiveNoEffectCount, statesAttempted: [] }
    this.semanticFailures = data.semanticFailures || {};
  }

  /**
   * Helper to generate a stable, readable action signature
   */
  static getActionSignature(action, element = null) {
    if (!action) return 'unknown';
    const actType = action.action || 'unknown';
    const targetId = action.target_id || '';
    const label = element ? `[${element.tag || ''}:${element.type || ''}:"${(element.text || '').slice(0, 30)}"]` : '';
    const val = action.value ? ` val="${action.value}"` : (action.direction ? ` dir="${action.direction}"` : '');
    return `${actType}${targetId ? ` target=${targetId}` : ''}${label ? ` ${label}` : ''}${val}`;
  }

  /**
   * Universal, generic action result classifier based on real pre/post observations
   */
  static classifyOutcome(prevObs, currObs, action, error = null) {
    if (error) return 'FAILED';
    if (!prevObs || !currObs) return 'UNKNOWN';
    if (action && action.action === 'done') return 'SUCCESS';
    if (prevObs.url !== currObs.url) return 'NAVIGATION';

    // Test if targeted element disappeared from the live DOM
    if (action && action.target_id && prevObs.elements && currObs.elements) {
      const prevTarget = prevObs.elements.find((e) => e.target_id === action.target_id);
      if (prevTarget) {
        const stillExists = currObs.elements.some(
          (e) =>
            (prevTarget.structural_signature && e.structural_signature === prevTarget.structural_signature) ||
            (e.target_id === prevTarget.target_id && e.tag === prevTarget.tag)
        );
        if (!stillExists) return 'TARGET_DISAPPEARED';
      }
    }

    if (prevObs.pageHash !== currObs.pageHash) return 'STATE_CHANGED';
    return 'NO_EFFECT';
  }

  /**
   * Registers or updates a page state node in the tree.
   * @param {object} observation - { pageHash, url, title, elements }
   * @returns {object} The recorded node
   */
  recordState(observation) {
    const hash = observation.pageHash || 'unknown_hash';
    const url = observation.url || 'about:blank';
    const title = observation.title || 'Untitled';

    if (!this.rootHash) {
      this.rootHash = hash;
    }

    if (!this.nodes[hash]) {
      const parentHash = this.currentHash;
      const depth = parentHash && this.nodes[parentHash] ? this.nodes[parentHash].depth + 1 : 0;

      this.nodes[hash] = {
        hash,
        url,
        title,
        visitCount: 1,
        depth,
        parentHash,
        prunedActions: [], // List of { actionSignature, targetId, structuralSignature, reason }
        firstSeen: Date.now(),
        lastSeen: Date.now()
      };
    } else {
      this.nodes[hash].visitCount += 1;
      this.nodes[hash].lastSeen = Date.now();
      this.nodes[hash].url = url;
      this.nodes[hash].title = title;
    }

    // Update trajectory
    if (this.currentHash !== hash) {
      const existingIdx = this.trajectory.lastIndexOf(hash);
      if (existingIdx !== -1) {
        this.trajectory = this.trajectory.slice(0, existingIdx + 1);
      } else {
        this.trajectory.push(hash);
      }
    } else if (this.trajectory.length === 0) {
      this.trajectory.push(hash);
    }

    this.currentHash = hash;
    return this.nodes[hash];
  }

  /**
   * Records an action transition and manages both per-state pruning and cross-state semantic loop detection.
   * @param {string} fromHash - Previous state hash
   * @param {string} toHash - Next state hash
   * @param {object} action - Executed action
   * @param {object|null} element - Element targeted by action
   * @param {string|null} outcomeOverride - Pre-classified outcome (NAVIGATION, STATE_CHANGED, NO_EFFECT, etc.)
   * @returns {object} Transition record
   */
  recordTransition(fromHash, toHash, action, element = null, outcomeOverride = null) {
    if (!fromHash || !action) return null;

    const actionSig = StateTreeMemory.getActionSignature(action, element);
    const targetId = action.target_id || '';
    const structuralSig = element?.structural_signature || '';
    const outcome = outcomeOverride || (fromHash === toHash ? 'NO_EFFECT' : 'STATE_CHANGED');

    const edge = {
      from: fromHash,
      to: toHash,
      actionSignature: actionSig,
      actionType: action.action,
      targetId,
      structuralSignature: structuralSig,
      elementTag: element?.tag || '',
      elementText: element?.text || '',
      outcome,
      timestamp: Date.now()
    };

    this.edges.push(edge);

    // 1. DETERMINISTIC NODE PRUNING (Self-loop / NO_EFFECT on specific page state)
    if (outcome === 'NO_EFFECT' && this.nodes[fromHash]) {
      const fromNode = this.nodes[fromHash];
      const alreadyPruned = fromNode.prunedActions.some(
        (p) => (targetId && p.targetId === targetId) ||
               (structuralSig && p.structuralSignature === structuralSig) ||
               p.actionSignature === actionSig
      );

      if (!alreadyPruned) {
        fromNode.prunedActions.push({
          actionSignature: actionSig,
          targetId,
          structuralSignature: structuralSig,
          actionType: action.action,
          elementText: element?.text || '',
          reason: 'NO_EFFECT: Action produced 0 state change on page DOM'
        });
      }
    }

    // 2. CROSS-STATE SEMANTIC FAILURE & PING-PONG LOOP TRACKING
    const sigKey = structuralSig ? `${action.action}::${structuralSig}` : actionSig;
    if (outcome === 'NO_EFFECT' || outcome === 'FAILED') {
      if (!this.semanticFailures[sigKey]) {
        this.semanticFailures[sigKey] = {
          actionType: action.action,
          structuralSignature: structuralSig,
          semanticDescription: element ? `[${element.tag}:${element.type || ''}:"${(element.text || '').slice(0, 30)}"]` : actionSig,
          consecutiveNoEffectCount: 1,
          statesAttempted: [fromHash],
          lastOutcome: outcome
        };
      } else {
        const rec = this.semanticFailures[sigKey];
        rec.consecutiveNoEffectCount += 1;
        if (!rec.statesAttempted.includes(fromHash)) {
          rec.statesAttempted.push(fromHash);
        }
        rec.lastOutcome = outcome;
      }
    } else if (outcome === 'NAVIGATION') {
      // Genuine page navigation occurred — reset failure tracking for the new navigation context
      this.semanticFailures = {};
    }

    return edge;
  }

  /**
   * Gets list of blacklisted / pruned actions for a given page state
   * @param {string} hash
   * @returns {Array}
   */
  getPrunedActionsForState(hash) {
    if (!hash || !this.nodes[hash]) return [];
    return this.nodes[hash].prunedActions || [];
  }

  /**
   * Generates breadcrumb path string from root to current node
   */
  getBreadcrumbs() {
    if (!this.trajectory.length) return 'Initial State';
    return this.trajectory
      .map((h, idx) => {
        const node = this.nodes[h];
        const title = node?.title ? `"${node.title.slice(0, 25)}"` : `State-${idx}`;
        return `[#${idx} ${title} (Hash: ${h})]`;
      })
      .join(' ➔ ');
  }

  /**
   * Generates a safe, structured, prompt-injection-proof string for the decision engine.
   * @param {object} observation
   * @returns {string} Structured memory block
   */
  getPromptContext(observation) {
    const hash = observation.pageHash || this.currentHash || 'unknown';
    const currentNode = this.nodes[hash];
    const visitCount = currentNode ? currentNode.visitCount : 1;
    const depth = currentNode ? currentNode.depth : 0;
    const totalUniqueNodes = Object.keys(this.nodes).length;
    const pruned = this.getPrunedActionsForState(hash);

    // 1. Per-state dead ends
    const prunedItems = [];
    if (pruned.length > 0) {
      for (const p of pruned) {
        prunedItems.push(`  - [FORBIDDEN ON THIS PAGE] Action "${p.actionSignature}" -> ${p.reason}. DO NOT SELECT.`);
      }
    }

    // 2. Cross-state ineffective action loops (e.g. alternating cycles where same semantic control repeatedly fails)
    const elements = observation.elements || [];
    for (const [sigKey, failureRec] of Object.entries(this.semanticFailures)) {
      if (failureRec.consecutiveNoEffectCount >= 2 || failureRec.statesAttempted.length >= 2) {
        // Find matching live elements in current observation
        const matchingEl = elements.find(
          (e) => e.structural_signature && e.structural_signature === failureRec.structuralSignature
        );
        const targetMention = matchingEl ? `target_id "${matchingEl.target_id}"` : failureRec.semanticDescription;
        prunedItems.push(
          `  - [FORBIDDEN RETRY LOOP] ${targetMention} has been attempted ${failureRec.consecutiveNoEffectCount} times across ${failureRec.statesAttempted.length} states with 0 progress. DO NOT SELECT.`
        );
      }
    }

    const prunedBlock = prunedItems.length > 0 ? prunedItems.join('\n') : '  - None (All valid interactive elements at this state are candidate options).';

    return `HIERARCHICAL EXPLORATION TREE & STATE MEMORY:
- Active Trajectory (Breadcrumbs): ${this.getBreadcrumbs()}
- Current State Depth in Tree: ${depth} (Total unique states mapped: ${totalUniqueNodes})
- Exact Visits to Current State Hash: ${visitCount}
- DETERMINISTIC PRUNING CONSTRAINTS (Actions verified as dead-ends or retry loops):
${prunedBlock}`;
  }

  /**
   * Serialize for storage
   */
  toJSON() {
    return {
      rootHash: this.rootHash,
      currentHash: this.currentHash,
      nodes: this.nodes,
      edges: this.edges,
      trajectory: this.trajectory,
      semanticFailures: this.semanticFailures
    };
  }

  /**
   * Rehydrate from storage
   */
  static fromJSON(data) {
    return new StateTreeMemory(data || {});
  }
}
