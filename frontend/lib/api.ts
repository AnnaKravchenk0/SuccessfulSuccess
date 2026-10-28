import { signOut } from "aws-amplify/auth"

import { getAccessToken } from "@/lib/auth"
import type {
  AgendaSaveInput,
  ApiErrorBody,
  ApiErrorDetail,
  Meeting,
  MeetingCreateInput,
  MeetingList,
  ParseAgendaResponse,
  UserProfile,
} from "@/lib/types"

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

export const PARSER_URL = process.env.NEXT_PUBLIC_PARSER_URL ?? ""

export class ApiError extends Error {
  readonly code: string
  readonly details: ApiErrorDetail[]
  readonly status: number

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[]) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
      cache: "no-store",
    })
  } catch {
    throw new ApiError(0, "network_error", "Could not reach the meetings API.", [])
  }

  // The session is gone or was revoked: sign out, and the auth guard sends the
  // user back to the login page.
  if (response.status === 401) {
    void signOut()
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    const body = payload as ApiErrorBody | null
    throw new ApiError(
      response.status,
      body?.error?.code ?? "internal_error",
      body?.error?.message ?? `Request failed with status ${response.status}.`,
      body?.error?.details ?? [],
    )
  }

  return payload as T
}

export function listMeetings(params: { date?: string; q?: string } = {}) {
  const search = new URLSearchParams()
  if (params.date) search.set("date", params.date)
  if (params.q) search.set("q", params.q)
  const query = search.toString()
  return request<MeetingList>(`/api/v1/meetings${query ? `?${query}` : ""}`)
}

export function getMeeting(id: string) {
  return request<Meeting>(`/api/v1/meetings/${id}`)
}

export function createMeeting(payload: MeetingCreateInput) {
  return request<Meeting>("/api/v1/meetings", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function updateMeeting(id: string, payload: MeetingCreateInput) {
  return request<Meeting>(`/api/v1/meetings/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  })
}

export function deleteMeeting(id: string) {
  return request<void>(`/api/v1/meetings/${id}`, { method: "DELETE" })
}

export function saveAgenda(meetingId: string, payload: AgendaSaveInput) {
  return request<Meeting>(`/api/v1/meetings/${meetingId}/agenda`, {
    method: "PUT",
    body: JSON.stringify(payload),
  })
}

/** Call the agenda-parser Function URL (Bedrock). Not the main API. */
export async function parseAgendaText(
  text: string,
  today: string,
  tz: string,
  signal?: AbortSignal,
): Promise<ParseAgendaResponse> {
  if (!PARSER_URL) {
    throw new ApiError(
      0,
      "parser_not_configured",
      "NEXT_PUBLIC_PARSER_URL is not set. Deploy the AI stack and paste ParserUrl into .env.",
      [],
    )
  }

  const token = await getAccessToken()
  let response: Response
  try {
    response = await fetch(PARSER_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, today, tz }),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "aborted", "Parsing was cancelled.", [])
    }
    throw new ApiError(0, "network_error", "Could not reach the agenda parser.", [])
  }

  if (response.status === 401) {
    void signOut()
    throw new ApiError(401, "unauthorized", "Sign in to continue.", [])
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : null) || `Parser failed with status ${response.status}.`
    const code =
      response.status === 413
        ? "payload_too_large"
        : response.status === 422
          ? "parse_failed"
          : response.status === 429 || response.status === 503
            ? "busy"
            : "parser_error"
    throw new ApiError(response.status, code, message, [])
  }

  return payload as ParseAgendaResponse
}

export function getMe() {
  return request<UserProfile>("/api/v1/me")
}

/** Stores the profile from the ID token in the users table; call after signing in. */
export function syncMe(idToken: string) {
  return request<UserProfile>("/api/v1/me/sync", {
    method: "POST",
    body: JSON.stringify({ id_token: idToken }),
  })
}
