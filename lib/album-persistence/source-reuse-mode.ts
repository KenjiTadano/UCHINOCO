/** Query/branch experiment enrollment is retired. Only the finite server gate may enable Edit. */
export function sourceReuseEnabled(_mode: unknown, _environment = process.env.VERCEL_ENV, _branch = process.env.VERCEL_GIT_COMMIT_REF) {
  void _mode; void _environment; void _branch;
  return false;
}
