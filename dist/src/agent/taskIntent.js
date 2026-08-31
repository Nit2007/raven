/**
 * TaskIntent & Value Provenance Engine — RAVEN M11.1
 *
 * Ensures the current user goal is the highest-priority source of task intent.
 * Strict value provenance guarantees user-provided explicit values override
 * stale values, previous task history, or server defaults.
 */
export class TaskIntentParser {
    /**
     * Parse a raw user goal into a structured TaskIntent with explicit value provenance.
     */
    static parseGoal(rawGoal) {
        const goalStr = (rawGoal || '').trim();
        if (!goalStr) {
            return {
                rawGoal: '',
                intent: 'UNKNOWN',
                subGoals: []
            };
        }
        const lower = goalStr.toLowerCase();
        // 1. Explicit SEARCH parsing
        // Examples: "Find the search box, search 'gokul'", "search gokul", "search for SIH 2026"
        if (lower.includes('search')) {
            const extractedValue = this.extractExplicitValue(goalStr, 'search');
            const target = this.extractTarget(goalStr, 'search field');
            const actionValue = extractedValue ? {
                value: extractedValue,
                source: 'USER_GOAL',
                confidence: 1.0
            } : undefined;
            const subGoals = [
                {
                    id: 'sg_1_find',
                    action: 'FIND',
                    target: target || 'search field',
                    status: 'PENDING'
                },
                {
                    id: 'sg_2_type',
                    action: 'TYPE',
                    target: target || 'search field',
                    value: extractedValue,
                    status: 'PENDING'
                },
                {
                    id: 'sg_3_search',
                    action: 'SEARCH',
                    target: target || 'search field',
                    value: extractedValue,
                    status: 'PENDING'
                },
                {
                    id: 'sg_4_verify',
                    action: 'VERIFY',
                    value: extractedValue,
                    status: 'PENDING'
                }
            ];
            const parsed = {
                rawGoal: goalStr,
                intent: 'SEARCH',
                target: target || 'search field',
                value: actionValue,
                subGoals
            };
            this.logDiagnostics(parsed);
            return parsed;
        }
        // 2. Explicit TYPE parsing
        // Examples: "type 'hello' into username", "enter gokul"
        if (lower.includes('type') || lower.includes('enter') || lower.includes('input')) {
            const extractedValue = this.extractExplicitValue(goalStr, 'type');
            const target = this.extractTarget(goalStr, 'input');
            const actionValue = extractedValue ? {
                value: extractedValue,
                source: 'USER_GOAL',
                confidence: 1.0
            } : undefined;
            const subGoals = [
                {
                    id: 'sg_1_find',
                    action: 'FIND',
                    target: target || 'input field',
                    status: 'PENDING'
                },
                {
                    id: 'sg_2_type',
                    action: 'TYPE',
                    target: target || 'input field',
                    value: extractedValue,
                    status: 'PENDING'
                },
                {
                    id: 'sg_3_verify',
                    action: 'VERIFY',
                    value: extractedValue,
                    status: 'PENDING'
                }
            ];
            const parsed = {
                rawGoal: goalStr,
                intent: 'TYPE',
                target: target || 'input field',
                value: actionValue,
                subGoals
            };
            this.logDiagnostics(parsed);
            return parsed;
        }
        // 3. Explicit CLICK parsing
        if (lower.includes('click')) {
            const target = goalStr.replace(/^click\s+(?:the\s+)?/i, '').trim();
            const parsed = {
                rawGoal: goalStr,
                intent: 'CLICK',
                target: target || 'button',
                subGoals: [
                    { id: 'sg_1_find', action: 'FIND', target: target || 'button', status: 'PENDING' },
                    { id: 'sg_2_click', action: 'CLICK', target: target || 'button', status: 'PENDING' },
                    { id: 'sg_3_verify', action: 'VERIFY', status: 'PENDING' }
                ]
            };
            this.logDiagnostics(parsed);
            return parsed;
        }
        // 4. Explicit SCROLL parsing
        if (lower.includes('scroll')) {
            const dir = lower.includes('up') ? 'UP' : 'DOWN';
            const parsed = {
                rawGoal: goalStr,
                intent: 'SCROLL',
                direction: dir,
                subGoals: [
                    { id: 'sg_1_scroll', action: 'SCROLL', value: dir, status: 'PENDING' },
                    { id: 'sg_2_verify', action: 'VERIFY', status: 'PENDING' }
                ]
            };
            this.logDiagnostics(parsed);
            return parsed;
        }
        // 5. Explicit SELECT parsing
        if (lower.includes('select')) {
            const extractedValue = this.extractExplicitValue(goalStr, 'select');
            const target = this.extractTarget(goalStr, 'select option');
            const actionValue = extractedValue ? {
                value: extractedValue,
                source: 'USER_GOAL',
                confidence: 1.0
            } : undefined;
            const parsed = {
                rawGoal: goalStr,
                intent: 'SELECT',
                target: target || 'dropdown',
                value: actionValue,
                subGoals: [
                    { id: 'sg_1_find', action: 'FIND', target: target || 'dropdown', status: 'PENDING' },
                    { id: 'sg_2_select', action: 'SELECT', value: extractedValue, status: 'PENDING' },
                    { id: 'sg_3_verify', action: 'VERIFY', value: extractedValue, status: 'PENDING' }
                ]
            };
            this.logDiagnostics(parsed);
            return parsed;
        }
        // Default: Generic single step
        const defaultParsed = {
            rawGoal: goalStr,
            intent: 'MULTI_STEP',
            subGoals: [
                { id: 'sg_1_generic', action: 'FIND', target: goalStr, status: 'PENDING' }
            ]
        };
        this.logDiagnostics(defaultParsed);
        return defaultParsed;
    }
    /**
     * Helper to extract explicit user values from goal strings.
     * NEVER returns a hardcoded fallback. Returns undefined if no value was specified.
     */
    static extractExplicitValue(goal, context) {
        if (!goal)
            return undefined;
        // A. Quoted values (e.g. search 'gokul', type "test input")
        const quoteMatch = goal.match(/["']([^"']+)["']/);
        if (quoteMatch && quoteMatch[1].trim()) {
            return quoteMatch[1].trim();
        }
        // B. Context-based value extraction
        // "Find the search box, search gokul"
        const searchMatch = goal.match(/search\s+(?:for\s+)?([^,.;]+)/i);
        if (searchMatch && searchMatch[1].trim()) {
            let val = searchMatch[1].trim();
            val = val.replace(/^["']|["']$/g, '');
            if (val && !val.toLowerCase().startsWith('box') && !val.toLowerCase().startsWith('field')) {
                return val;
            }
        }
        // "enter gokul into search box" or "enter gokul"
        const enterMatch = goal.match(/(?:enter|type|input)\s+([^,.;]+?)(?:\s+(?:into|in|on)\s+|$)/i);
        if (enterMatch && enterMatch[1].trim()) {
            let val = enterMatch[1].trim();
            val = val.replace(/^["']|["']$/g, '');
            if (val)
                return val;
        }
        // "Search for SIH 2026"
        const searchForMatch = goal.match(/^search\s+(?:for\s+)?([^,.;]+)/i);
        if (searchForMatch && searchForMatch[1].trim()) {
            let val = searchForMatch[1].trim();
            val = val.replace(/^["']|["']$/g, '');
            if (val)
                return val;
        }
        return undefined;
    }
    static extractTarget(goal, defaultTarget) {
        const lower = goal.toLowerCase();
        if (lower.includes('search box') || lower.includes('search input') || lower.includes('search field')) {
            return 'search field';
        }
        if (lower.includes('login'))
            return 'login';
        if (lower.includes('username'))
            return 'username';
        if (lower.includes('password'))
            return 'password';
        return defaultTarget;
    }
    static logDiagnostics(intent) {
        console.log('[RAVEN:INTENT] Raw goal:', intent.rawGoal);
        console.log('[RAVEN:INTENT] Intent:', intent.intent);
        console.log('[RAVEN:INTENT] Target:', intent.target || 'N/A');
        console.log('[RAVEN:INTENT] Expected value:', intent.value ? intent.value.value : 'N/A');
    }
}
