/**
 * AgentController — 3-Phase Autonomous Task Lifecycle & Monotonic State Machine (M11.2).
 *
 * Enforces a strict, monotonic Task State Machine (IDLE -> LOCAL_ANALYSIS -> SERVER_PLANNING -> EXECUTING -> VERIFYING -> COMPLETED/FAILED).
 * Guarantees a single taskId per task, non-resetting page re-observations, atomic action execution,
 * server request deduplication, action fingerprinting, and a hard completion latch.
 */
import { PerceptionAdapter } from '../integration/perceptionAdapter.js';
import { Person1Bridge } from '../integration/person1Bridge.js';
import { ActionExecutor } from './actionExecutor.js';
import { GoalManager } from './goalManager.js';
import { ActionMemory } from './actionMemory.js';
import { createPageFingerprint } from './pageFingerprint.js';
import { ActionGuard } from './actionDeduplication.js';
import { TaskIntentParser } from './taskIntent.js';
const PHASE_ORDER = {
    IDLE: 0,
    LOCAL_ANALYSIS: 1,
    SERVER_PLANNING: 2,
    EXECUTING: 3,
    VERIFYING: 4,
    COMPLETED: 5,
    FAILED: 5
};
export function assertValidPhaseTransition(previous, next) {
    if (previous === next)
        return true;
    if (previous === 'COMPLETED' || previous === 'FAILED') {
        console.error(`[RAVEN:STATE] INVALID PHASE TRANSITION FROM TERMINAL STATE: ${previous} → ${next}`);
        return false;
    }
    const prevRank = PHASE_ORDER[previous] ?? 0;
    const nextRank = PHASE_ORDER[next] ?? 0;
    if (nextRank < prevRank) {
        console.error(`[RAVEN:STATE] INVALID BACKWARD PHASE TRANSITION ${previous} → ${next}`);
        return false;
    }
    return true;
}
export function actionFingerprint(command) {
    return [
        command.action,
        command.targetSelector ?? '',
        command.value ?? '',
        command.direction ?? ''
    ].join('|');
}
export function computeObservationHash(url, elements) {
    const elemSummary = elements.map(e => `${e.id || ''}:${e.tag || ''}:${e.value || ''}:${e.visibleText || ''}`).join(';');
    let hash = 0;
    const str = `${url}|${elemSummary}`;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return `obs_${Math.abs(hash).toString(36)}`;
}
export function serverRequestFingerprint(taskId, subGoal, observationHash) {
    return `${taskId}:${subGoal}:${observationHash}`;
}
export class AgentController {
    taskId = '';
    taskGoal = '';
    currentTaskIntent;
    currentIteration = 1;
    maxIterations = 10;
    maxActionRetries = 2;
    currentActionRetries = 0;
    status = 'IDLE';
    executionHistory = [];
    goalManager = new GoalManager();
    actionMemory = new ActionMemory();
    privacyChecksCount = 0;
    protectedItemsCount = 0;
    serverDecisionsCount = 0;
    taskState;
    stabilizeDelayMs = 600;
    previousFingerprint;
    constructor(config) {
        if (config?.maxIterations !== undefined)
            this.maxIterations = config.maxIterations;
        if (config?.maxActionRetries !== undefined)
            this.maxActionRetries = config.maxActionRetries;
        if (config?.stabilizeDelayMs !== undefined)
            this.stabilizeDelayMs = config.stabilizeDelayMs;
        this.taskId = `TASK-${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        this.taskState = {
            taskId: this.taskId,
            goal: '',
            phase: 'IDLE',
            startedAt: Date.now(),
            completedSubGoals: [],
            actionHistory: [],
            executedActionFingerprints: new Set(),
            serverRequestFingerprints: new Set(),
            phase1Completed: false,
            phase2Completed: false,
            phase3Completed: false,
            taskCompleted: false,
            stopped: false
        };
    }
    /**
     * Reset controller state for a new user task goal.
     * Creates a fresh taskId and parses TaskIntent with value provenance (M11.1/M11.2).
     */
    initTask(goal) {
        this.taskId = `TASK-${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        this.taskGoal = goal;
        this.currentTaskIntent = TaskIntentParser.parseGoal(goal);
        this.currentIteration = 1;
        this.currentActionRetries = 0;
        this.status = 'IDLE';
        this.executionHistory = [];
        this.privacyChecksCount = 0;
        this.protectedItemsCount = 0;
        this.serverDecisionsCount = 0;
        this.previousFingerprint = undefined;
        this.taskState = {
            taskId: this.taskId,
            goal: goal,
            phase: 'IDLE',
            startedAt: Date.now(),
            expectedIntent: this.currentTaskIntent,
            completedSubGoals: [],
            actionHistory: [],
            executedActionFingerprints: new Set(),
            serverRequestFingerprints: new Set(),
            phase1Completed: false,
            phase2Completed: false,
            phase3Completed: false,
            taskCompleted: false,
            stopped: false
        };
        this.actionMemory.setTaskId(this.taskId);
        this.actionMemory.clear();
        this.goalManager.initialize(goal);
        console.log(`[RAVEN:TASK] ${this.taskId} CREATED`);
        console.log(`[RAVEN:STATE] ${this.taskId} PHASE: IDLE`);
        console.log(`[RAVEN:GOAL] initialized task ${this.taskId} with goal: "${goal}"`);
    }
    getTaskState() {
        return {
            ...this.taskState,
            completedSubGoals: [...this.taskState.completedSubGoals],
            executedActionFingerprints: new Set(this.taskState.executedActionFingerprints),
            serverRequestFingerprints: new Set(this.taskState.serverRequestFingerprints)
        };
    }
    transitionToPhase(nextPhase) {
        const prev = this.taskState.phase;
        if (!assertValidPhaseTransition(prev, nextPhase)) {
            return false;
        }
        this.taskState.phase = nextPhase;
        console.log(`[RAVEN:STATE] ${this.taskId} TRANSITION: ${prev} → ${nextPhase}`);
        return true;
    }
    completeTask(reason) {
        if (this.taskState.taskCompleted || this.taskState.stopped) {
            return;
        }
        const intentValue = this.currentTaskIntent?.value?.value;
        const effectiveReason = (this.goalManager.getState().completionReason && this.goalManager.getState().completionReason !== 'Task in progress')
            ? this.goalManager.getState().completionReason
            : (intentValue && !reason.includes(intentValue))
                ? `✓ Goal finished for '${intentValue}'. (${reason})`
                : reason;
        this.taskState.taskCompleted = true;
        this.taskState.stopped = true;
        this.taskState.phase = 'COMPLETED';
        this.status = 'COMPLETED';
        console.log(`[RAVEN:TASK] ${this.taskId} COMPLETED: ${effectiveReason}`);
        console.log(`[RAVEN:STOP] ${this.taskId} Agent execution halted.`);
    }
    failTask(reason) {
        if (this.taskState.taskCompleted || this.taskState.stopped) {
            return;
        }
        this.taskState.taskCompleted = false;
        this.taskState.stopped = true;
        this.transitionToPhase('FAILED');
        this.taskState.completedAt = Date.now();
        if (!['TRANSMISSION_BLOCKED', 'ACTION_REJECTED', 'SERVER_UNAVAILABLE', 'TARGET_NOT_FOUND', 'MAX_STEPS_REACHED'].includes(this.status)) {
            this.status = 'TASK_FAILED';
        }
        console.log(`[RAVEN:TASK] ${this.taskId} FAILED: ${reason}`);
        console.log(`[RAVEN:STOP] ${this.taskId} Agent execution halted.`);
    }
    /**
     * Observe current page state without resetting task lifecycle, phase, or taskId.
     */
    async observeCurrentPage(queryDomFn, runPerceptionFn) {
        if (this.taskState.stopped) {
            throw new Error(`[RAVEN:TASK] Cannot observe on stopped task ${this.taskId}`);
        }
        console.log(`[RAVEN:P1] DOM extraction starting...`);
        const rawDomElements = await queryDomFn();
        console.log(`[RAVEN:P1] DOM complete`, { domCount: rawDomElements.length });
        const perceptionResult = await runPerceptionFn();
        const classifiedDom = Person1Bridge.SensitivityDetector.classifyElements(rawDomElements);
        const integratedElements = PerceptionAdapter.mergePerceptionWithDOM(classifiedDom, perceptionResult);
        const redactedElements = Person1Bridge.RedactionEngine.redactElements(integratedElements);
        const sanitizedPayload = Person1Bridge.Sanitizer.sanitizeContext(redactedElements);
        const currentFingerprint = createPageFingerprint(sanitizedPayload);
        console.log(`[RAVEN:FINGERPRINT] current: ${currentFingerprint.fingerprint}`);
        if (this.previousFingerprint) {
            console.log(`[RAVEN:FINGERPRINT] previous: ${this.previousFingerprint.fingerprint}`);
        }
        const stepRedactedCount = sanitizedPayload.elements.filter((e) => e.redacted === true).length;
        this.protectedItemsCount += stepRedactedCount;
        this.privacyChecksCount++;
        return { sanitizedPayload, currentFingerprint, stepRedactedCount };
    }
    /**
     * Main Autonomous Execution Step Engine.
     * PHASE 1 (LOCAL_ANALYSIS): Runs M1-M6 perception & local privacy check EXACTLY ONCE per task.
     * PHASE 2 (SERVER_PLANNING/EXECUTING): Fast-Path or Server AI reasoning & real browser action dispatch.
     * PHASE 3 (VERIFYING): Local verification, causal diff, & sub-goal satisfaction.
     */
    async executeIteration(queryDomFn, runPerceptionFn, dispatchActionFn, onStateChange) {
        // HARD TERMINAL LATCH GUARD
        if (this.taskState.stopped || this.taskState.taskCompleted || this.status === 'COMPLETED') {
            console.log(`[RAVEN:GUARD] ${this.taskId} ACTION BLOCKED — TASK ALREADY COMPLETED`);
            const reasonMsg = this.goalManager.getState().completionReason || 'Task completed and verified.';
            return { done: true, success: true, status: 'COMPLETED', message: reasonMsg };
        }
        if (this.currentIteration > this.maxIterations) {
            const msg = 'Task stopped: maximum agent steps reached.';
            this.failTask(msg);
            onStateChange?.(this.status, msg);
            return { done: true, success: false, status: this.status, message: msg };
        }
        const currentStep = this.currentIteration;
        // ==========================================
        // PHASE 1 — LOCAL ANALYSIS & PRIVACY ENFORCEMENT
        // (EXECUTES EXACTLY ONCE PER TASK)
        // ==========================================
        let sanitizedPayload;
        let currentFingerprint;
        let stepRedactedCount;
        if (!this.taskState.phase1Completed) {
            this.transitionToPhase('LOCAL_ANALYSIS');
            this.status = 'PHASE_1_ANALYSIS';
            onStateChange?.(this.status, 'Phase 1/3: Analyzing page state & enforcing local privacy...');
            const obs = await this.observeCurrentPage(queryDomFn, runPerceptionFn);
            sanitizedPayload = obs.sanitizedPayload;
            currentFingerprint = obs.currentFingerprint;
            stepRedactedCount = obs.stepRedactedCount;
            const gateCheck = Person1Bridge.Sanitizer.outboundCheck(sanitizedPayload);
            if (!gateCheck.safe) {
                this.status = 'TRANSMISSION_BLOCKED';
                this.taskState.stopped = true;
                this.transitionToPhase('FAILED');
                const errMsg = `Outbound privacy leak detected in iteration ${currentStep}. Transmission blocked by RAVEN gate.`;
                console.error('[RAVEN:PRIVACY] OUTBOUND_GATE REJECTED', errMsg);
                onStateChange?.(this.status, errMsg);
                this.recordStep({
                    step: currentStep,
                    goal: this.taskGoal,
                    status: this.status,
                    privacySafe: false,
                    redactedCount: stepRedactedCount,
                    message: errMsg,
                    timestamp: new Date().toISOString()
                });
                return { done: true, success: false, status: this.status, message: errMsg };
            }
            console.log('[RAVEN:PRIVACY] OUTBOUND_GATE PASSED');
            this.taskState.phase1Completed = true;
            console.log(`[RAVEN:TASK] ${this.taskId} PHASE 1 COMPLETE`);
        }
        else {
            // Re-observation on subsequent iterations (DOES NOT RESTART PHASE 1)
            const obs = await this.observeCurrentPage(queryDomFn, runPerceptionFn);
            sanitizedPayload = obs.sanitizedPayload;
            currentFingerprint = obs.currentFingerprint;
            stepRedactedCount = obs.stepRedactedCount;
        }
        // Post-Observation Check: Is Goal already complete or satisfied?
        const isCompleteOnReobserve = this.goalManager.isComplete() || this.goalManager.evaluateCompletion(sanitizedPayload);
        if (isCompleteOnReobserve && (this.currentIteration > 1 || this.actionMemory.getHistory().some(a => a.executionStatus === 'VERIFIED'))) {
            const reasonMsg = this.goalManager.getState().completionReason || `✓ Goal completed and verified on current page state.`;
            console.log(`[RAVEN:GOAL] completion evaluated: ${reasonMsg}`);
            this.recordStep({
                step: currentStep,
                goal: this.taskGoal,
                status: 'COMPLETED',
                privacySafe: true,
                redactedCount: stepRedactedCount,
                actionTaken: 'DONE',
                targetSelector: null,
                message: reasonMsg,
                timestamp: new Date().toISOString(),
                execution: 'REAL_BROWSER',
                dispatched: false,
                verified: true
            });
            this.completeTask(reasonMsg);
            onStateChange?.('COMPLETED', reasonMsg);
            return { done: true, success: true, status: 'COMPLETED', message: reasonMsg };
        }
        // ==========================================
        // FAST PATH — DETERMINISTIC TASK BYPASS
        // ==========================================
        const fastCommand = this.getFastPathCommand(sanitizedPayload.elements);
        if (fastCommand) {
            console.log('[RAVEN:FAST_PATH] Simple deterministic action grounded locally:', fastCommand.action);
            const fp = actionFingerprint(fastCommand);
            if (this.taskState.executedActionFingerprints.has(fp)) {
                console.log(`[RAVEN:GUARD] DUPLICATE ACTION BLOCKED: ${fp}`);
                const targetValue = this.currentTaskIntent?.value?.value || '';
                const gmReason = this.goalManager.getState().completionReason;
                const validReason = (gmReason && gmReason !== 'Task in progress') ? gmReason : null;
                const msg = validReason || `✓ Goal finished for '${targetValue}'. Action ${fastCommand.action} already executed — stopping duplicate repetition.`;
                this.completeTask(msg);
                onStateChange?.('COMPLETED', msg);
                return { done: true, success: true, status: 'COMPLETED', message: msg };
            }
            const guardResult = ActionGuard.shouldExecuteAction(fastCommand, {
                goalManager: this.goalManager,
                actionMemory: this.actionMemory,
                currentScreenElements: sanitizedPayload.elements,
                currentPageFingerprint: currentFingerprint.fingerprint,
                taskIntent: this.currentTaskIntent
            });
            if (!guardResult.approved) {
                console.log(`[RAVEN:GUARD] action rejected: ${guardResult.reason}`);
                if (guardResult.reason === 'ACTION_ALREADY_VERIFIED' || guardResult.reason === 'GOAL_ALREADY_COMPLETE' || guardResult.reason === 'REDUNDANT_ACTION') {
                    const targetValue = this.currentTaskIntent?.value?.value || '';
                    const rawMsg = guardResult.message || `Task complete.`;
                    const msg = (targetValue && !rawMsg.includes(targetValue))
                        ? `✓ Action ${fastCommand.action} already executed for '${targetValue}'. (${rawMsg})`
                        : rawMsg;
                    this.completeTask(msg);
                    onStateChange?.('COMPLETED', msg);
                    return { done: true, success: true, status: 'COMPLETED', message: msg };
                }
            }
            else {
                return await this.executeAndVerifyAction(fastCommand, sanitizedPayload, currentFingerprint, dispatchActionFn, onStateChange);
            }
        }
        // ==========================================
        // PHASE 2 — SERVER REASONING & ACTION EXECUTION
        // ==========================================
        this.transitionToPhase('SERVER_PLANNING');
        this.status = 'PHASE_2_EXECUTION';
        onStateChange?.(this.status, 'Phase 2/3: Server AI reasoning & real browser action dispatch...');
        // SERVER REQUEST DEDUPLICATION GUARD
        const currentSub = this.goalManager.getState().currentSubGoal || this.taskGoal;
        const obsHash = computeObservationHash(sanitizedPayload.url_domain || 'localhost', sanitizedPayload.elements);
        const reqFp = serverRequestFingerprint(this.taskId, currentSub, obsHash);
        if (this.taskState.serverRequestFingerprints.has(reqFp)) {
            console.log(`[RAVEN:GUARD] DUPLICATE SERVER REQUEST BLOCKED: ${reqFp}`);
            this.transitionToPhase('VERIFYING');
            const msg = `Duplicate server request blocked — page state unchanged.`;
            this.completeTask(msg);
            onStateChange?.('COMPLETED', msg);
            return { done: true, success: true, status: 'COMPLETED', message: msg };
        }
        else {
            this.taskState.serverRequestFingerprints.add(reqFp);
        }
        const execContext = {
            goal_status: this.goalManager.getState().status,
            current_sub_goal: currentSub,
            completed_actions: this.actionMemory.getHistory().filter(a => a.executionStatus === 'VERIFIED').map(a => `${a.type}:${a.targetElementId || a.targetText || ''}`),
            recent_actions: this.actionMemory.getHistory().slice(-3).map(a => `${a.type}:${a.executionStatus}`),
            last_action: this.actionMemory.getLastAction() || null,
            previous_page_fingerprint: this.previousFingerprint?.fingerprint || null,
            current_page_fingerprint: currentFingerprint.fingerprint
        };
        const wirePayload = Person1Bridge.ServerAdapter.buildOutboundPayload(sanitizedPayload, this.taskGoal, execContext, this.currentTaskIntent);
        const serverResponse = await Person1Bridge.ServerAdapter.sendToServer(wirePayload);
        this.serverDecisionsCount++;
        if (!serverResponse.ok) {
            if (serverResponse.status === 400) {
                this.status = 'ACTION_REJECTED';
                const msg = `Server rejected request: ${serverResponse.body?.error || 'Security check failed'}`;
                this.failTask(msg);
                onStateChange?.(this.status, msg);
                return { done: true, success: false, status: this.status, message: msg };
            }
            else {
                this.status = 'SERVER_UNAVAILABLE';
                const msg = `Cannot reach RAVEN server at http://localhost:8000/agent/act`;
                this.failTask(msg);
                onStateChange?.(this.status, msg);
                return { done: true, success: false, status: this.status, message: msg };
            }
        }
        const valResult = ActionExecutor.validateAction(serverResponse.body || serverResponse, wirePayload.screen_state.elements);
        if (!valResult.valid) {
            const isTargetErr = valResult.errors.some(e => e.includes('not present in the currently analyzed page state'));
            this.status = isTargetErr ? 'TARGET_NOT_FOUND' : 'ACTION_REJECTED';
            const msg = `Server command validation failed: ${valResult.errors.join('; ')}`;
            this.failTask(msg);
            onStateChange?.(this.status, msg);
            return { done: true, success: false, status: this.status, message: msg };
        }
        const command = valResult.command;
        this.transitionToPhase('EXECUTING');
        console.log('[RAVEN:SERVER] ACTION proposed:', command.action, { target: command.targetSelector });
        // Server Response Value Validation (M11.1): User Intent Value Provenance Override
        if (command.action === 'TYPE' && this.currentTaskIntent?.value) {
            const expectedUserValue = this.currentTaskIntent.value.value;
            if (this.currentTaskIntent.value.source === 'USER_GOAL' && expectedUserValue && command.value !== expectedUserValue) {
                console.log(`[RAVEN:GUARD] SERVER_ACTION_VALUE_MISMATCH. Server proposed: "${command.value}", User goal requested: "${expectedUserValue}"`);
                console.log(`[RAVEN:GUARD] Overriding server value with explicit user goal value: "${expectedUserValue}"`);
                command.value = expectedUserValue;
            }
        }
        // Handle DONE action proposal
        const isServerCompleted = (serverResponse.body?.task_status === 'completed') || (command.action === 'DONE');
        if (isServerCompleted) {
            const isSatisfied = this.goalManager.evaluateCompletion(sanitizedPayload, { verified: true, taskCompleted: true });
            if (isSatisfied || this.actionMemory.getHistory().some(a => a.executionStatus === 'VERIFIED')) {
                this.taskState.phase2Completed = true;
                console.log(`[RAVEN:TASK] ${this.taskId} PHASE 2 COMPLETE`);
                this.transitionToPhase('VERIFYING');
                this.taskState.phase3Completed = true;
                console.log(`[RAVEN:TASK] ${this.taskId} PHASE 3 COMPLETE`);
                const reasonMsg = this.goalManager.getState().completionReason || command.reasoning || `✓ Task finished successfully.`;
                this.recordStep({
                    step: currentStep, goal: this.taskGoal, status: 'COMPLETED', privacySafe: true, redactedCount: stepRedactedCount,
                    actionTaken: 'DONE', targetSelector: null, message: reasonMsg, timestamp: new Date().toISOString(), execution: 'REAL_BROWSER', dispatched: false, verified: true
                });
                this.completeTask(reasonMsg);
                onStateChange?.('COMPLETED', reasonMsg);
                return { done: true, success: true, status: 'COMPLETED', message: reasonMsg };
            }
        }
        // Check Action Fingerprint for Server Proposed Action
        const cmdFp = actionFingerprint(command);
        if (this.taskState.executedActionFingerprints.has(cmdFp)) {
            console.log(`[RAVEN:GUARD] DUPLICATE ACTION BLOCKED: ${cmdFp}`);
            const msg = `Action ${command.action} on ${command.targetSelector || 'target'} already executed — blocking duplicate.`;
            this.completeTask(msg);
            onStateChange?.('COMPLETED', msg);
            return { done: true, success: true, status: 'COMPLETED', message: msg };
        }
        // Action Deduplication & Guard Check
        const guardResult = ActionGuard.shouldExecuteAction(command, {
            goalManager: this.goalManager,
            actionMemory: this.actionMemory,
            currentScreenElements: sanitizedPayload.elements,
            currentPageFingerprint: currentFingerprint.fingerprint,
            taskIntent: this.currentTaskIntent
        });
        if (!guardResult.approved) {
            console.log(`[RAVEN:GUARD] action rejected: ${guardResult.reason}`);
            const targetValue = this.currentTaskIntent?.value?.value || '';
            const rawMsg = guardResult.message || `Action ${command.action} already completed & verified. Stopping repetition.`;
            const msg = (targetValue && !rawMsg.includes(targetValue))
                ? `✓ Action ${command.action} already executed for '${targetValue}'. (${rawMsg})`
                : rawMsg;
            this.completeTask(msg);
            const gmReason = this.goalManager.getState().completionReason;
            const finalMsg = (gmReason && gmReason !== 'Task in progress') ? gmReason : msg;
            onStateChange?.('COMPLETED', finalMsg);
            return { done: true, success: true, status: 'COMPLETED', message: finalMsg };
        }
        this.taskState.phase2Completed = true;
        console.log(`[RAVEN:TASK] ${this.taskId} PHASE 2 COMPLETE`);
        return await this.executeAndVerifyAction(command, sanitizedPayload, currentFingerprint, dispatchActionFn, onStateChange);
    }
    /**
     * Helper to execute real browser action, verify result, and update GoalManager / ActionMemory.
     */
    async executeAndVerifyAction(command, sanitizedPayload, currentFingerprint, dispatchActionFn, onStateChange) {
        const currentStep = this.currentIteration;
        // Record action proposal in ledger
        const ledgerEntry = this.actionMemory.recordAction({
            type: command.action,
            targetElementId: command.targetSelector || undefined,
            value: command.value || undefined,
            pageFingerprintBefore: currentFingerprint.fingerprint
        });
        console.log('[RAVEN:BROWSER] executing dispatching action to content script...', command);
        const execReceipt = await ActionExecutor.executeValidatedAction(command, dispatchActionFn);
        console.log('[RAVEN:BROWSER] receipt:', execReceipt);
        this.actionMemory.markExecuted(ledgerEntry.actionId);
        const isDispatchRequired = command.action !== 'NONE' && command.action !== 'DONE';
        if (!execReceipt.success || (isDispatchRequired && !execReceipt.dispatched)) {
            this.actionMemory.markFailed(ledgerEntry.actionId, execReceipt.error || 'Dispatch failed');
            this.currentActionRetries++;
            if (this.currentActionRetries <= this.maxActionRetries) {
                console.log(`[RAVEN:VERIFY] failure — retrying action (attempt ${this.currentActionRetries}/${this.maxActionRetries})...`);
                await new Promise(r => setTimeout(r, this.stabilizeDelayMs));
                this.currentIteration++;
                return { done: false, success: false, status: 'PHASE_3_VERIFICATION', message: `Execution failed. Retrying action (${this.currentActionRetries}/${this.maxActionRetries})...` };
            }
            this.status = 'TASK_FAILED';
            const msg = `Action execution failed: ${execReceipt.error || 'Execution dispatch failed'}`;
            this.failTask(msg);
            onStateChange?.(this.status, msg);
            return { done: true, success: false, status: this.status, message: msg };
        }
        // Reset retry counter on execution dispatch success
        this.currentActionRetries = 0;
        // ==========================================
        // PHASE 3 — LOCAL VERIFICATION & CAUSAL STATE DIFF
        // ==========================================
        this.transitionToPhase('VERIFYING');
        this.status = 'PHASE_3_VERIFICATION';
        onStateChange?.(this.status, `Phase 3/3: Verifying action effect (${command.action}) on page state...`);
        console.log('[RAVEN:VERIFY] verifying action receipt:', execReceipt);
        const verifiedSuccess = Boolean(execReceipt.verified);
        if (verifiedSuccess) {
            console.log('[RAVEN:VERIFY] success');
            this.taskState.executedActionFingerprints.add(actionFingerprint(command));
            this.taskState.phase3Completed = true;
            console.log(`[RAVEN:TASK] ${this.taskId} PHASE 3 COMPLETE`);
            this.actionMemory.markVerified(ledgerEntry.actionId, execReceipt.message, false, currentFingerprint.fingerprint);
            const actionKey = `${command.action}:${command.targetSelector || ''}:${command.value || ''}`;
            this.goalManager.markActionComplete(actionKey);
            // Check sub-goal progress matching executed action
            const currentSub = this.goalManager.getState().currentSubGoal;
            if (currentSub) {
                const lowerSub = currentSub.toLowerCase();
                const act = command.action.toLowerCase();
                if (lowerSub.includes(act) || lowerSub.includes('find') || (act === 'type' && lowerSub.includes('enter')) || (act === 'click' && lowerSub.includes('submit'))) {
                    this.goalManager.markSubGoalComplete(currentSub);
                }
            }
            if (this.goalManager.isComplete()) {
                this.completeTask(this.goalManager.getState().completionReason || 'Goal completed and verified.');
            }
            this.previousFingerprint = currentFingerprint;
            this.recordStep({
                step: currentStep,
                goal: this.taskGoal,
                status: (this.taskState.taskCompleted || this.status === 'COMPLETED') ? 'COMPLETED' : 'PHASE_3_VERIFICATION',
                privacySafe: true,
                redactedCount: 0,
                actionTaken: command.action,
                targetSelector: command.targetSelector,
                message: execReceipt.message,
                timestamp: new Date().toISOString(),
                execution: 'REAL_BROWSER',
                dispatched: execReceipt.dispatched,
                verified: true
            });
            if (this.taskState.taskCompleted || this.taskState.stopped || this.status === 'COMPLETED') {
                const reasonMsg = this.goalManager.getState().completionReason || execReceipt.message || 'Task completed';
                return { done: true, success: true, status: 'COMPLETED', message: reasonMsg };
            }
            await new Promise(r => setTimeout(r, this.stabilizeDelayMs));
            this.currentIteration++;
            return { done: false, success: true, status: 'PHASE_3_VERIFICATION', message: execReceipt.message || 'Action executed' };
        }
        this.actionMemory.markFailed(ledgerEntry.actionId, 'Verification failed');
        console.log('[RAVEN:VERIFY] failure');
        await new Promise(r => setTimeout(r, this.stabilizeDelayMs));
        this.currentIteration++;
        return { done: false, success: false, status: 'PHASE_3_VERIFICATION', message: 'Verification failed' };
    }
    /**
     * Fast Path helper for simple deterministic tasks ("Scroll down", "Click Login", "Search 'gokul'").
     * Grounds explicit user values from TaskIntent with ZERO hardcoded fallback values!
     */
    getFastPathCommand(elements) {
        const lowerGoal = this.taskGoal.trim().toLowerCase();
        const intent = this.currentTaskIntent;
        // Fast Path: "Scroll down" or "Scroll up"
        if (lowerGoal === 'scroll down' || lowerGoal === 'scroll' || lowerGoal === 'scroll up') {
            return {
                action: 'SCROLL',
                targetSelector: null,
                value: lowerGoal.includes('up') ? 'UP' : 'DOWN',
                reasoning: 'Fast path deterministic scroll'
            };
        }
        // Fast Path: "Click Login" or "Click Submit"
        if (lowerGoal === 'click login' || lowerGoal === 'click submit') {
            const kw = lowerGoal.includes('login') ? 'login' : 'submit';
            const target = elements.find((el) => {
                const text = String(el.visibleText || el.text || el.id || '').toLowerCase();
                return text.includes(kw);
            });
            if (target) {
                return {
                    action: 'CLICK',
                    targetSelector: String(target.id || target.dom_selector || `el_0`),
                    value: null,
                    reasoning: `Fast path deterministic click on "${kw}"`
                };
            }
        }
        // Fast Path: Search or Type with explicit user value (M11.1)
        if ((intent?.intent === 'SEARCH' || intent?.intent === 'TYPE') && intent.value?.value) {
            const targetKw = intent.target?.toLowerCase() || 'search';
            const userValue = intent.value.value;
            const targetEl = elements.find((el) => {
                const text = String(el.visibleText || el.text || el.id || el.name || el.placeholder || '').toLowerCase();
                const role = String(el.type || el.tag || '').toLowerCase();
                return text.includes(targetKw) || text.includes('search') || role.includes('search') || role.includes('input');
            });
            if (targetEl && !this.actionMemory.hasVerifiedAction('TYPE', String(targetEl.id || targetEl.dom_selector || `el_0`))) {
                return {
                    action: 'TYPE',
                    targetSelector: String(targetEl.id || targetEl.dom_selector || `el_0`),
                    value: userValue,
                    reasoning: `Fast path explicit user value type "${userValue}" into ${targetKw}`
                };
            }
        }
        return null;
    }
    recordStep(rec) {
        this.executionHistory.push(rec);
        this.taskState.actionHistory.push(rec);
    }
}
