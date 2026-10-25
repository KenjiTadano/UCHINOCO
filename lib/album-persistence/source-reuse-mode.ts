/** Non-sensitive opt-in gate; authorization remains in each server route. */
export function sourceReuseEnabled(mode: unknown, environment = process.env.VERCEL_ENV, branch = process.env.VERCEL_GIT_COMMIT_REF) {
  return !process.env.SOURCE_REUSE_CONTROL_ID && environment === "preview" && branch === "codex/task085-4-4-5-13-source-reuse" && mode === "candidate";
}
