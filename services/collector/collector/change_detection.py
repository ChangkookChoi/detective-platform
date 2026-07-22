from __future__ import annotations

from collector.models import NormalizedRecord, OfficeSnapshot, ReviewProposal
from collector.normalize import is_viable_candidate

_FIELD_MAP = {
    "name": "name",
    "phoneNormalized": "phone_normalized",
    "phoneDisplay": "phone_display",
    "addressText": "address_text",
    "summary": "summary",
}
_HIGH_RISK_FIELDS = frozenset(
    {"name", "phoneNormalized", "phoneDisplay", "addressText"}
)


def propose_review(
    record: NormalizedRecord,
    office: OfficeSnapshot | None,
) -> ReviewProposal | None:
    if not is_viable_candidate(record):
        return None

    proposed = record.normalized_values
    if office is None:
        return ReviewProposal(
            type="new_office",
            risk="high",
            previous_values=None,
            proposed_values=proposed,
            cause="collector:new_office_candidate",
        )

    previous_values: dict[str, str | None] = {}
    changed_values: dict[str, str] = {}
    for proposed_key, office_key in _FIELD_MAP.items():
        proposed_value = proposed.get(proposed_key)
        if not isinstance(proposed_value, str):
            continue
        current_value = getattr(office, office_key)
        if proposed_value != current_value:
            previous_values[proposed_key] = current_value
            changed_values[proposed_key] = proposed_value

    if not changed_values:
        return None

    risk = "high" if _HIGH_RISK_FIELDS & changed_values.keys() else "medium"
    return ReviewProposal(
        type="field_change",
        risk=risk,
        previous_values=previous_values,
        proposed_values=changed_values,
        cause="collector:source_field_change",
    )
