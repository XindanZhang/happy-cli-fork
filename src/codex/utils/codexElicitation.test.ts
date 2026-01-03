import { describe, expect, it } from 'vitest';
import { CodexElicitationCreateRequestSchema, codexActionForDecision, codexElicitationResponseForDecision } from './codexElicitation';

describe('CodexElicitationCreateRequestSchema', () => {
    it('preserves codex_* fields for exec approvals', () => {
        const parsed = CodexElicitationCreateRequestSchema.parse({
            method: 'elicitation/create',
            params: {
                message: 'Allow Codex to run something?',
                requestedSchema: { type: 'object', properties: {} },
                codex_elicitation: 'exec-approval',
                codex_call_id: 'call_123',
                codex_command: ['/bin/zsh', '-lc', 'echo hi > hi.txt'],
                codex_cwd: '/tmp',
                codex_parsed_cmd: [{ type: 'unknown', cmd: 'echo hi > hi.txt' }],
            },
        });

        expect(parsed.params.codex_elicitation).toBe('exec-approval');
        expect(parsed.params.codex_call_id).toBe('call_123');
        expect(parsed.params.codex_command).toEqual(['/bin/zsh', '-lc', 'echo hi > hi.txt']);
        expect(parsed.params.codex_cwd).toBe('/tmp');
    });

    it('preserves codex_changes for patch approvals', () => {
        const parsed = CodexElicitationCreateRequestSchema.parse({
            method: 'elicitation/create',
            params: {
                message: 'Allow Codex to apply proposed code changes?',
                requestedSchema: { type: 'object', properties: {} },
                codex_elicitation: 'patch-approval',
                codex_call_id: 'call_456',
                codex_changes: {
                    '/tmp/a.txt': {
                        type: 'update',
                        unified_diff: '@@ -1 +1 @@\n-old\n+new\n',
                        move_path: null,
                    },
                },
            },
        });

        expect(parsed.params.codex_elicitation).toBe('patch-approval');
        expect(parsed.params.codex_call_id).toBe('call_456');
        expect(parsed.params.codex_changes).toEqual({
            '/tmp/a.txt': {
                type: 'update',
                unified_diff: '@@ -1 +1 @@\n-old\n+new\n',
                move_path: null,
            },
        });
    });
});

describe('codexActionForDecision', () => {
    it('maps approved decisions to accept', () => {
        expect(codexActionForDecision('approved')).toBe('accept');
        expect(codexActionForDecision('approved_for_session')).toBe('accept');
    });

    it('maps denied decisions to decline', () => {
        expect(codexActionForDecision('denied')).toBe('decline');
    });

    it('maps abort decisions to cancel', () => {
        expect(codexActionForDecision('abort')).toBe('cancel');
    });
});

describe('codexElicitationResponseForDecision', () => {
    it('includes both action and decision', () => {
        expect(codexElicitationResponseForDecision('approved')).toEqual({
            action: 'accept',
            decision: 'approved',
        });
    });
});

