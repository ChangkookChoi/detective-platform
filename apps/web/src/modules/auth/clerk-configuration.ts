type ClerkDeploymentEnvironment = "development" | "preview" | "production";
type ClerkKeyMode = "test" | "live";

type ClerkConfiguration = {
  publishableKey?: string;
  secretKey?: string;
  deploymentEnvironment?: string;
};

function readKeyMode(
  value: string | undefined,
  prefix: "pk" | "sk",
): ClerkKeyMode | null {
  const key = value?.trim();

  if (key?.startsWith(`${prefix}_test_`)) {
    return "test";
  }

  if (key?.startsWith(`${prefix}_live_`)) {
    return "live";
  }

  return null;
}

export function isClerkConfigured(
  configuration: ClerkConfiguration = {
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
    deploymentEnvironment: process.env.VERCEL_ENV,
  },
) {
  const publishableKeyMode = readKeyMode(configuration.publishableKey, "pk");
  const secretKeyMode = readKeyMode(configuration.secretKey, "sk");

  if (!publishableKeyMode || publishableKeyMode !== secretKeyMode) {
    return false;
  }

  const deploymentEnvironment = configuration.deploymentEnvironment as
    | ClerkDeploymentEnvironment
    | undefined;

  if (deploymentEnvironment === "production") {
    return publishableKeyMode === "live";
  }

  if (deploymentEnvironment === "preview") {
    return publishableKeyMode === "test";
  }

  return true;
}

export function isClerkOnlyPath(pathname: string) {
  return ["/admin", "/sign-in", "/__clerk"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
