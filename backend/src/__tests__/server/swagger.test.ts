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
      summary: "GET Videos",
      tags: ["videos"],
    });
    expect(document.paths["/api/settings/password-enabled"]?.get).toMatchObject({
      summary: "GET Settings Password Enabled",
      tags: ["settings"],
    });
    expect(document.paths["/feed/{token}"]?.get).toMatchObject({
      summary: "GET Feed Token",
      tags: ["feed"],
    });
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
  });

  it("documents CSRF header security for cookie-authenticated writes", () => {
    const document = buildOpenApiDocument();

    expect(document.paths["/api/videos/{id}"]?.put?.security).toEqual([
      { cookieAuth: [], csrfHeader: [] },
    ]);
  });
});
