"use client";

import { useEffect, type ReactNode } from "react";

import type { PublicAnalyticsEventType } from "./public-event-contract";

const sessionStorageKey = "detective-platform:analytics-session:v1";
let cachedSessionId: string | null | undefined;

function getSessionId() {
  if (cachedSessionId !== undefined) {
    return cachedSessionId;
  }

  try {
    const existing = window.sessionStorage.getItem(sessionStorageKey);

    if (existing) {
      cachedSessionId = existing;
      return cachedSessionId;
    }

    const created = window.crypto.randomUUID();
    window.sessionStorage.setItem(sessionStorageKey, created);
    cachedSessionId = created;
    return cachedSessionId;
  } catch {
    cachedSessionId = null;
    return null;
  }
}

function recordEvent(officeId: string, type: PublicAnalyticsEventType) {
  const sessionId = getSessionId();

  if (!sessionId) {
    return;
  }

  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ officeId, type, sessionId }),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
}

export function OfficeDetailViewTracker({ officeId }: { officeId: string }) {
  useEffect(() => {
    recordEvent(officeId, "office_detail_view");
  }, [officeId]);

  return null;
}

export function TrackedPhoneLink({
  officeId,
  href,
  className,
  children,
}: {
  officeId: string;
  href: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => recordEvent(officeId, "phone_click")}
    >
      {children}
    </a>
  );
}
