import type { Project, ProjectRootType } from "../types";

export interface ProjectFileRoot {
  path: string;
  type: ProjectRootType;
}

export interface ProjectFileData {
  version: 1;
  name: string;
  roots: ProjectFileRoot[];
}

const DEFAULT_PROJECT_NAME = "Untitled Project";

/**
 * Serializes the project to the small YAML subset described in the README.
 *
 * Strings are written as JSON strings, which are also valid YAML
 * double-quoted scalars. That keeps Windows paths and special characters safe
 * without introducing a YAML dependency.
 */
export function serializeProject(project: Project): string {
  const lines = ["version: 1", `name: ${quote(project.name)}`];

  if (project.roots.length === 0) {
    lines.push("roots: []");
  } else {
    lines.push("roots:");

    for (const root of project.roots) {
      lines.push(`  - path: ${quote(root.path)}`);
      lines.push(`    type: ${root.type}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Parses the project YAML written by `serializeProject`.
 *
 * The parser intentionally supports only the project schema. Unsupported keys
 * are reported instead of being silently ignored so a malformed project does
 * not open with missing roots.
 */
export function parseProjectFile(source: string): ProjectFileData {
  let version: number | null = null;
  let name = DEFAULT_PROJECT_NAME;
  let roots: ProjectFileRoot[] = [];
  let inRoots = false;
  let currentRoot: ProjectFileRoot | null = null;

  for (const rawLine of source.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = rawLine.length - rawLine.trimStart().length;

    if (inRoots && trimmed.startsWith("-")) {
      const rest = trimmed.slice(1).trim();
      currentRoot = { path: "", type: "folder" };
      roots.push(currentRoot);

      if (rest) {
        const { key, value } = splitKeyValue(rest);
        if (key === "path") {
          currentRoot.path = parseScalar(value);
        } else if (key === "type") {
          currentRoot.type = parseRootType(parseScalar(value));
        } else {
          throw new Error(`Unsupported project root field "${key}".`);
        }
      }

      continue;
    }

    if (inRoots && currentRoot && indent > 0) {
      const { key, value } = splitKeyValue(trimmed);

      if (key === "path") {
        currentRoot.path = parseScalar(value);
      } else if (key === "type") {
        currentRoot.type = parseRootType(parseScalar(value));
      } else {
        throw new Error(`Unsupported project root field "${key}".`);
      }

      continue;
    }

    const { key, value } = splitKeyValue(trimmed);

    if (key === "version") {
      version = Number.parseInt(parseScalar(value), 10);
      inRoots = false;
      currentRoot = null;
    } else if (key === "name") {
      name = parseScalar(value) || DEFAULT_PROJECT_NAME;
      inRoots = false;
      currentRoot = null;
    } else if (key === "roots") {
      const rootsValue = parseScalar(value);

      if (rootsValue && rootsValue !== "[]") {
        throw new Error(
          "Project roots must use block list syntax (for example, \"roots:\").",
        );
      }

      roots = [];
      inRoots = rootsValue !== "[]";
      currentRoot = null;
    } else {
      throw new Error(`Unsupported project field "${key}".`);
    }
  }

  if (version === null) {
    throw new Error("Project file is missing a version.");
  }

  if (version !== 1) {
    throw new Error(`Unsupported project version: ${version}.`);
  }

  for (const root of roots) {
    if (!root.path) {
      throw new Error("A project root is missing its path.");
    }
  }

  return { version: 1, name, roots };
}

function quote(value: string): string {
  return JSON.stringify(value) ?? '""';
}

function splitKeyValue(line: string): { key: string; value: string } {
  const separator = line.indexOf(":");
  if (separator < 0) {
    throw new Error(`Invalid project line: "${line}".`);
  }

  return {
    key: line.slice(0, separator).trim(),
    value: line.slice(separator + 1).trim(),
  };
}

function parseRootType(value: string): ProjectRootType {
  const normalized = value.toLowerCase();

  if (normalized === "folder" || normalized === "file") {
    return normalized;
  }

  throw new Error(`Unsupported project root type: "${value}".`);
}

function parseScalar(rawValue: string): string {
  const value = stripInlineComment(rawValue).trim();

  if (value.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed !== "string") throw new Error();
      return parsed;
    } catch {
      throw new Error(`Invalid quoted project value: ${value}`);
    }
  }

  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) {
      throw new Error(`Invalid quoted project value: ${value}`);
    }

    return value.slice(1, -1).replace(/''/g, "'");
  }

  return value;
}

function stripInlineComment(rawValue: string): string {
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let escaped = false;

  for (let index = 0; index < rawValue.length; index += 1) {
    const character = rawValue[index];

    if (inDoubleQuote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inSingleQuote) {
      if (character === "'") {
        if (rawValue[index + 1] === "'") {
          index += 1;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    if (character === '"') {
      inDoubleQuote = true;
    } else if (character === "'") {
      inSingleQuote = true;
    } else if (
      character === "#" &&
      (index === 0 || /\s/.test(rawValue[index - 1]))
    ) {
      return rawValue.slice(0, index);
    }
  }

  return rawValue;
}
