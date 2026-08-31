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

export type ActionRejectionReason =
  | 'GOAL_ALREADY_COMPLETE'
  | 'SUBGOAL_ALREADY_COMPLETE'
  | 'ACTION_ALREADY_VERIFIED'
  | 'REDUNDANT_ACTION'
  | 'ACTION_DOES_NOT_ADVANCE_GOAL'
  | 'USER_INTENT_VALUE_MISMATCH'
  | 'SERVER_ACTION_VALUE_MISMATCH'
  | 'TARGET_NOT_FOUND'
  | 'STALE_TARGET';

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

export class ActionGuard {
  public static shouldExecuteAction(
    command: ValidatedCommand,
    context: ActionGuardContext
  ): ActionGuardResult {
    const { goalManager, actionMemory, currentScreenElements, currentPageFingerprint, taskIntent } = context;
    const actionType = command.action;

    // NONE / DONE commands bypass deduplication guards
    if (actionType === 'NONE' || actionType === 'DONE') {
      console.log(`[RAVEN:GUARD] action approved: ${actionType}`);
      return { approved: true };
    }

    // 1. Is the user goal already complete?
    if (goalManager.isComplete()) {
      console.log(`[RAVEN:GUARD] action rejected: GOAL_ALREADY_COMPLETE`);
      return {
        approved: false,
        reason: 'GOAL_ALREADY_COMPLETE',
        message: 'Goal is already completed. Action execution rejected.'
      };
    }

    // 2. Strict User Intent Value Mismatch Guard (M11.1)
    if (actionType === 'TYPE' && taskIntent?.value) {
      const expectedValue = taskIntent.value.value;
      const proposedValue = command.value || '';

      if (taskIntent.value.source === 'USER_GOAL' && expectedValue && proposedValue.toLowerCase() !== expectedValue.toLowerCase()) {
        console.log(`[RAVEN:GUARD] action rejected: USER_INTENT_VALUE_MISMATCH`);
        console.log(`[RAVEN:GUARD] Expected: ${expectedValue}, Proposed: ${proposedValue}`);
        return {
          approved: false,
          reason: 'USER_INTENT_VALUE_MISMATCH',
          message: `Proposed action value "${proposedValue}" does not match explicit user goal value "${expectedValue}".`
        };
      }
    }

    // Determine target identifiers
    let targetText = context.proposedTargetText;
    let targetSemantic = context.proposedTargetSemantic;

    if (command.targetSelector && currentScreenElements) {
      const matchEl = currentScreenElements.find((el: any) =>
        String(el.id || '').toLowerCase() === String(command.targetSelector).toLowerCase() ||
        String(el.dom_selector || '').toLowerCase() === String(command.targetSelector).toLowerCase()
      );
      if (matchEl) {
        targetText = targetText || matchEl.text || matchEl.visibleText;
        targetSemantic = targetSemantic || matchEl.role || matchEl.type;
      }
    }

    // 3. Check if action explicitly repeats an ALREADY COMPLETED sub-goal
    const commandReasoning = (command.reasoning || '').toLowerCase();
    const completedSubGoals = goalManager.getState().completedSubGoals;
    if (completedSubGoals.length > 0 && commandReasoning) {
      const matchesCompleted = completedSubGoals.some(sg => commandReasoning.includes(sg.toLowerCase()));
      if (matchesCompleted) {
        console.log(`[RAVEN:GUARD] action rejected: SUBGOAL_ALREADY_COMPLETE`);
        return {
          approved: false,
          reason: 'SUBGOAL_ALREADY_COMPLETE',
          message: `Action targets an already completed sub-goal ("${command.reasoning}").`
        };
      }
    }

    // 4. Has an equivalent action already been successfully verified?
    const hasEquiv = actionMemory.hasEquivalentVerifiedAction({
      type: actionType,
      targetElementId: command.targetSelector || undefined,
      targetText,
      targetSemantic,
      value: command.value || undefined,
      pageFingerprintBefore: currentPageFingerprint
    });

    if (hasEquiv) {
      // Check if goal explicitly requests repetition or multi-step loop testing
      const origGoal = goalManager.getState().originalGoal.toLowerCase();
      const allowsRepetition = origGoal.includes('twice') || origGoal.includes('again') || origGoal.includes('keep scrolling') || origGoal.includes('loop test') || origGoal.includes('privacy per step') || origGoal.includes('multi-page');

      if (!allowsRepetition) {
        console.log(`[RAVEN:GUARD] action rejected: ACTION_ALREADY_VERIFIED`);
        return {
          approved: false,
          reason: 'ACTION_ALREADY_VERIFIED',
          message: `Equivalent action (${actionType}) has already been executed and verified.`
        };
      }
    }

    // 5. Is the target actually present in current observation? (For CLICK/TYPE/SELECT)
    if (actionType !== 'SCROLL' && command.targetSelector) {
      const targetFound = currentScreenElements.some((el: any) => {
        const idMatch = String(el.id || '').toLowerCase() === String(command.targetSelector).toLowerCase();
        const selectorMatch = String(el.dom_selector || '').toLowerCase() === String(command.targetSelector).toLowerCase();
        const nameMatch = String(el.name || '').toLowerCase() === String(command.targetSelector).toLowerCase();
        const indexMatch = String(command.targetSelector).toLowerCase().startsWith('el_') || /^\d+$/.test(String(command.targetSelector));
        return idMatch || selectorMatch || nameMatch || indexMatch;
      });

      if (!targetFound) {
        console.log(`[RAVEN:GUARD] action rejected: TARGET_NOT_FOUND`);
        return {
          approved: false,
          reason: 'TARGET_NOT_FOUND',
          message: `Target element "${command.targetSelector}" is not present in current page state.`
        };
      }
    }

    console.log(`[RAVEN:GUARD] VALUE MATCH: PASS for ${actionType}`);
    console.log(`[RAVEN:GUARD] action approved: ${actionType}`);
    return { approved: true };
  }
}
