export interface Workspace {
  id: string;
  created_at: string;
  status: string;
}

export type DocumentKind = "cf1" | "pmrf" | "annex_b" | "acroform" | "fixed_layout";

export interface ApiDocument {
  id: string;
  workspace_id: string;
  sha256: string;
  byte_size: number;
  page_count: number;
  document_kind: DocumentKind;
  ingest_status: string;
  created_at: string;
}

export type Rect = [number, number, number, number];

export interface Slot {
  id: string;
  text?: string;
  field_name?: string;
  page?: number;
  rect: Rect;
  type?: string;
  options?: string[];
  value?: string;
  protected?: boolean;
  confidence?: number;
  source?: "pdf_text" | "ocr" | "layout";
  max_length?: number;
  flags?: number;
}

export interface Structure {
  document_id: string;
  document_kind: DocumentKind;
  page_count: number;
  sha256: string;
  pages: {
    page: number;
    width: number;
    height: number;
    text: string;
    boxes: Slot[];
    protected_regions: Rect[];
  }[];
  widgets: Slot[];
}

export interface Fact {
  name: string;
  value: string;
  document_id: string;
  page: number;
  confidence: number | null;
  box_id?: string;
  widget_id?: string;
}

export interface Conflict {
  name: string;
  sources: Fact[];
  asked: boolean;
  resolved: boolean;
}

export interface Draft {
  request_id: string;
  status: "completed";
  draft_id: string;
  preview_url: string;
  export_url: string;
  missing_fields: string[];
}

export interface Message {
  request_id: string;
  status: "needs_input" | "completed";
  assistant_message: string;
  field?: string;
  name?: string;
  label?: string;
  conflict?: Conflict;
  draft_id?: string;
  preview_url?: string;
  export_url?: string;
  missing_fields?: string[];
}

export interface Comparison {
  request_id: string;
  status: "completed";
  comparisons: {
    name: string;
    outcome: "agreement" | "conflict" | "insufficient_evidence";
    sources: Fact[];
  }[];
}

export interface Explanation {
  request_id: string;
  status: "completed" | "needs_input" | "abstained";
  assistant_message: string;
  citations: { term: string; feed: string; url: string }[];
}

export interface Health {
  api: string;
  database: string;
  inference: {
    reachable: boolean;
    model?: string;
    loaded_models?: string[];
    context_tokens?: number;
  };
}

export interface RequestStatus {
  id: string;
  status: "accepted" | "ingesting" | "ready" | "generating_proposals" | "needs_input" | "rendering" | "completed" | "failed";
  error_code: string | null;
  kind: "ingest" | "message" | "compare" | "explanation" | "draft";
  workspace_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Upload {
  document: ApiDocument;
  artifact_id: string;
  request_id: string;
}

export interface MessageRequest {
  document_id?: string;
  answer?: string;
  skip?: boolean;
  finalize?: boolean;
}

export interface DraftRequest {
  document_id: string;
  values?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errorCode?: string,
    public readonly requestId?: string,
  ) {
    super(requestId ? `${message} (request ID: ${requestId})` : message);
    this.name = "ApiError";
  }
}

export function resource(id: string): string {
  return encodeURIComponent(id);
}

function apiPath(path: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//") || path.includes("\\")) {
    throw new ApiError("API requests must use same-origin API paths.", 0);
  }
  const prefixed = path.startsWith("/api/v1")
    ? path
    : `/api/v1/${path.replace(/^\//, "")}`;
  const url = new URL(prefixed, window.location.origin);
  if (url.origin !== window.location.origin || (url.pathname !== "/api/v1" && !url.pathname.startsWith("/api/v1/"))) {
    throw new ApiError("API requests must stay within /api/v1.", 0);
  }
  return `${url.pathname}${url.search}`;
}

const errorMessages: Record<string, string> = {
  not_found: "The requested resource was not found.",
  upload_too_large: "The PDF exceeds the 10 MiB upload limit.",
  artifact_unavailable: "The document artifact is unavailable.",
  artifact_modified: "The document artifact has changed and cannot be used.",
  processing_failed: "The API could not process this request.",
  inference_unavailable: "Local inference is unavailable. Check the local inference service.",
};

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function backendError(response: Response): Promise<ApiError> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return new ApiError("The API error response could not be read. Check the local API connection.", response.status, undefined, response.headers.get("x-request-id") ?? undefined);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    // Proxies can return text or HTML rather than FastAPI's JSON envelope.
  }
  const envelope = object(payload);
  const detail = envelope?.detail ?? payload;
  const details = object(detail);
  const code = typeof details?.error_code === "string" ? details.error_code : undefined;
  const requestId = typeof details?.request_id === "string" ? details.request_id
    : typeof envelope?.request_id === "string" ? envelope.request_id
    : response.headers.get("x-request-id") ?? undefined;
  let message = `API request failed (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}).`;
  if (code) {
    message = `${errorMessages[code] ?? code.replace(/_/g, " ")} [${code}]`;
  } else if (Array.isArray(detail)) {
    const issues = detail.map((issue: unknown) => {
      const entry = object(issue);
      if (!entry || typeof entry.msg !== "string") return "Invalid request value";
      const location = Array.isArray(entry.loc) ? entry.loc.map(String).join(".") : "";
      return location ? `${location}: ${entry.msg}` : entry.msg;
    });
    message = `Request validation failed: ${issues.join("; ") || "Invalid request body"}.`;
  } else if (typeof detail === "string" && detail.trim()) {
    message += ` ${detail.slice(0, 500)}`;
  } else if (!payload && text.trim() && !response.headers.get("content-type")?.includes("text/html") && !text.trimStart().startsWith("<")) {
    message += ` ${text.trim().slice(0, 500)}`;
  }
  return new ApiError(message, response.status, code, requestId);
}

async function request(path: string, options?: RequestInit): Promise<Response> {
  const url = apiPath(path);
  const headers = new Headers(options?.headers);
  if (options?.body instanceof FormData) {
    headers.delete("Content-Type");
  } else if (typeof options?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("API request was cancelled.", 0);
    }
    throw new ApiError("Cannot reach the local API. Check that the backend and API proxy are running.", 0);
  }
  if (!response.ok) throw await backendError(response);
  return response;
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await request(path, options);
  try {
    return await response.json() as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiError("The API returned invalid JSON instead of the expected response.", response.status);
    }
    throw new ApiError("The API response could not be read. Check the local API connection.", response.status);
  }
}

export async function apiBlob(path: string, options?: RequestInit): Promise<Blob> {
  const response = await request(path, options);
  try {
    return await response.blob();
  } catch {
    throw new ApiError("The API download could not be read. Check the local API connection.", response.status);
  }
}
