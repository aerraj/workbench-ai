declare namespace Cloudflare {
  interface Env {
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    DB?: D1Database;
    VAULT_MASTER_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
