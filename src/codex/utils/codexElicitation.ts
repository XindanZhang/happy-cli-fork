/**
 * Codex elicitation helpers
 *
 * Codex uses MCP `elicitation/create` for approvals and augments the request params
 * with `codex_*` fields (call IDs, commands, diffs). The upstream SDK schema strips
 * unknown keys for this request type, so we define a loose schema here to preserve
 * those fields and provide helpers to construct valid approval responses.
 */

import { z } from 'zod';

export const CodexElicitationCreateRequestSchema = z.object({
    method: z.literal('elicitation/create'),
    params: z.object({
        message: z.string(),
        requestedSchema: z.any().optional(),

        codex_elicitation: z.string().optional(),
        codex_mcp_tool_call_id: z.string().optional(),
        codex_event_id: z.string().optional(),
        codex_call_id: z.string().optional(),
        codex_command: z.array(z.string()).optional(),
        codex_cwd: z.string().optional(),
        codex_parsed_cmd: z.any().optional(),
        codex_changes: z.record(z.string(), z.any()).optional(),
    }).passthrough(),
}).passthrough();

export type CodexElicitationCreateRequest = z.infer<typeof CodexElicitationCreateRequestSchema>;

export type CodexApprovalDecision = 'approved' | 'approved_for_session' | 'denied' | 'abort';
export type CodexElicitationAction = 'accept' | 'decline' | 'cancel';

export function codexActionForDecision(decision: CodexApprovalDecision): CodexElicitationAction {
    if (decision === 'approved' || decision === 'approved_for_session') {
        return 'accept';
    }
    if (decision === 'denied') {
        return 'decline';
    }
    return 'cancel';
}

export function codexElicitationResponseForDecision(decision: CodexApprovalDecision): {
    action: CodexElicitationAction;
    decision: CodexApprovalDecision;
} {
    return {
        action: codexActionForDecision(decision),
        decision,
    };
}

