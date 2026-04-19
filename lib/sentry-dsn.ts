/** DSN for Sentry; unset means Sentry stays disabled (no warnings). */
export function getSentryDsn(): string | undefined {
  const dsn =
    process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ||
    process.env.SENTRY_DSN?.trim();
  return dsn || undefined;
}
