import assert from "node:assert/strict";

import type { PoolClient } from "pg";

type TlsStream = {
  authorized?: boolean;
  encrypted?: boolean;
  getPeerCertificate?: () => unknown;
};

type ClientWithConnectionStream = PoolClient & {
  connection?: {
    stream?: TlsStream;
  };
};

const verifiedTlsModes = new Set(["verify-ca", "verify-full"]);

export type TlsInspection = {
  certificateAuthorized: boolean;
  clientEncrypted: boolean;
  peerCertificatePresent: boolean;
  sslMode: string;
};

export function inspectClientTls(
  client: PoolClient,
  connectionString: string,
): TlsInspection {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode") ?? "";
  const stream = (client as ClientWithConnectionStream).connection?.stream;
  const peerCertificate = stream?.getPeerCertificate?.();
  const peerCertificatePresent =
    typeof peerCertificate === "object" &&
    peerCertificate !== null &&
    Object.keys(peerCertificate).length > 0;

  return {
    certificateAuthorized: stream?.authorized === true,
    clientEncrypted: stream?.encrypted === true,
    peerCertificatePresent,
    sslMode,
  };
}

export function assertProductionTls(
  inspection: TlsInspection,
  backendReportsTls: boolean,
) {
  assert(
    inspection.clientEncrypted || backendReportsTls,
    "Production database connection must use TLS.",
  );

  if (verifiedTlsModes.has(inspection.sslMode)) {
    assert(
      inspection.clientEncrypted,
      `${inspection.sslMode} requires an encrypted client transport.`,
    );
    assert(
      inspection.certificateAuthorized,
      `${inspection.sslMode} requires an authorized server certificate.`,
    );
    assert(
      inspection.peerCertificatePresent,
      `${inspection.sslMode} requires a peer certificate.`,
    );
  }
}
