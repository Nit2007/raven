/**
 * AgentController — 3-Phase Autonomous Task Lifecycle & Monotonic State Machine (M11.2).
 *
 * Enforces a strict, monotonic Task State Machine (IDLE -> LOCAL_ANALYSIS -> SERVER_PLANNING -> EXECUTING -> VERIFYING -> COMPLETED/FAILED).
 * Guarantees a single taskId per task, non-resetting page re-observations, atomic action execution,
 * server request deduplication, action fingerprinting, and a hard completion latch.
 */
import { ElementInfo } from '../integration/perceptionAdapter.js';
import { ValidatedCommand, ActionReceipt } from './actionExecutor.js';
import { GoalManager } from './goalManager.js';
import { ActionMemory } from './actionMemory.js';
import { PageFingerprintResult } from './pageFingerprint.js';
import { TaskIntent } from './taskIntent.js';
export type AgentStatus = 'IDLE' | 'ANALYZING' | 'PROTECTING' | 'PHASE_1_ANALYSIS' | 'PHASE_2_EXECUTION' | 'PHASE_3_VERIFICATION' | 'SERVER_THINKING' | 'ACTION_APPROVED' | 'EXECUTING' | 'OBSERVING' | 'COMPLETED' | 'TRANSMISSION_BLOCKED' | 'SERVER_UNAVAILABLE' | 'ACTION_REJECTED' | 'TARGET_NOT_FOUND' | 'MAX_STEPS_REACHED' | 'TASK_FAILED' | 'FAILED' | 'VERIFYING' | 'ERROR';
export type AgentPhase = 'IDLE' | 'LOCAL_ANALYSIS' | 'SERVER_PLANNING' | 'EXECUTING' | 'VERIFYING' | 'COMPLETED' | 'FAILED';
export interface AgentTaskState {
    taskId: string;
    goal: string;
    phase: AgentPhase;
    startedAt: number;
    completedAt?: number;
    expectedIntent?: TaskIntent;
    currentSubGoal?: string;
    completedSubGoals: string[];
    actionHistory: AgentExecutionRecord[];
    executedActionFingerprints: Set<string>;
    serverRequestFingerprints: Set<string>;
    phase1Completed: boolean;
    phase2Completed: boolean;
    phase3Completed: boolean;
    taskCompleted: boolean;
    stopped: boolean;
}
export interface AgentExecutionRecord {
    step: number;
    goal: string;
    status: AgentStatus;
    privacySafe: boolean;
    redactedCount: number;
    actionTaken?: string;
    targetSelector?: string | null;
    message?: string;
    timestamp: string;
    execution?: 'REAL_BROWSER';
    dispatched?: boolean;
    verified?: boolean;
}
export interface AgentIterationResult {
    done: boolean;
    success: boolean;
    status: AgentStatus;
    message: string;
}
export declare function assertValidPhaseTransition(previous: AgentPhase, next: AgentPhase): boolean;
export declare function actionFingerprint(command: ValidatedCommand): string;
export declare function computeObservationHash(url: string, elements: any[]): string;
export declare function serverRequestFingerprint(taskId: string, subGoal: string, observationHash: string): string;
export declare class AgentController {
    taskId: string;
    taskGoal: string;
    currentTaskIntent?: TaskIntent;
    currentIteration: number;
    maxIterations: number;
    maxActionRetries: number;
    currentActionRetries: number;
    status: AgentStatus;
    executionHistory: AgentExecutionRecord[];
    goalManager: GoalManager;
    actionMemory: ActionMemory;
    privacyChecksCount: number;
    protectedItemsCount: number;
    serverDecisionsCount: number;
    taskState: AgentTaskState;
    private stabilizeDelayMs;
    private previousFingerprint?;
    constructor(config?: {
        maxIterations?: number;
        maxActionRetries?: number;
        stabilizeDelayMs?: number;
    });
    /**
     * Reset controller state for a new user task goal.
     * Creates a fresh taskId and parses TaskIntent with value provenance (M11.1/M11.2).
     */
    initTask(goal: string): void;
    getTaskState(): AgentTaskState;
    transitionToPhase(nextPhase: AgentPhase): boolean;
    completeTask(reason: string): void;
    failTask(reason: string): void;
    /**
     * Observe current page state without resetting task lifecycle, phase, or taskId.
     */
    observeCurrentPage(queryDomFn: () => Promise<ElementInfo[]>, runPerceptionFn: () => Promise<any>): Promise<{
        sanitizedPayload: any;
        currentFingerprint: PageFingerprintResult;
        stepRedactedCount: number;
    }>;
    /**
     * Main Autonomous Execution Step Engine.
     * PHASE 1 (LOCAL_ANALYSIS): Runs M1-M6 perception & local privacy check EXACTLY ONCE per task.
     * PHASE 2 (SERVER_PLANNING/EXECUTING): Fast-Path or Server AI reasoning & real browser action dispatch.
     * PHASE 3 (VERIFYING): Local verification, causal diff, & sub-goal satisfaction.
     */
    executeIteration(queryDomFn: () => Promise<ElementInfo[]>, runPerceptionFn: () => Promise<any>, dispatchActionFn: (command: ValidatedCommand) => Promise<ActionReceipt>, onStateChange?: (status: AgentStatus, message?: string) => void): Promise<AgentIterationResult>;
    /**
     * Helper to execute real browser action, verify result, and update GoalManager / ActionMemory.
     */
    private executeAndVerifyAction;
    /**
     * Fast Path helper for simple deterministic tasks ("Scroll down", "Click Login", "Search 'gokul'").
     * Grounds explicit user values from TaskIntent with ZERO hardcoded fallback values!
     */
    private getFastPathCommand;
    recordStep(rec: AgentExecutionRecord): void;
}
