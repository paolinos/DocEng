import { apiSpecKind, isApiSpecFile } from "../lib/apiSpec";

describe("OpenAPI and AsyncAPI YAML detection", () => {
  it("detects OpenAPI YAML files with the marker at the start", () => {
    expect(apiSpecKind("service.yaml", "openapi: 3.1.0\ninfo: {}\n")).toBe("openapi");
    expect(isApiSpecFile("SERVICE.YML", "openapi: 3.0.3")).toBe(true);
  });

  it("detects AsyncAPI YAML files with the marker at the start", () => {
    expect(apiSpecKind("events.yml", "asyncapi: 2.6.0\ninfo: {}\n")).toBe("asyncapi");
  });

  it("allows whitespace and a UTF-8 BOM before the marker", () => {
    expect(apiSpecKind("service.yaml", "\uFEFF\n  openapi: 3.1.0")).toBe("openapi");
  });

  it("does not match other YAML, other extensions, or markers later in the document", () => {
    expect(isApiSpecFile("config.yaml", "name: service\nopenapi: 3.1.0")).toBe(false);
    expect(isApiSpecFile("service.json", "openapi: 3.1.0")).toBe(false);
    expect(isApiSpecFile("notes.yaml", "# docs\nopenapi: 3.1.0")).toBe(false);
  });
});
