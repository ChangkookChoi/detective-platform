import { randomUUID } from "node:crypto";

import {
  PublicAnalyticsError,
  recordPublicAnalyticsEvent,
} from "@/modules/analytics/record-public-event";
import type { PublicAnalyticsEventType } from "@/modules/analytics/public-event-contract";

export const runtime = "nodejs";

const maximumBodyLength = 512;

type AnalyticsRequestBody = {
  officeId: string;
  type: PublicAnalyticsEventType;
  sessionId: string;
};

function errorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
) {
  return Response.json(
    { error: { code, message, requestId } },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-request-id": requestId,
      },
    },
  );
}

function parseBody(value: unknown): AnalyticsRequestBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);

  if (
    keys.length !== 3 ||
    !keys.every((key) => ["officeId", "type", "sessionId"].includes(key)) ||
    typeof body.officeId !== "string" ||
    typeof body.type !== "string" ||
    typeof body.sessionId !== "string"
  ) {
    return null;
  }

  return body as AnalyticsRequestBody;
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin !== new URL(request.url).origin) {
    return errorResponse(
      requestId,
      403,
      "ORIGIN_NOT_ALLOWED",
      "허용되지 않은 요청입니다.",
    );
  }

  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    return errorResponse(
      requestId,
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "JSON 요청만 지원합니다.",
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (Number.isFinite(contentLength) && contentLength > maximumBodyLength) {
    return errorResponse(
      requestId,
      413,
      "PAYLOAD_TOO_LARGE",
      "요청 본문이 너무 큽니다.",
    );
  }

  let text: string;

  try {
    text = await request.text();
  } catch {
    return errorResponse(
      requestId,
      400,
      "VALIDATION_ERROR",
      "요청 값을 확인해 주세요.",
    );
  }

  if (text.length > maximumBodyLength) {
    return errorResponse(
      requestId,
      413,
      "PAYLOAD_TOO_LARGE",
      "요청 본문이 너무 큽니다.",
    );
  }

  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    return errorResponse(
      requestId,
      400,
      "VALIDATION_ERROR",
      "요청 값을 확인해 주세요.",
    );
  }

  const body = parseBody(value);

  if (!body) {
    return errorResponse(
      requestId,
      400,
      "VALIDATION_ERROR",
      "요청 값을 확인해 주세요.",
    );
  }

  try {
    await recordPublicAnalyticsEvent(body);
  } catch (error) {
    if (error instanceof PublicAnalyticsError) {
      if (error.reason === "rate_limited") {
        return errorResponse(
          requestId,
          429,
          "RATE_LIMITED",
          "잠시 후 다시 시도해 주세요.",
        );
      }

      if (error.reason === "office_not_found") {
        return errorResponse(
          requestId,
          404,
          "OFFICE_NOT_FOUND",
          "공개 업체를 찾을 수 없습니다.",
        );
      }

      return errorResponse(
        requestId,
        400,
        "VALIDATION_ERROR",
        "요청 값을 확인해 주세요.",
      );
    }

    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "이벤트를 기록하지 못했습니다.",
    );
  }

  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
}
