import { ElementInfo, PerceptionAdapter } from '../integration/perceptionAdapter.js';
import { Person1Bridge } from '../integration/person1Bridge.js';
import { ActionExecutor, ValidatedCommand, ActionReceipt } from './actionExecutor.js';

export type AgentStatus = 
  | 'IDLE' 
  | 'ANALYZING' 
  | 'PROTECTING' 
  | 'PHASE_1_ANALYSIS'
  | 'PHASE_2_EXECUTION'
  | 'PHASE_3_VERIFICATION'
  | 'SERVER_THINKING' 
  | 'ACTION_APPROVED' 
  | 'EXECUTING' 
  | 'OBSERVING' 
  | 'COMPLETED' 
  | 'TRANSMISSION_BLOCKED' 
  | 'SERVER_UNAVAILABLE' 
  | 'ACTION_REJECTED' 
  | 'TARGET_NOT_FOUND' 
  | 'MAX_STEPS_REACHED' 
  | 'TASK_FAILED' 
  | 'ERROR';

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

export class AgentController {
  public taskGoal: string = '';
  public currentIteration: number = 1;
  public maxIterations: number = 10;
  public status: AgentStatus = 'IDLE';
  public executionHistory: AgentExecutionRecord[] = [];
  
  public privacyChecksCount: number = 0;
  public protectedItemsCount: number = 0;
  public serverDecisionsCount: number = 0;

  private stabilizeDelayMs: number = 600;

  constructor(config?: { maxIterations?: number; stabilizeDelayMs?: number }) {
    if (config?.maxIterations) this.maxIterations = config.maxIterations;
    if (config?.stabilizeDelayMs) this.stabilizeDelayMs = config.stabilizeDelayMs;
  }

  /**
   * Reset controller state for a new user task goal.
   */
  public initTask(goal: string): void {
    this.taskGoal = goal;
    this.currentIteration = 1;
    this.status = 'IDLE';
    this.executionHistory = [];
    this.privacyChecksCount = 0;
    this.protectedItemsCount = 0;
    this.serverDecisionsCount = 0;
  }

  /**
   * Executes a 3-Phase Browser-Agent Transaction:
   * PHASE 1: Local Perception & Privacy Enforcement (DOM + OCR + Face + Vision + Fusion + Gate)
   * PHASE 2: Server AI Reasoning + Real Browser Action Dispatch
   * PHASE 3: Local Action Verification & State Diff
   */
  public async executeIteration(
    queryDomFn: () => Promise<ElementInfo[]>,
    runPerceptionFn: () => Promise<any>,
    dispatchActionFn: (command: ValidatedCommand) => Promise<ActionReceipt>,
    onStateChange?: (status: AgentStatus, message?: string) => void
  ): Promise<AgentIterationResult> {
    if (this.currentIteration > this.maxIterations) {
      this.status = 'MAX_STEPS_REACHED';
      const msg = 'Task stopped: maximum agent steps reached.';
      onStateChange?.(this.status, msg);
      return { done: true, success: false, status: this.status, message: msg };
    }

    const currentStep = this.currentIteration;

    // ==========================================
    // PHASE 1 — LOCAL ANALYSIS & PRIVACY ENFORCEMENT
    // ==========================================
    this.status = 'PHASE_1_ANALYSIS';
    onStateChange?.(this.status, 'Phase 1/3: Analyzing page state & enforcing local privacy...');

    console.log('[RAVEN:P1] DOM extraction starting...');
    const rawDomElements = await queryDomFn();
    console.log('[RAVEN:P1] DOM complete', { domCount: rawDomElements.length });

    const perceptionResult = await runPerceptionFn();

    const classifiedDom = Person1Bridge.SensitivityDetector.classifyElements(rawDomElements);
    const integratedElements = PerceptionAdapter.mergePerceptionWithDOM(classifiedDom, perceptionResult);

    const redactedElements = Person1Bridge.RedactionEngine.redactElements(integratedElements);
    const sanitizedPayload = Person1Bridge.Sanitizer.sanitizeContext(redactedElements);

    const stepRedactedCount = sanitizedPayload.elements.filter((e: any) => e.redacted === true).length;
    this.protectedItemsCount += stepRedactedCount;
    this.privacyChecksCount++;

    const gateCheck = Person1Bridge.Sanitizer.outboundCheck(sanitizedPayload);

    if (!gateCheck.safe) {
      this.status = 'TRANSMISSION_BLOCKED';
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

    // ==========================================
    // PHASE 2 — SERVER REASONING & REAL ACTION EXECUTION
    // ==========================================
    this.status = 'PHASE_2_EXECUTION';
    onStateChange?.(this.status, 'Phase 2/3: Server AI reasoning & real browser action dispatch...');

    console.log('[RAVEN:SERVER] REQUEST sending sanitized screen state...');
    const wirePayload = Person1Bridge.ServerAdapter.buildOutboundPayload(sanitizedPayload, this.taskGoal);
    const serverResponse = await Person1Bridge.ServerAdapter.sendToServer(wirePayload);
    this.serverDecisionsCount++;

    if (!serverResponse.ok) {
      if (serverResponse.status === 400) {
        this.status = 'ACTION_REJECTED';
        const msg = `Server rejected request: ${serverResponse.body?.error || 'Security check failed'}`;
        onStateChange?.(this.status, msg);
        return { done: true, success: false, status: this.status, message: msg };
      } else {
        this.status = 'SERVER_UNAVAILABLE';
        const msg = `Cannot reach RAVEN server at http://localhost:8000/agent/act`;
        onStateChange?.(this.status, msg);
        return { done: true, success: false, status: this.status, message: msg };
      }
    }

    const valResult = ActionExecutor.validateAction(
      serverResponse.body || serverResponse,
      wirePayload.screen_state.elements
    );

    if (!valResult.valid) {
      const isTargetErr = valResult.errors.some(e => e.includes('not present in the currently analyzed page state'));
      this.status = isTargetErr ? 'TARGET_NOT_FOUND' : 'ACTION_REJECTED';
      const msg = `Server command validation failed: ${valResult.errors.join('; ')}`;
      onStateChange?.(this.status, msg);
      return { done: true, success: false, status: this.status, message: msg };
    }

    const command = valResult.command;
    console.log('[RAVEN:SERVER] ACTION approved:', command.action, { target: command.targetSelector });

    const isServerCompleted = (serverResponse.body?.task_status === 'completed') || (command.action === 'DONE');
    if (isServerCompleted) {
      console.log('[RAVEN:VERIFY] RESULT Task completion verified by server contract');
      this.status = 'COMPLETED';
      const msg = command.reasoning || `Task finished successfully.`;
      onStateChange?.(this.status, msg);

      this.recordStep({
        step: currentStep,
        goal: this.taskGoal,
        status: this.status,
        privacySafe: true,
        redactedCount: stepRedactedCount,
        actionTaken: command.action,
        targetSelector: command.targetSelector,
        message: msg,
        timestamp: new Date().toISOString(),
        execution: 'REAL_BROWSER',
        dispatched: false,
        verified: true
      });

      return { done: true, success: true, status: this.status, message: msg };
    }

    console.log('[RAVEN:BROWSER] EXECUTE dispatching action to webpage content script...', command);
    const execReceipt: ActionReceipt = await ActionExecutor.executeValidatedAction(command, dispatchActionFn);
    console.log('[RAVEN:BROWSER] EXECUTE receipt:', execReceipt);

    const isDispatchRequired = command.action !== 'NONE' && command.action !== 'DONE';
    if (!execReceipt.success || (isDispatchRequired && !execReceipt.dispatched)) {
      this.status = 'TASK_FAILED';
      const msg = `Action execution failed: ${execReceipt.error || 'Execution dispatch failed'}`;
      onStateChange?.(this.status, msg);
      return { done: true, success: false, status: this.status, message: msg };
    }

    this.recordStep({
      step: currentStep,
      goal: this.taskGoal,
      status: this.status,
      privacySafe: true,
      redactedCount: stepRedactedCount,
      actionTaken: command.action,
      targetSelector: command.targetSelector,
      message: execReceipt.message,
      timestamp: new Date().toISOString(),
      execution: execReceipt.execution,
      dispatched: execReceipt.dispatched,
      verified: execReceipt.verified
    });

    // ==========================================
    // PHASE 3 — LOCAL VERIFICATION & STATE DIFF
    // ==========================================
    this.status = 'PHASE_3_VERIFICATION';
    onStateChange?.(this.status, `Phase 3/3: Verifying action effect (${command.action}) on page state...`);
    console.log('[RAVEN:VERIFY] RESULT verifying action receipt:', execReceipt);

    const lowerGoal = this.taskGoal.toLowerCase();
    const isDirectScrollGoal = command.action === 'SCROLL' && (
      lowerGoal.includes('scroll down') ||
      lowerGoal.includes('scroll up') ||
      lowerGoal === 'scroll'
    );

    if (execReceipt.verified && isDirectScrollGoal) {
      console.log('[RAVEN:VERIFY] RESULT Task completed on direct scroll verification');
      this.status = 'COMPLETED';
      const msg = execReceipt.message || `Action ${command.action} verified and task completed cleanly.`;
      onStateChange?.(this.status, msg);
      return { done: true, success: true, status: this.status, message: msg };
    }

    await new Promise(r => setTimeout(r, this.stabilizeDelayMs));
    this.currentIteration++;
    return { done: false, success: true, status: 'PHASE_3_VERIFICATION', message: execReceipt.message || 'Action executed' };
  }

  /**
   * Record step details in history.
   */
  public recordStep(rec: AgentExecutionRecord): void {
    this.executionHistory.push(rec);
  }
}
