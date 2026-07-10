export function helferGateDecision(input: {
  pathname: string;
  search: string;
  hasHelfer: boolean;
  isAdmin: boolean;
}): { action: "allow" } | { action: "redirect"; to: string } {
  const { pathname, search, hasHelfer, isAdmin } = input;
  const isA = pathname === "/a" || pathname.startsWith("/a/");
  const isHelfer = pathname === "/helfer" || pathname.startsWith("/helfer/");
  if (!isA && !isHelfer) return { action: "allow" };

  const allowed = isA ? hasHelfer || isAdmin : hasHelfer;
  if (allowed) return { action: "allow" };

  const returnTo = encodeURIComponent(pathname + search);
  return { action: "redirect", to: `/?returnTo=${returnTo}` };
}
