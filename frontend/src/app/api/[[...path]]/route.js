export const dynamic = "force-dynamic";

async function proxy(request, { params }) {
  const path = params?.path ? params.path.join("/") : "";
  const backendUrl = process.env.BACKEND_URL || "http://backend:8000";
  const url = new URL(request.url);
  const targetUrl = `${backendUrl}/api/${path}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const options = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) {
      options.body = body;
    }
  }

  try {
    const backendResponse = await fetch(targetUrl, options);
    const responseHeaders = new Headers(backendResponse.headers);

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        status: "ERROR",
        code: "GATEWAY_TIMEOUT",
        message: "Failed to connect to backend service",
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
