const SAFE_APP_PATH =
  /^(?:\/(?:home|memories|album|search|photos\/new|plus)(?:\/|\?|$)|\/settings\/billing(?:\/|\?|$)|\/pets(?:\/|\?|$))/;

export function safeAppReturnPath(value: string | string[] | undefined) {
  const path = Array.isArray(value) ? value[0] : value;
  if (!path || path.startsWith("//") || path.includes("\\")) {
    return null;
  }
  const pathname = path.split(/[?#]/, 1)[0];
  return SAFE_APP_PATH.test(pathname) ? path : null;
}
