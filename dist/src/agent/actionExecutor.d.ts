/**
 * ActionExecutor — Strict browser action validation & execution engine.
 *
 * Implements real browser actions: CLICK, TYPE, SCROLL, SELECT, NONE/DONE.
 * Enforces anti-hallucination checks, stale target rejection, and blocks arbitrary JS execution.
 * Guarantees real action receipts (never mock success).
 */
export interface ValidatedCommand {
    action: 'CLICK' | 'TYPE' | 'SCROLL' | 'SELECT' | 'NONE' | 'DONE';
    targetSelector: string | null;
    value: string | null;
    reasoning?: string;
    taskStatus?: string;
}
export interface ActionValidationResult {
    valid: boolean;
    errors: string[];
    command: ValidatedCommand;
}
export interface ActionReceipt {
    success: boolean;
    action: string;
    target_element_id: string | null;
    execution: 'REAL_BROWSER';
    dispatched: boolean;
    verified: boolean;
    message?: string;
    error?: string;
}
export declare class ActionExecutor {
    private static ALLOWED_ACTIONS;
    /**
     * Validate incoming server action against current visible page elements.
     * Prevents hallucinated target IDs, unknown actions, and arbitrary JS execution.
     */
    static validateAction(rawAction: any, currentScreenElements?: any[]): ActionValidationResult;
    /**
     * Execute validated action via real content script message dispatcher.
     */
    static executeValidatedAction(command: ValidatedCommand, dispatcherFn: (cmd: ValidatedCommand) => Promise<ActionReceipt>): Promise<ActionReceipt>;
}
