import { ElementInfo, PerceptionAdapter } from '../integration/perceptionAdapter.js';
import { Person1Bridge } from '../integration/person1Bridge.js';
import { ActionExecutor, ValidatedCommand, ActionReceipt } from './actionExecutor.js';

export type AgentStatus = 
  | 'IDLE' 
  | 'ANALYZING' 
  | 'PROTECTING' 
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
   * Executes a single iteration of the autonomous agent loop:
   * 1. Observe (DOM + Visual Perception)
   * 2. Protect & Mask (Sensitivity Classifier + Redaction Engine)
   * 3. Sanitize & Check Outbound Privacy Gate (Authoritative Gate)
   * 4. Query Server (POST /agent/act)
   * 5. Validate Action & Execute on Page
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

    // STEP 1 & 2: OBSERVE — Capture & Perception
    this.status = 'ANALYZING';
    onStateChange?.(this.status, `Step ${currentStep}/${this.maxIterations}: Analyzing page state locally...`);

    const rawDomElements = await queryDomFn();
    const perceptionResult = await runPerceptionFn();
    console.log('[RAVEN TRACE 2] Observation complete', { domCount: rawDomElements.length });

    // STEP 3 & 4: PROTECT — Classification & Fusion
    this.status = 'PROTECTING';
    onStateChange?.(this.status, `Step ${currentStep}/${this.maxIterations}: Running privacy sensitivity classification...`);

    const classifiedDom = Person1Bridge.SensitivityDetector.classifyElements(rawDomElements);
    const integratedElements = PerceptionAdapter.mergePerceptionWithDOM(classifiedDom, perceptionResult);

    // STEP 5 & 6: REDACT & SANITIZE
    const redactedElements = Person1Bridge.RedactionEngine.redactElements(integratedElements);
    const sanitizedPayload = Person1Bridge.Sanitizer.sanitizeContext(redactedElements);

    const stepRedactedCount = sanitizedPayload.elements.filter((e: any) => e.redacted === true).length;
    this.protectedItemsCount += stepRedactedCount;
    this.privacyChecksCount++;

    // STEP 7 & 8: AUTHORITATIVE OUTBOUND PRIVACY GATE (PRE-NETWORK CHECK)
    const gateCheck = Person1Bridge.Sanitizer.outboundCheck(sanitizedPayload);

    if (!gateCheck.safe) {
      // HARD STOP — DO NOT CONTACT SERVER
      this.status = 'TRANSMISSION_BLOCKED';
      const errMsg = `Outbound privacy leak detected in step ${currentStep}. Transmission blocked by RAVEN gate.`;
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

    console.log('[RAVEN TRACE 3] Outbound privacy gate passed');

    // STEP 9: SERVER REASONING (POST /agent/act)
    this.status = 'SERVER_THINKING';
    onStateChange?.(this.status, `Step ${currentStep}/${this.maxIterations}: Outbound gate passed. Reasoning via server AI...`);

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

    // STEP 10: ACTION VALIDATION
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
    console.log('[RAVEN TRACE 6] Action validation passed', command);

    this.status = 'ACTION_APPROVED';
    onStateChange?.(this.status, `Step ${currentStep}/${this.maxIterations}: Server approved action: ${command.action}`);

    // Check if task is finished according to server response contract
    const isServerCompleted = (serverResponse.body?.task_status === 'completed') || (command.action === 'DONE');
    if (isServerCompleted) {
      console.log('[RAVEN TRACE 17] Completion verified');
      this.status = 'COMPLETED';
      const msg = command.reasoning || `Task finished successfully in step ${currentStep}.`;
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

    // STEP 11: BROWSER EXECUTION
    this.status = 'EXECUTING';
    onStateChange?.(this.status, `Step ${currentStep}/${this.maxIterations}: Executing ${command.action} on page...`);

    console.log('[RAVEN AgentController] ABOUT TO EXECUTE ACTION', {
      action: command.action,
      target: command.targetSelector
    });

    const execReceipt: ActionReceipt = await ActionExecutor.executeValidatedAction(command, dispatchActionFn);

    console.log('[RAVEN AgentController] EXECUTION RECEIPT', execReceipt);

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

    // STEP 12: OBSERVING & PAGE STABILIZATION
    this.status = 'OBSERVING';
    onStateChange?.(this.status, `Step ${currentStep}/${this.maxIterations}: Action executed (${execReceipt.message}). Waiting for page to stabilize...`);

    console.log('[RAVEN TRACE 16] Re-observing page');
    await new Promise(r => setTimeout(r, this.stabilizeDelayMs));

    this.currentIteration++;
    return { done: false, success: true, status: 'OBSERVING', message: execReceipt.message || 'Action executed' };
  }

  /**
   * Record step details in history.
   */
  public recordStep(rec: AgentExecutionRecord): void {
    this.executionHistory.push(rec);
  }
}
