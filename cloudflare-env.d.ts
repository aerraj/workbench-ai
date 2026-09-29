declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    VAULT_MASTER_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
