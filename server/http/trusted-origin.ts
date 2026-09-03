const DEVELOPMENT_ORIGINS = new Set([
  'http://127.0.0.1:3000',
  'http://localhost:3000',
]);

export function isTrustedRequestOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  const configuredOrigin = process.env.APP_ORIGIN;
  return (
    origin === configuredOrigin ||
    (process.env.NODE_ENV !== 'production' && DEVELOPMENT_ORIGINS.has(origin))
  );
}
