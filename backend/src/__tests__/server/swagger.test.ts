import { describe, expect, it, vi } from "vitest";
import { buildOpenApiDocument } from "../../server/swagger";

vi.mock("../../routes/api", () => ({
  apiRouteDefinitions: [
    {
      allowApiKey: true,
      handlers: [],
      method: "get",
      path: "/videos",
    },
    {
      allowApiKey: true,
      handlers: [],
      method: "get",
      path: "/videos/:id",
    },
    {
      handlers: [],
      method: "put",
      path: "/videos/:id",
    },
  ],
}));

describe("buildOpenApiDocument", () => {
  it("documents API, settings, and feed routes", () => {
    const document = buildOpenApiDocument();

    expect(document.openapi).toBe("3.0.3");
    expect(document.paths["/api/videos"]?.get).toMatchObject({
      operationId: "getVideos",
      summary: "List videos",
      tags: ["videos"],
    });
    expect(document.paths["/api/settings/password-enabled"]?.get).toMatchObject({
      summary: "Check password login status",
      tags: ["auth"],
    });
    expect(document.paths["/feed/{token}"]?.get).toMatchObject({
      summary: "Get RSS feed",
      tags: ["feed"],
    });
    expect(document.components.schemas.Video).toBeDefined();
    expect(document.components.schemas.DownloadRequest).toBeDefined();
  });

  it("converts Express path parameters and documents API key security", () => {
    const document = buildOpenApiDocument();
    const operation = document.paths["/api/videos/{id}"]?.get;

    expect(operation?.parameters).toEqual([
      {
        in: "path",
        name: "id",
        required: true,
        schema: { type: "string" },
      },
    ]);
    expect(operation?.security).toEqual([
      { cookieAuth: [] },
      { apiKeyHeader: [] },
      { apiKeyAuthorization: [] },
    ]);
    expect(operation?.responses["200"].content?.["application/json"]).toEqual({
      schema: { $ref: "#/components/schemas/Video" },
    });
  });

  it("documents request DTOs, CSRF security, and curl samples for writes", () => {
    const document = buildOpenApiDocument();
    const operation = document.paths["/api/videos/{id}"]?.put;

    expect(operation?.security).toEqual([
      { cookieAuth: [], csrfHeader: [] },
    ]);
    expect(operation?.requestBody?.content["application/json"]).toEqual({
      schema: { $ref: "#/components/schemas/UpdateVideoRequest" },
    });
    expect(operation?.["x-codeSamples"]?.[0].source).toContain("curl -X PUT");
    expect(operation?.["x-codeSamples"]?.[0].source).toContain("X-CSRF-Token");
  });
});
