class ApiError extends Error {
  constructor(message, code, status, data) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed() {
  refreshSubscribers.forEach((cb) => cb());
  refreshSubscribers = [];
}

async function refreshToken() {
  const res = await fetch("/api/v1/auth/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "AttendX",
    },
    credentials: "include",
  });
  return res.ok;
}

export async function apiFetch(endpoint, options = {}) {
  const headers = {
    "X-Requested-With": "AttendX",
    ...(options.headers || {}),
  };

  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const config = {
    ...options,
    headers,
    credentials: "include",
  };

  let response = await fetch(endpoint, config);

  if (response.status === 401 && !options._retry && endpoint !== "/api/v1/auth/login" && endpoint !== "/api/v1/auth/signup" && endpoint !== "/api/v1/auth/refresh" && endpoint !== "/api/v1/auth/me") {
    if (!isRefreshing) {
      isRefreshing = true;
      const refreshed = await refreshToken();
      isRefreshing = false;

      if (refreshed) {
        onRefreshed();
        return apiFetch(endpoint, { ...options, _retry: true });
      } else {
        refreshSubscribers = [];
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
        throw new ApiError("Session expired", "SESSION_EXPIRED", 401);
      }
    } else {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh(async () => {
          try {
            const retryRes = await apiFetch(endpoint, { ...options, _retry: true });
            resolve(retryRes);
          } catch (err) {
            reject(err);
          }
        });
      });
    }
  }

  const contentType = response.headers.get("content-type") || "";
  let data;
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else if (contentType.includes("text/csv")) {
    data = await response.text();
    return { data, response };
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const code = data?.code || "REQUEST_FAILED";
    const message = data?.message || "An error occurred";
    throw new ApiError(message, code, response.status, data?.data);
  }

  return data;
}
