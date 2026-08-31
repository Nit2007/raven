import assert from 'node:assert';
import { test } from 'node:test';
import { validatePerceptionInput } from '../src/perception/input/perceptionInput.js';
test('PerceptionInput - Validation logic', () => {
    const validInput = {
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        width: 1920,
        height: 1080,
        coordinateSpace: 'SCREENSHOT',
        devicePixelRatio: 1,
        timestamp: Date.now(),
        locality: {
            isLocal: true,
            externalAiUsed: false,
            uploadPerformed: false
        }
    };
    assert.ok(validatePerceptionInput(validInput), 'Valid PerceptionInput should pass validation');
    const invalidInput = {
        image: 'http://external-server.com/image.png',
        width: 0,
        height: 1080
    };
    assert.strictEqual(validatePerceptionInput(invalidInput), false, 'Invalid PerceptionInput should fail validation');
});
