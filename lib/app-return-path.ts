const SAFE_APP_PATH =
  /^(?:\/(?:home|memories|album|search|photos\/new)(?:\/|$)|\/pets(?:\/|$))/;

export function safeAppReturnPath(value: string | string[] | undefined) {
  const path = Array.isArray(value) ? value[0] : value;
  if (!path || !SAFE_APP_PATH.test(path) || path.startsWith("//")) {
    return null;
  }
  return path;
}
