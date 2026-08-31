/**
 * ActionDeduplication — Guard validator before browser action execution.
 *
 * Enforces the core M11 & M11.1 rules:
 * 1. "An element existing on the page does NOT mean the action should be executed."
 * 2. "User intent explicit values MUST override stale, cached, or server-generated values."
 */
import { GoalManager } from './goalManager.js';
import { ActionMemory } from './actionMemory.js';
import { ValidatedCommand } from './actionExecutor.js';
import { TaskIntent } from './taskIntent.js';
export type ActionRejectionReason = 'GOAL_ALREADY_COMPLETE' | 'SUBGOAL_ALREADY_COMPLETE' | 'ACTION_ALREADY_VERIFIED' | 'REDUNDANT_ACTION' | 'ACTION_DOES_NOT_ADVANCE_GOAL' | 'USER_INTENT_VALUE_MISMATCH' | 'SERVER_ACTION_VALUE_MISMATCH' | 'TARGET_NOT_FOUND' | 'STALE_TARGET';
export interface ActionGuardResult {
    approved: boolean;
    reason?: ActionRejectionReason;
    message?: string;
    regroundedSelector?: string;
}
export interface ActionGuardContext {
    goalManager: GoalManager;
    actionMemory: ActionMemory;
    currentScreenElements: any[];
    currentPageFingerprint: string;
    taskIntent?: TaskIntent;
    proposedTargetText?: string;
    proposedTargetSemantic?: string;
}
export declare class ActionGuard {
    static shouldExecuteAction(command: ValidatedCommand, context: ActionGuardContext): ActionGuardResult;
}
