import { Message, Provider, toolDefinitions } from './contracts';
export function buildRequest(provider: Provider, model: string, messages: Message[], system: string, work: boolean) {
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
export function normalizeResponse(provider: Provider, data: any): Message {
  if (provider === 'anthropic') return { role: 'assistant', content: (data.content || []).filter((x: any) => x.type === 'text').map((x: any) => x.text).join('\n'), toolCalls: (data.content || []).filter((x: any) => x.type === 'tool_use').map((x: any) => ({ id: x.id, name: x.name, arguments: JSON.stringify(x.input) })) };
  const m = data.choices?.[0]?.message;
  if (!m) throw new Error('The provider returned no response. Try another model.');
  return { role: 'assistant', content: m.content || '', toolCalls: (m.tool_calls || []).map((t: any) => ({ id: t.id, name: t.function.name, arguments: t.function.arguments })) };
}
