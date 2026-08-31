/**
 * TaskIntent & Value Provenance Engine — RAVEN M11.1
 *
 * Ensures the current user goal is the highest-priority source of task intent.
 * Strict value provenance guarantees user-provided explicit values override
 * stale values, previous task history, or server defaults.
 */
export interface ActionValue {
    value: string;
    source: 'USER_GOAL' | 'SERVER_PLAN' | 'DERIVED' | 'BROWSER_STATE';
    confidence: number;
}
export type IntentType = 'CLICK' | 'TYPE' | 'SEARCH' | 'SCROLL' | 'SELECT' | 'MULTI_STEP' | 'UNKNOWN';
export type SubGoalAction = 'FIND' | 'CLICK' | 'TYPE' | 'SEARCH' | 'SCROLL' | 'SELECT' | 'VERIFY';
export type SubGoalStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
export interface TaskSubGoal {
    id: string;
    action: SubGoalAction;
    target?: string;
    value?: string;
    status: SubGoalStatus;
}
export interface TaskIntent {
    rawGoal: string;
    intent: IntentType;
    target?: string;
    value?: ActionValue;
    direction?: 'UP' | 'DOWN';
    subGoals: TaskSubGoal[];
}
export declare class TaskIntentParser {
    /**
     * Parse a raw user goal into a structured TaskIntent with explicit value provenance.
     */
    static parseGoal(rawGoal: string): TaskIntent;
    /**
     * Helper to extract explicit user values from goal strings.
     * NEVER returns a hardcoded fallback. Returns undefined if no value was specified.
     */
    private static extractExplicitValue;
    private static extractTarget;
    private static logDiagnostics;
}
