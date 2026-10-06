export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}

const NETWORK_ERROR = "Network error. Check your connection and try again.";

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(NETWORK_ERROR, "network", 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error ?? "Something went wrong. Please try again.", data?.code ?? "unknown", res.status);
  }
  return data as T;
}

/** multipart upload through XHR so we can report progress. */
export function uploadWithProgress<T>(
  url: string,
  form: FormData,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const data = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else
        reject(
          new ApiError(
            data?.error ?? (xhr.status === 413 ? "This file is too large to upload." : "Upload failed. Please try again."),
            data?.code ?? "upload_failed",
            xhr.status,
          ),
        );
    };
    xhr.onerror = () => reject(new ApiError(NETWORK_ERROR, "network", 0));
    xhr.onabort = () => reject(new ApiError("Upload cancelled.", "aborted", 0));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}
