import { Message, OpenAIOutputItem, Provider, toolDefinitions } from './contracts';
export function buildRequest(provider: Provider, model: string, messages: Message[], system: string, work: boolean) {
  if (provider === 'openai') {
    const input: Record<string, unknown>[] = [];
    for (const m of messages) {
      if (m.role === 'tool') {
        input.push({ type: 'function_call_output', call_id: m.toolCallId, output: m.content });
      } else if (m.role === 'assistant') {
        // Replay reasoning and tool calls in their original order. Never send a
        // second copy of the normalized text/tool calls alongside these items.
        if (m.openaiModel === model && m.openaiOutput?.length) {
          input.push(...m.openaiOutput);
        } else {
          // Older chats and messages from other providers have no Responses items.
          if (m.content) input.push({ role: 'assistant', content: m.content });
          for (const call of m.toolCalls || []) {
            input.push({ type: 'function_call', call_id: call.id, name: call.name, arguments: call.arguments });
          }
        }
      } else {
        input.push({ role: 'user', content: [
          { type: 'input_text', text: m.content || 'Inspect the attached image.' },
          ...(m.images || []).map(image_url => ({ type: 'input_image', image_url, detail: 'auto' })),
        ] });
      }
    }
    return {
      model, instructions: system, input, store: false,
      include: ['reasoning.encrypted_content'],
      ...(work ? { tools: toolDefinitions.map(t => ({ type: 'function', ...t, strict: true })) } : {}),
    };
  }
  if (provider === 'anthropic') {
    const converted: { role: string; content: unknown[] }[] = [];
    for (const m of messages) {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const content: unknown[] = m.role === 'tool' ? [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }] : [
        ...(m.content ? [{ type: 'text', text: m.content }] : []),
        ...(m.images || []).map(data => { const [, media_type, base64] = data.match(/^data:([^;]+);base64,(.*)$/)!; return { type: 'image', source: { type: 'base64', media_type, data: base64 } }; }),
        ...(m.toolCalls || []).map(t => ({ type: 'tool_use', id: t.id, name: t.name, input: JSON.parse(t.arguments) })),
      ];
      if (converted.at(-1)?.role === role) converted.at(-1)!.content.push(...content);
      else converted.push({ role, content });
    }
    return { model, max_tokens: 8192, system, messages: converted, ...(work ? { tools: toolDefinitions.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}) };
  }
  return { model, messages: [{ role: 'system', content: system }, ...messages.map(m => m.role === 'tool' ? { role: 'tool', tool_call_id: m.toolCallId, content: m.content } : {
    role: m.role, content: m.images?.length ? [{ type: 'text', text: m.content || 'Inspect the attached image.' }, ...m.images.map(url => ({ type: 'image_url', image_url: { url } }))] : m.content || null,
    ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.arguments } })) } : {}),
  })], ...(work ? { tools: toolDefinitions.map(t => ({ type: 'function', function: t })) } : {}) };
}
export function normalizeResponse(provider: Provider, data: any, model?: string): Message {
  if (provider === 'openai') {
    if (data.status && data.status !== 'completed') throw new Error('The provider did not complete the response.');
    if (!Array.isArray(data.output)) throw new Error('The provider returned no response.');
    // Preserve only replayable fields, omitting output-only metadata like logprobs.
    const output: OpenAIOutputItem[] = data.output.map((item: any) => {
      const common = { ...(item.id ? { id: item.id } : {}), ...(item.status ? { status: item.status } : {}) };
      if (item.type === 'reasoning') return { ...common, type: 'reasoning', summary: item.summary || [], ...(item.encrypted_content ? { encrypted_content: item.encrypted_content } : {}) };
      if (item.type === 'function_call') return { ...common, type: 'function_call', call_id: item.call_id, name: item.name, arguments: item.arguments };
      if (item.type === 'message') return { ...common, type: 'message', role: 'assistant', ...(item.phase ? { phase: item.phase } : {}), content: (item.content || []).map((c: any) => c.type === 'refusal' ? { type: 'refusal', refusal: c.refusal } : { type: 'output_text', text: c.text, annotations: c.annotations || [] }) };
      throw new Error(`Unsupported response item: ${item.type}`);
    });
    const content = data.output.filter((item: any) => item.type === 'message').flatMap((item: any) => item.content || []).map((c: any) => c.type === 'refusal' ? c.refusal : c.text || '').join('\n');
    const toolCalls = data.output.filter((item: any) => item.type === 'function_call').map((item: any) => ({ id: item.call_id, name: item.name, arguments: item.arguments }));
    if (!content && !toolCalls.length) throw new Error('The provider returned no answer or tool calls.');
    return { role: 'assistant', content, toolCalls, openaiOutput: output, openaiModel: model || data.model };
  }
  if (provider === 'anthropic') return { role: 'assistant', content: (data.content || []).filter((x: any) => x.type === 'text').map((x: any) => x.text).join('\n'), toolCalls: (data.content || []).filter((x: any) => x.type === 'tool_use').map((x: any) => ({ id: x.id, name: x.name, arguments: JSON.stringify(x.input) })) };
  const m = data.choices?.[0]?.message;
  if (!m) throw new Error('The provider returned no response. Try another model.');
  return { role: 'assistant', content: m.content || '', toolCalls: (m.tool_calls || []).map((t: any) => ({ id: t.id, name: t.function.name, arguments: t.function.arguments })) };
}
