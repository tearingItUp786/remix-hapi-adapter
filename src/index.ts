// IDK why this is needed when it's in the tsconfig..........
// YAY PROJECT REFERENCES!
/// <reference lib="DOM.Iterable" />

import Hapi from "@hapi/hapi";

import {
  createReadableStreamFromReadable,
  type AppLoadContext,
  createRequestHandler as createRemixRequestHandler,
} from "@remix-run/node";
// Interface for getLoadContext adapted for Hapi
// @ts-ignore
interface GetLoadContextFunction {
  (
    request: Hapi.Request,
    h: Hapi.ResponseToolkit,
  ): Promise<AppLoadContext> | AppLoadContext;
}

export function createRemixHapiHandler({
  build,
  getLoadContext,
  mode,
}: {
  build: any;
  getLoadContext?: GetLoadContextFunction;
  mode: string;
}) {
  let handleRequest = createRemixRequestHandler(build, mode);

  const handler = async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
    let remixRequest = await createRemixRequest(request, h);
    let loadContext = await getLoadContext?.(request, h);
    let response = await handleRequest(remixRequest as any, loadContext);
    return sendRemixResponseHapi(h, response);
  };

  return handler;
}

async function createRemixRequest(
  request: Hapi.Request,
  _h: Hapi.ResponseToolkit,
) {
  const url = new URL(
    `${request.server.info.protocol}://${request.info.host}${request.url.pathname}${request.url.search}`,
  );
  const controller = new AbortController();
  request.raw.res.on("close", () => controller.abort());

  const init: any = {
    method: request.method.toUpperCase(),
    headers: createRemixHeaders(request.headers),
    signal: controller.signal,
  };

  if (request.method !== "get" && request.payload) {
    init.body = createReadableStreamFromReadable(request.raw.req);
    // @ts-ignore
    init.duplex = "half";
  }

  let req = new Request(url.href, init);
  return req;
}

function createRemixHeaders(requestHeaders: Hapi.Request["headers"]) {
  const headers = new Headers();
  Object.entries(requestHeaders).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => headers.append(key, v));
    } else {
      headers.set(key, value as any);
    }
  });
  return headers;
}

async function sendRemixResponseHapi(
  h: Hapi.ResponseToolkit,
  nodeResponse: Response,
): Promise<Hapi.ResponseObject> {
  const headers: Record<string, any> = {};
  for (let [key, value] of nodeResponse.headers.entries()) {
    headers[key] = value;
  }

  let payload: any = null;
  if (nodeResponse.body) {
    payload = await nodeResponse.text(); // Assuming the response is text; adjust based on actual content type
  }

  const response = h
    .response(payload)
    .code(nodeResponse.status)
    .message(nodeResponse.statusText);

  Object.entries(headers).forEach(([key, value]: [string, any]) => {
    response.header(key, value);
  });

  return response;
}
