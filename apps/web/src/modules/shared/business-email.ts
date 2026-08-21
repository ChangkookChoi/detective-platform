export type BusinessEmailKind = "generic_business" | "unknown";

const emailPattern =
  /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

const genericBusinessLocals = new Set([
  "admin",
  "biz",
  "business",
  "contact",
  "cs",
  "help",
  "hello",
  "info",
  "inquiry",
  "mail",
  "master",
  "office",
  "support",
]);

export function normalizeOptionalBusinessEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  let display = value.replace(/\s+/g, " ").trim();
  if (!display) {
    return null;
  }
  if (display.toLowerCase().startsWith("mailto:")) {
    display = display.slice(7).trim();
  }
  display = display.split("?", 1)[0]?.trim() ?? "";
  if (display.length > 254 || !emailPattern.test(display)) {
    throw new Error("invalid_business_email");
  }

  const [local = "", domain = ""] = display.split("@");
  const normalized = `${local.toLowerCase()}@${domain.toLowerCase()}`;
  const kind: BusinessEmailKind = genericBusinessLocals.has(local.toLowerCase())
    ? "generic_business"
    : "unknown";

  return { display, normalized, kind };
}
