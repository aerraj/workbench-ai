import { handleChat } from '@/lib/chat-handler';
import { bindings, requireUser, failure } from '@/lib/account-server';
export async function POST(request:Request) { try { await requireUser(request,await bindings());return await handleChat(request); } catch(e) { return failure(e); } }
