const nationalRepresentativeNumberPattern = /^(15|16|18)\d{6}$/;

export function normalizeDomesticPhoneDigits(display: string) {
  let normalized = display.replace(/\D/g, "");

  if (normalized.startsWith("82") && normalized.length >= 10) {
    const withoutCountryCode = normalized.slice(2);
    normalized = nationalRepresentativeNumberPattern.test(withoutCountryCode)
      ? withoutCountryCode
      : `0${withoutCountryCode}`;
  }

  const isStandardDomesticNumber =
    normalized.startsWith("0") &&
    normalized.length >= 9 &&
    normalized.length <= 11;
  const isNationalRepresentativeNumber =
    nationalRepresentativeNumberPattern.test(normalized);

  return isStandardDomesticNumber || isNationalRepresentativeNumber
    ? normalized
    : null;
}
