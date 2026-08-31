/**
 * ActionMemory / ActionLedger — Runtime memory and deduplication engine for agent actions.
 *
 * Prevents repeating actions across observations and page re-renders.
 * Deduplicates using goal context, action type, semantics, text, value, and page fingerprints.
 * Strictly task-scoped by taskId to prevent previous task actions from leaking.
 */

export interface ActionLedgerEntry {
  actionId: string;
  taskId: string;
  type: 'CLICK' | 'TYPE' | 'SCROLL' | 'SELECT' | 'DONE' | 'NONE';
  targetElementId?: string;
  targetSemantic?: string;
  targetText?: string;
  value?: string;
  pageFingerprintBefore?: string;
  pageFingerprintAfter?: string;
  beforeStateHash?: string;
  afterStateHash?: string;
  navigationOccurred?: boolean;
  executionTimestamp: number;
  verificationTimestamp?: number;
  executionStatus: 'PROPOSED' | 'EXECUTED' | 'VERIFIED' | 'FAILED';
  verificationResult?: string;
}

export class ActionMemory {
  private ledger: ActionLedgerEntry[] = [];
  private actionCounter: number = 0;
  private currentTaskId: string = 'task_default';

  public setTaskId(taskId: string): void {
    this.currentTaskId = taskId;
  }

  public getTaskId(): string {
    return this.currentTaskId;
  }

  public recordAction(entry: {
    type: 'CLICK' | 'TYPE' | 'SCROLL' | 'SELECT' | 'DONE' | 'NONE';
    targetElementId?: string;
    targetSemantic?: string;
    targetText?: string;
    value?: string;
    pageFingerprintBefore?: string;
  }): ActionLedgerEntry {
    this.actionCounter++;
    const actionId = `act_${Date.now()}_${this.actionCounter}`;

    const newEntry: ActionLedgerEntry = {
      actionId,
      taskId: this.currentTaskId,
      type: entry.type,
      targetElementId: entry.targetElementId,
      targetSemantic: entry.targetSemantic,
      targetText: entry.targetText,
      value: entry.value,
      pageFingerprintBefore: entry.pageFingerprintBefore,
      executionTimestamp: Date.now(),
      executionStatus: 'PROPOSED'
    };

    this.ledger.push(newEntry);
    console.log(`[RAVEN:MEMORY] action proposed: ${entry.type}`, {
      actionId,
      taskId: this.currentTaskId,
      target: entry.targetElementId || entry.targetText || entry.type
    });

    return newEntry;
  }

  public markExecuted(actionId: string, fingerprintAfter?: string): ActionLedgerEntry | undefined {
    const item = this.ledger.find(a => a.actionId === actionId);
    if (item) {
      item.executionStatus = 'EXECUTED';
      if (fingerprintAfter) {
        item.pageFingerprintAfter = fingerprintAfter;
      }
      console.log(`[RAVEN:MEMORY] action recorded: ${item.type}`, { actionId });
    }
    return item;
  }

  public markVerified(
    actionId: string,
    resultMessage?: string,
    navigationOccurred?: boolean,
    fingerprintAfter?: string
  ): ActionLedgerEntry | undefined {
    const item = this.ledger.find(a => a.actionId === actionId);
    if (item) {
      item.executionStatus = 'VERIFIED';
      item.verificationTimestamp = Date.now();
      item.verificationResult = resultMessage || 'Verified successfully';
      item.navigationOccurred = Boolean(navigationOccurred);
      if (fingerprintAfter) {
        item.pageFingerprintAfter = fingerprintAfter;
      }
      console.log(`[RAVEN:MEMORY] action verified: ${item.type}`, {
        actionId,
        navigationOccurred: item.navigationOccurred
      });
    }
    return item;
  }

  public markFailed(actionId: string, reason?: string): ActionLedgerEntry | undefined {
    const item = this.ledger.find(a => a.actionId === actionId);
    if (item) {
      item.executionStatus = 'FAILED';
      item.verificationResult = reason || 'Execution failed';
      console.log(`[RAVEN:MEMORY] action failed: ${item.type}`, { actionId, reason });
    }
    return item;
  }

  public hasVerifiedAction(actionType: string, targetIdentifier?: string): boolean {
    const typeUpper = actionType.toUpperCase();
    return this.ledger.some(entry => {
      if (entry.taskId !== this.currentTaskId) return false;
      if (entry.executionStatus !== 'VERIFIED') return false;
      if (entry.type !== typeUpper) return false;
      if (!targetIdentifier) return true;

      const normTarget = targetIdentifier.toLowerCase();
      const matchId = entry.targetElementId?.toLowerCase() === normTarget;
      const matchText = entry.targetText?.toLowerCase() === normTarget;
      const matchSemantic = entry.targetSemantic?.toLowerCase() === normTarget;

      return matchId || matchText || matchSemantic;
    });
  }

  /**
   * Comprehensive equivalence check to prevent repeating actions after re-observation.
   * Filters strictly by currentTaskId so previous user tasks do not leak into new tasks.
   */
  public hasEquivalentVerifiedAction(proposed: {
    type: string;
    targetElementId?: string;
    targetText?: string;
    targetSemantic?: string;
    value?: string;
    pageFingerprintBefore?: string;
  }): boolean {
    const typeUpper = proposed.type.toUpperCase();

    // SCROLL equivalence (single scroll goal satisfied for current task)
    if (typeUpper === 'SCROLL') {
      return this.ledger.some(entry => entry.taskId === this.currentTaskId && entry.type === 'SCROLL' && entry.executionStatus === 'VERIFIED');
    }

    const propId = proposed.targetElementId ? proposed.targetElementId.toLowerCase() : '';
    const propText = proposed.targetText ? proposed.targetText.toLowerCase() : '';
    const propSemantic = proposed.targetSemantic ? proposed.targetSemantic.toLowerCase() : '';
    const propValue = proposed.value ? proposed.value.toLowerCase() : '';

    return this.ledger.some(entry => {
      if (entry.taskId !== this.currentTaskId) return false;
      if (entry.executionStatus !== 'VERIFIED') return false;
      if (entry.type !== typeUpper) return false;

      // 1. Text or Semantic equivalence
      const textMatch = Boolean(propText && entry.targetText && propText === entry.targetText.toLowerCase());
      const semanticMatch = Boolean(propSemantic && entry.targetSemantic && propSemantic === entry.targetSemantic.toLowerCase());

      // 2. Element ID match on same page
      const samePage = !proposed.pageFingerprintBefore || !entry.pageFingerprintBefore || proposed.pageFingerprintBefore === entry.pageFingerprintBefore;
      const idMatch = Boolean(samePage && propId && entry.targetElementId && propId === entry.targetElementId.toLowerCase());

      // 3. For TYPE actions, check if same value typed into equivalent element
      if (typeUpper === 'TYPE') {
        const valueMatch = propValue === (entry.value || '').toLowerCase();
        return (textMatch || semanticMatch || idMatch) && valueMatch;
      }

      // For CLICK / SELECT
      if (textMatch || semanticMatch || idMatch) {
        console.log(`[RAVEN:MEMORY] duplicate prevented for ${typeUpper}:`, {
          targetText: proposed.targetText,
          targetSemantic: proposed.targetSemantic,
          targetElementId: proposed.targetElementId
        });
        return true;
      }

      return false;
    });
  }

  public getLastAction(): ActionLedgerEntry | undefined {
    const taskEntries = this.ledger.filter(a => a.taskId === this.currentTaskId);
    return taskEntries.length > 0 ? taskEntries[taskEntries.length - 1] : undefined;
  }

  public getHistory(): ActionLedgerEntry[] {
    return this.ledger.filter(a => a.taskId === this.currentTaskId);
  }

  public clear(): void {
    this.ledger = [];
    this.actionCounter = 0;
  }
}
