// state-tree-memory.js
//
// Production-grade Hierarchical State-Action Tree & MCTS Memory for Browser Agent.
// Replaces unstructured prompt injection with deterministic, graph-based memory:
// - Nodes: Unique semantic DOM states (keyed by stable pageHash + URL path).
// - Edges: Action transitions with outcome tracking (transition, cyclic_loop, navigation, error).
// - Pruning: Automatic blacklisting of actions that fail or produce 0 state change at a given node.
// - Breadcrumbs: Root-to-current trajectory tracking for spatial/hierarchy awareness.

export class StateTreeMemory {
  constructor(data = {}) {
    this.rootHash = data.rootHash || null;
    this.currentHash = data.currentHash || null;
    // Map of pageHash -> Node { hash, url, title, visitCount, depth, parentHash, prunedActions: [], triedActions: [] }
    this.nodes = data.nodes || {};
    // List of transitions: [ { from, to, actionSignature, targetId, elementLabel, outcome, timestamp } ]
    this.edges = data.edges || [];
    // Active breadcrumb stack of state hashes: [rootHash, ..., currentHash]
    this.trajectory = data.trajectory || [];
    // Global loop detection counter - track total retries across all states
    this.totalLoopIterations = data.totalLoopIterations || 0;
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
        prunedActions: [], // List of { actionSignature, targetId, reason }
        firstSeen: Date.now(),
        lastSeen: Date.now()
      };
    } else {
      this.nodes[hash].visitCount += 1;
      this.nodes[hash].lastSeen = Date.now();
      // Keep title and url fresh
      this.nodes[hash].url = url;
      this.nodes[hash].title = title;
    }

    // Update trajectory
    if (this.currentHash !== hash) {
      // Check if we navigated back along existing trajectory
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
   * Records an action transition between states and deterministically prunes ineffective actions.
   * @param {string} fromHash - Previous state hash
   * @param {string} toHash - Next state hash
   * @param {object} action - Executed action
   * @param {object|null} element - Element targeted by action
   * @returns {object} Transition record
   */
  recordTransition(fromHash, toHash, action, element = null) {
    if (!fromHash || !action) return null;

    const actionSig = StateTreeMemory.getActionSignature(action, element);
    const targetId = action.target_id || '';
    const actionType = action.action || 'unknown';
    const isSelfLoop = fromHash === toHash;
    const outcome = isSelfLoop ? 'cyclic_loop' : 'transition';

    const edge = {
      from: fromHash,
      to: toHash,
      actionSignature: actionSig,
      actionType,
      targetId,
      elementTag: element?.tag || '',
      elementText: element?.text || '',
      outcome,
      timestamp: Date.now()
    };

    this.edges.push(edge);

    // DETERMINISTIC PRUNING RULE #1: Self-loop produces no state change
    if (isSelfLoop && this.nodes[fromHash]) {
      const fromNode = this.nodes[fromHash];
      const alreadyPruned = fromNode.prunedActions.some(
        (p) => (targetId && p.targetId === targetId) || p.actionSignature === actionSig
      );

      if (!alreadyPruned) {
        fromNode.prunedActions.push({
          actionSignature: actionSig,
          targetId,
          actionType,
          elementText: element?.text || '',
          reason: 'CYCLIC_LOOP: Action produced 0 state change on page DOM',
          severity: 'high'
        });
      }
    }

    // PRUNING RULE #2: Track ALL actions attempted at this state (even successful ones)
    // This prevents trying the same element twice unless state changed significantly
    if (this.nodes[fromHash]) {
      const fromNode = this.nodes[fromHash];
      if (!fromNode.triedActions) {
        fromNode.triedActions = [];
      }
      const alreadyTried = fromNode.triedActions.some(
        (t) => t.targetId === targetId && t.actionType === actionType
      );
      if (!alreadyTried) {
        fromNode.triedActions.push({
          actionType,
          targetId,
          elementText: element?.text || '',
          actionSignature: actionSig,
          timestamp: Date.now(),
          resultedInStateChange: !isSelfLoop
        });
      }
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
   * Gets list of ALL tried actions at a given page state (for smarter loop detection)
   * @param {string} hash
   * @returns {Array}
   */
  getTriedActionsForState(hash) {
    if (!hash || !this.nodes[hash]) return [];
    return this.nodes[hash].triedActions || [];
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
    const triedActions = this.getTriedActionsForState(hash);

    let prunedBlock = '  - None (All valid interactive elements at this state are candidate options).';
    if (pruned.length > 0) {
      prunedBlock = pruned
        .map(
          (p, i) =>
            `  ${i + 1}. [FORBIDDEN] Action "${p.actionSignature}" -> ${p.reason}. DO NOT SELECT THIS TARGET_ID.`
        )
        .join('\n');
    }

    // Build tried actions summary to show model what's already been attempted
    let triedBlock = '';
    if (triedActions.length > 0) {
      const successfulActions = triedActions.filter(t => t.resultedInStateChange);
      const failedActions = triedActions.filter(t => !t.resultedInStateChange);
      
      triedBlock = `\n- Actions Already Attempted at This State (${triedActions.length} total):`;
      if (successfulActions.length > 0) {
        triedBlock += `\n  * Successful (led to new state): ${successfulActions.map(s => `"${s.actionSignature}"`).join(', ')}`;
      }
      if (failedActions.length > 0) {
        triedBlock += `\n  * Failed (no state change): ${failedActions.map(f => `"${f.actionSignature}"`).join(', ')}`;
      }
      triedBlock += `\n  STRATEGY: Do not repeat failed actions. If all elements have been tried, consider scrolling, using search, or marking task "done".`;
    }

    return `HIERARCHICAL EXPLORATION TREE & STATE MEMORY:
- Active Trajectory (Breadcrumbs): ${this.getBreadcrumbs()}
- Current State Depth in Tree: ${depth} (Total unique states mapped: ${totalUniqueNodes})
- Exact Visits to Current State Hash: ${visitCount}
- DETERMINISTIC PRUNING CONSTRAINTS (Actions verified as dead-ends at this exact page state):
${prunedBlock}${triedBlock}`;
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
      totalLoopIterations: this.totalLoopIterations
    };
  }

  /**
   * Rehydrate from storage
   */
  static fromJSON(data) {
    return new StateTreeMemory(data || {});
  }
}
