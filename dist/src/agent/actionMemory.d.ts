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
export declare class ActionMemory {
    private ledger;
    private actionCounter;
    private currentTaskId;
    setTaskId(taskId: string): void;
    getTaskId(): string;
    recordAction(entry: {
        type: 'CLICK' | 'TYPE' | 'SCROLL' | 'SELECT' | 'DONE' | 'NONE';
        targetElementId?: string;
        targetSemantic?: string;
        targetText?: string;
        value?: string;
        pageFingerprintBefore?: string;
    }): ActionLedgerEntry;
    markExecuted(actionId: string, fingerprintAfter?: string): ActionLedgerEntry | undefined;
    markVerified(actionId: string, resultMessage?: string, navigationOccurred?: boolean, fingerprintAfter?: string): ActionLedgerEntry | undefined;
    markFailed(actionId: string, reason?: string): ActionLedgerEntry | undefined;
    hasVerifiedAction(actionType: string, targetIdentifier?: string): boolean;
    /**
     * Comprehensive equivalence check to prevent repeating actions after re-observation.
     * Filters strictly by currentTaskId so previous user tasks do not leak into new tasks.
     */
    hasEquivalentVerifiedAction(proposed: {
        type: string;
        targetElementId?: string;
        targetText?: string;
        targetSemantic?: string;
        value?: string;
        pageFingerprintBefore?: string;
    }): boolean;
    getLastAction(): ActionLedgerEntry | undefined;
    getHistory(): ActionLedgerEntry[];
    clear(): void;
}
