type EvidenceField = "name" | "phone" | "email" | "address";

type EvidenceStatus =
  | "match"
  | "different"
  | "missing_candidate"
  | "missing_source"
  | "unavailable";

export type ReviewSourceEvidenceRow = {
  field: EvidenceField;
  label: string;
  candidateValue: string | null;
  sourceValue: string | null;
  status: EvidenceStatus;
};

const evidenceFields: Array<{
  field: EvidenceField;
  label: string;
  aliases: string[];
}> = [
  { field: "name", label: "업체명", aliases: ["name"] },
  {
    field: "phone",
    label: "대표 전화번호",
    aliases: ["phoneDisplay", "phone_display", "phoneNormalized", "phone_normalized", "phone"],
  },
  {
    field: "email",
    label: "공식 업무용 이메일",
    aliases: ["emailDisplay", "email_display", "emailNormalized", "email_normalized", "email"],
  },
  {
    field: "address",
    label: "소재지 주소",
    aliases: ["addressText", "address_text", "address"],
  },
];

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function readText(record: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    const value = record[alias];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function comparableValue(field: EvidenceField, value: string | null) {
  if (!value) {
    return null;
  }

  if (field === "phone") {
    return value.replace(/\D/g, "");
  }

  if (field === "email") {
    return value.toLocaleLowerCase("en-US");
  }

  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s,·.()-]+/g, "");
}

function evidenceStatus(
  field: EvidenceField,
  candidateValue: string | null,
  sourceValue: string | null,
): EvidenceStatus {
  if (!candidateValue && !sourceValue) {
    return "unavailable";
  }

  if (!candidateValue) {
    return "missing_candidate";
  }

  if (!sourceValue) {
    return "missing_source";
  }

  return comparableValue(field, candidateValue) ===
    comparableValue(field, sourceValue)
    ? "match"
    : "different";
}

export function presentReviewSourceEvidence({
  candidateValues,
  extractedValues,
  normalizedValues,
}: {
  candidateValues: unknown;
  extractedValues: unknown;
  normalizedValues: unknown;
}): ReviewSourceEvidenceRow[] {
  const candidate = asRecord(candidateValues);
  const extracted = asRecord(extractedValues);
  const normalized = asRecord(normalizedValues);

  return evidenceFields.map(({ field, label, aliases }) => {
    const candidateValue = readText(candidate, aliases);
    const sourceValue =
      readText(extracted, aliases) ?? readText(normalized, aliases);

    return {
      field,
      label,
      candidateValue,
      sourceValue,
      status: evidenceStatus(field, candidateValue, sourceValue),
    };
  });
}
