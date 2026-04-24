// Central API base — set VITE_API_BASE in .env for production deployments.
// In development the Vite proxy (vite.config.ts) forwards /api → localhost:3001,
// so the default empty string just means "use relative paths".
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
