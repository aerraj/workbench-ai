import { handleChat } from '@/lib/chat-handler';
import { handleStream } from '@/lib/chat-stream';
import { bindings, requireUser, failure } from '@/lib/account-server';
export async function POST(request:Request) { try { await requireUser(request,await bindings());return request.headers.get('accept')?.includes('text/event-stream') ? await handleStream(request) : await handleChat(request); } catch(e) { return failure(e); } }
