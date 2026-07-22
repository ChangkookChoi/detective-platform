export const publicAnalyticsEventTypes = [
  "office_detail_view",
  "phone_click",
] as const;

export type PublicAnalyticsEventType =
  (typeof publicAnalyticsEventTypes)[number];
