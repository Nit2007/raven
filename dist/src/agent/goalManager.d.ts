/**
 * GoalManager — Goal state management, task intent integration, sub-goal tracking,
 * and exact semantic completion evaluation (M11.1).
 *
 * Ensures RAVEN is strictly goal-driven with exact user value provenance.
 * Prevents stale values or generic page changes from causing false completions.
 */
import { TaskIntent } from './taskIntent.js';
export type GoalStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
export interface GoalState {
    originalGoal: string;
    normalizedGoal: string;
    status: GoalStatus;
    taskIntent?: TaskIntent;
    currentSubGoal?: string;
    completedSubGoals: string[];
    requiredActions: string[];
    completedActions: string[];
    createdAt: number;
    completedAt?: number;
    completionReason?: string;
}
export declare class GoalManager {
    private state;
    constructor();
    private createDefaultState;
    /**
     * Initialize or reset GoalManager with a new user goal.
     */
    initialize(goal: string): GoalState;
    getState(): GoalState;
    getTaskIntent(): TaskIntent | undefined;
    isComplete(): boolean;
    isSubGoalComplete(subGoal: string): boolean;
    markSubGoalComplete(subGoal: string): void;
    markActionComplete(actionKey: string): void;
    getNextRequiredSubGoal(): string | null;
    /**
     * Evaluate whether overall goal is satisfied given current page state and action verification.
     * Enforces exact value checking for TYPE and SEARCH goals (M11.1).
     */
    evaluateCompletion(pageState?: any, verificationResult?: any): boolean;
    reset(): void;
    private markGoalCompleted;
    private formatSubGoals;
    private getRemainingSubGoals;
    private decomposeGoal;
    private extractRequiredActions;
}
