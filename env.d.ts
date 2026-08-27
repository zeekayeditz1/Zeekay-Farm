declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: KVNamespace;
    AUTH_PEPPER: string;
  }
}
