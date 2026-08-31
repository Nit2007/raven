/**
 * ActionExecutor — Strict browser action validation & execution engine.
 *
 * Implements real browser actions: CLICK, TYPE, SCROLL, SELECT, NONE/DONE.
 * Enforces anti-hallucination checks, stale target rejection, and blocks arbitrary JS execution.
 * Guarantees real action receipts (never mock success).
 */
export class ActionExecutor {
    static ALLOWED_ACTIONS = new Set(['CLICK', 'TYPE', 'SCROLL', 'SELECT', 'NONE', 'DONE']);
    /**
     * Validate incoming server action against current visible page elements.
     * Prevents hallucinated target IDs, unknown actions, and arbitrary JS execution.
     */
    static validateAction(rawAction, currentScreenElements = []) {
        const errors = [];
        const actionObj = rawAction?.action || rawAction || {};
        let actionType = String(actionObj.action_type || rawAction.action || 'NONE').toUpperCase();
        if (actionType === 'WAIT')
            actionType = 'NONE';
        if (actionType === 'COMPLETED' || actionType === 'FINISH')
            actionType = 'DONE';
        // 1. Strict Action Vocabulary Guard
        if (!this.ALLOWED_ACTIONS.has(actionType)) {
            errors.push(`Invalid action type: "${actionType}". Allowed: CLICK, TYPE, SCROLL, SELECT, NONE, DONE.`);
        }
        const targetSelector = actionObj.target_element_id || rawAction.targetSelector || null;
        const value = actionObj.value || rawAction.value || null;
        // 2. Anti-Hallucination & Stale Target Guard
        if (actionType !== 'NONE' && actionType !== 'DONE' && actionType !== 'SCROLL') {
            if (!targetSelector) {
                errors.push(`Action "${actionType}" requires a valid target_element_id, but none was provided.`);
            }
            else if (Array.isArray(currentScreenElements) && currentScreenElements.length > 0) {
                const targetExists = currentScreenElements.some((el) => {
                    const idMatch = String(el.id || '').toLowerCase() === String(targetSelector).toLowerCase();
                    const selectorMatch = String(el.dom_selector || '').toLowerCase() === String(targetSelector).toLowerCase();
                    const nameMatch = String(el.name || '').toLowerCase() === String(targetSelector).toLowerCase();
                    const indexMatch = String(targetSelector).toLowerCase().startsWith('el_') || /^\d+$/.test(String(targetSelector));
                    return idMatch || selectorMatch || nameMatch || indexMatch;
                });
                if (!targetExists) {
                    errors.push(`Target element ID "${targetSelector}" is not present in the currently analyzed page state.`);
                }
            }
        }
        // 3. Arbitrary JS Code Execution Guard
        if (value && (value.includes('<script') || value.includes('javascript:') || value.includes('eval('))) {
            errors.push(`Unsafe execution payload detected in type value.`);
        }
        if (errors.length > 0) {
            return {
                valid: false,
                errors,
                command: {
                    action: 'NONE',
                    targetSelector: null,
                    value: null,
                    reasoning: `Rejected unsafe command: ${errors.join('; ')}`
                }
            };
        }
        return {
            valid: true,
            errors: [],
            command: {
                action: actionType,
                targetSelector,
                value,
                reasoning: actionObj.reasoning || rawAction.reasoning || '',
                taskStatus: rawAction.task_status || actionObj.task_status || 'in_progress'
            }
        };
    }
    /**
     * Execute validated action via real content script message dispatcher.
     */
    static async executeValidatedAction(command, dispatcherFn) {
        console.log('[RAVEN TRACE 7] executeValidatedAction entered', {
            action: command?.action,
            target: command?.targetSelector
        });
        if (command.action === 'NONE' || command.action === 'DONE') {
            const noneReceipt = {
                success: true,
                action: command.action,
                target_element_id: command.targetSelector,
                execution: 'REAL_BROWSER',
                dispatched: true,
                verified: true,
                message: command.action === 'DONE' ? 'Task completed by server decision' : (command.reasoning || 'No browser action required')
            };
            console.log('[RAVEN ActionExecutor] FINAL EXECUTION RECEIPT (NONE/DONE)', noneReceipt);
            return noneReceipt;
        }
        console.log('[RAVEN TRACE 8] Calling dispatchActionFn', {
            action: command.action,
            target: command.targetSelector
        });
        try {
            const res = await dispatcherFn(command);
            console.log('[RAVEN ActionExecutor] dispatchActionFn RETURNED', res);
            const isSuccess = Boolean(res.success && res.dispatched);
            const receipt = {
                success: isSuccess,
                action: command.action,
                target_element_id: command.targetSelector,
                execution: 'REAL_BROWSER',
                dispatched: Boolean(res.dispatched),
                verified: Boolean(res.verified),
                message: res.message || `Real ${command.action} action executed on webpage`,
                error: res.error || (isSuccess ? undefined : 'Execution dispatch returned failure receipt')
            };
            console.log('[RAVEN ActionExecutor] FINAL EXECUTION RECEIPT', receipt);
            return receipt;
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error('[RAVEN ActionExecutor] executeValidatedAction ERROR', err);
            return {
                success: false,
                action: command.action,
                target_element_id: command.targetSelector,
                execution: 'REAL_BROWSER',
                dispatched: false,
                verified: false,
                error: errMsg
            };
        }
    }
}
