import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy — Workbench' };

export default function Privacy() {
 return <main style={{maxWidth:760,margin:'0 auto',padding:'48px 24px',lineHeight:1.8}}>
  <a href="/">← Back to Workbench</a>
  <h1>Workbench privacy information</h1>
  <p>Updated 28 October 2026. Workbench is an AI workspace operated by Rishabh Raj. Contact <a href="mailto:rraj09102002@gmail.com">rraj09102002@gmail.com</a> with privacy questions or account data requests.</p>
  <h2>Accounts and Google sign-in</h2>
  <p>Username accounts store a username and a salted, peppered password hash. Google sign-in requests your basic profile and email information to authenticate you and check that your email is verified. Workbench stores your Google account’s unique identifier to recognise future sign-ins. It does not store your Google password, profile email, profile name, profile photo, or Google access token. It does not request access to Gmail, Drive, Calendar, or your contacts.</p>
  <h2>Your workspace</h2>
  <p>Workbench stores your conversations, uploaded files, generated artifacts, account preferences, and the AI provider API keys you choose to save. Workspace content and provider keys are encrypted on the server. The server can decrypt this information to operate the service; this is not end-to-end encryption. Account metadata, including usernames and Google identifiers, is stored separately from encrypted workspace content.</p>
  <h2>Services that process data</h2>
  <p>Cloudflare hosts Workbench and its database and file storage. Google processes authentication when you choose Google sign-in. When you send a message or request image generation, Workbench sends the relevant conversation, file content, images, and instructions to the AI provider you select, using your saved provider key. Available providers include OpenAI, Anthropic, Google Gemini, and OpenRouter. Their own privacy policies and retention practices apply to requests they receive. Workbench does not use Google sign-in information to train AI models.</p>
  <h2>Cookies and security</h2>
  <p>Workbench uses an HttpOnly session cookie to keep you signed in and a short-lived cookie to secure Google sign-in. Session records expire after seven days; Google sign-in state expires after ten minutes. Browser storage keeps your theme preference and may contain workspace data from the earlier browser-only version. Security rate limits use a keyed fingerprint of your IP address. Hosting services may process request and technical information for service operation and security.</p>
  <h2>Retention and your choices</h2>
  <p>Saved workspace data remains available until deleted. You can delete chats and files in the app, remove provider keys in Settings, and sign out to revoke the current session. For account deletion or other account data requests, contact the address above from an address you control; ownership verification may be required. You can also revoke Workbench’s access in your Google Account. Revoking Google access does not itself delete stored Workbench data.</p>
 </main>;
}
