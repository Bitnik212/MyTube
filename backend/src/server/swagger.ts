import { Express, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { apiRouteDefinitions, ApiRouteDefinition } from "../routes/api";
import { VERSION } from "../version";

type OpenApiMethod = "delete" | "get" | "patch" | "post" | "put";

type DocumentedRoute = {
  allowApiKey?: boolean;
  method: OpenApiMethod;
  path: string;
  public?: boolean;
};

type OpenApiParameter = {
  in: "path";
  name: string;
  required: true;
  schema: { type: "string" };
};

type OpenApiOperation = {
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content: Record<string, unknown>;
    required?: boolean;
  };
  responses: Record<string, { description: string }>;
  security?: Array<Record<string, string[]>>;
  summary: string;
  tags: string[];
};

type OpenApiDocument = {
  components: {
    securitySchemes: Record<string, unknown>;
  };
  info: {
    description: string;
    title: string;
    version: string;
  };
  openapi: "3.0.3";
  paths: Record<string, Partial<Record<OpenApiMethod, OpenApiOperation>>>;
  servers: Array<{ url: string }>;
  tags: Array<{ name: string }>;
};

const settingsRoutes: DocumentedRoute[] = [
  { method: "get", path: "/api/settings" },
  { method: "patch", path: "/api/settings" },
  { method: "post", path: "/api/settings/migrate" },
  { method: "post", path: "/api/settings/delete-legacy" },
  { method: "post", path: "/api/settings/format-filenames" },
  { method: "get", path: "/api/settings/cloudflared/status" },
  { method: "post", path: "/api/settings/tags/rename" },
  { method: "get", path: "/api/settings/password-enabled" },
  { method: "post", path: "/api/settings/verify-password" },
  { method: "post", path: "/api/settings/verify-admin-password" },
  { method: "post", path: "/api/settings/verify-visitor-password" },
  { method: "post", path: "/api/settings/confirm-admin-password" },
  { method: "post", path: "/api/settings/logout" },
  { method: "get", path: "/api/settings/passkeys" },
  { method: "get", path: "/api/settings/passkeys/exists" },
  { method: "post", path: "/api/settings/passkeys/register" },
  { method: "post", path: "/api/settings/passkeys/register/verify" },
  { method: "post", path: "/api/settings/passkeys/authenticate" },
  { method: "post", path: "/api/settings/passkeys/authenticate/verify" },
  { method: "delete", path: "/api/settings/passkeys" },
  { method: "post", path: "/api/settings/upload-cookies" },
  { method: "post", path: "/api/settings/delete-cookies" },
  { method: "get", path: "/api/settings/check-cookies" },
  { method: "post", path: "/api/settings/telegram/test" },
  { method: "post", path: "/api/settings/tmdb/test" },
  { method: "post", path: "/api/settings/hooks/:name" },
  { method: "delete", path: "/api/settings/hooks/:name" },
  { method: "get", path: "/api/settings/hooks/status" },
  { method: "get", path: "/api/settings/export-database" },
  { method: "post", path: "/api/settings/import-database" },
  { method: "post", path: "/api/settings/merge-database-preview" },
  { method: "post", path: "/api/settings/merge-database" },
  { method: "post", path: "/api/settings/cleanup-backup-databases" },
  { method: "get", path: "/api/settings/last-backup-info" },
  { method: "post", path: "/api/settings/restore-from-last-backup" },
  { method: "get", path: "/api/settings/filename-template/presets" },
  { method: "post", path: "/api/settings/filename-template/validate" },
  { method: "post", path: "/api/settings/filename-template/preview" },
  { method: "post", path: "/api/settings/filename-template/rename-all" },
  { method: "get", path: "/api/settings/filename-template/rename-jobs/:jobId" },
  { method: "post", path: "/api/settings/filename-template/rename-jobs/:jobId/cancel" },
  { method: "post", path: "/api/settings/media-server-export/rebuild" },
  { method: "get", path: "/api/settings/media-server-export/jobs/:jobId" },
  { method: "post", path: "/api/settings/media-server-export/jobs/:jobId/cancel" },
];

const feedRoutes: DocumentedRoute[] = [
  { method: "get", path: "/feed/:token", public: true },
  { method: "get", path: "/api/rss/feed/:token", public: true },
];

const toOpenApiPath = (path: string): string =>
  path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

const getPathParameters = (path: string): OpenApiParameter[] => {
  const parameters: OpenApiParameter[] = [];
  const matcher = /:([A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(path)) !== null) {
    parameters.push({
      in: "path",
      name: match[1],
      required: true,
      schema: { type: "string" },
    });
  }

  return parameters;
};

const toDocumentedApiRoute = (definition: ApiRouteDefinition): DocumentedRoute => ({
  allowApiKey: definition.allowApiKey,
  method: definition.method,
  path: `/api${definition.path}`,
});

const getTag = (path: string): string => {
  const parts = path.split("/").filter(Boolean);

  if (parts[0] === "api" && parts[1]) {
    return parts[1];
  }

  return parts[0] ?? "api";
};

const toTitle = (value: string): string =>
  value
    .replace(/[{}:]/g, "")
    .split(/[-_/\s]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const summarizeRoute = (route: DocumentedRoute): string => {
  const pathParts = route.path.split("/").filter(Boolean);
  const meaningfulParts = pathParts[0] === "api" ? pathParts.slice(1) : pathParts;
  const name = meaningfulParts.length > 0 ? toTitle(meaningfulParts.join(" ")) : "API";

  return `${route.method.toUpperCase()} ${name}`;
};

const isMultipartRoute = (route: DocumentedRoute): boolean =>
  route.method === "post" &&
  ["/upload", "upload-", "import-database", "merge-database"].some((part) =>
    route.path.includes(part)
  );

const getRequestBody = (
  route: DocumentedRoute
): OpenApiOperation["requestBody"] | undefined => {
  if (!["patch", "post", "put"].includes(route.method)) {
    return undefined;
  }

  if (isMultipartRoute(route)) {
    return {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
    };
  }

  return {
    required: false,
    content: {
      "application/json": {
        schema: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  };
};

const getSecurity = (
  route: DocumentedRoute
): OpenApiOperation["security"] | undefined => {
  if (route.public) {
    return undefined;
  }

  const cookieSecurity: Record<string, string[]> = { cookieAuth: [] };

  if (["delete", "patch", "post", "put"].includes(route.method)) {
    cookieSecurity.csrfHeader = [];
  }

  if (route.allowApiKey) {
    return [cookieSecurity, { apiKeyHeader: [] }, { apiKeyAuthorization: [] }];
  }

  return [cookieSecurity];
};

const createOperation = (route: DocumentedRoute): OpenApiOperation => {
  const parameters = getPathParameters(route.path);
  const requestBody = getRequestBody(route);

  return {
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    ...(getSecurity(route) ? { security: getSecurity(route) } : {}),
    responses: {
      "200": { description: "Successful response" },
      "400": { description: "Bad request" },
      "401": { description: "Unauthorized" },
      "403": { description: "Forbidden" },
      "500": { description: "Server error" },
    },
    summary: summarizeRoute(route),
    tags: [getTag(route.path)],
  };
};

export const buildOpenApiDocument = (): OpenApiDocument => {
  const routes = [
    ...feedRoutes,
    ...apiRouteDefinitions.map(toDocumentedApiRoute),
    ...settingsRoutes,
  ];

  const paths = routes.reduce<OpenApiDocument["paths"]>((accumulator, route) => {
    const openApiPath = toOpenApiPath(route.path);
    accumulator[openApiPath] = {
      ...accumulator[openApiPath],
      [route.method]: createOperation(route),
    };

    return accumulator;
  }, {});

  const tagNames = Array.from(new Set(routes.map((route) => getTag(route.path)))).sort();

  return {
    openapi: "3.0.3",
    info: {
      title: "MyTube Backend API",
      description:
        "Generated route index for the MyTube backend. Request and response schemas are intentionally broad until endpoint-specific schemas are added.",
      version: VERSION.number,
    },
    servers: [{ url: "/" }],
    tags: tagNames.map((name) => ({ name })),
    components: {
      securitySchemes: {
        apiKeyHeader: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
        },
        apiKeyAuthorization: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
          description: "Use the format: ApiKey <key>",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "mytube_auth_session",
        },
        csrfHeader: {
          type: "apiKey",
          in: "header",
          name: "X-CSRF-Token",
        },
      },
    },
    paths,
  };
};

export const registerSwaggerRoutes = (app: Express): void => {
  const openApiDocument = buildOpenApiDocument();

  app.get("/docs.json", (_req: Request, res: Response) => {
    res.json(openApiDocument);
  });

  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: "MyTube API Docs",
      swaggerOptions: {
        persistAuthorization: true,
      },
    })
  );
};
