import { basename } from "./lib/utils";

export type ProjectRootType = "file" | "folder";

export interface ProjectRoot {
  id: string;
  path: string;
  type: ProjectRootType;
}

export interface Project {
  version: 1;
  name: string;
  roots: ProjectRoot[];
}

export type ViewMode = "edit" | "split" | "preview";

export type DocumentKind =
  | "markdown"
  | "text"
  | "code"
  | "image"
  | "likec4"
  | "unsupported";

export interface ImagePreviewData {
  mimeType: string;
  dataUrl: string;
  width?: number;
  height?: number;
}

export interface OpenDocument {
  id: string;
  path: string | null;
  name: string;
  kind: DocumentKind;
  language: string | null;
  image: ImagePreviewData | null;
  content: string;
  savedContent: string;
  size: number;
  modifiedMs: number | null;
  detached?: boolean;
}

export type OpenDocumentInput = Omit<OpenDocument, "id">;

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);

const TEXT_EXTENSIONS = new Set([
  "txt",
  "log",
  "csv",
  "tsv",
  "lock",
]);

const IMAGE_MIME_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
]);

const LIKE_C4_EXTENSIONS = new Set(["c4", "likec4"]);

const LANGUAGE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ["js", "JavaScript"],
  ["jsx", "JavaScript"],
  ["mjs", "JavaScript"],
  ["cjs", "JavaScript"],
  ["ts", "TypeScript"],
  ["tsx", "TypeScript"],
  ["mts", "TypeScript"],
  ["cts", "TypeScript"],
  ["rs", "Rust"],
  ["go", "Go"],
  ["php", "PHP"],
  ["sql", "SQL"],
  ["py", "Python"],
  ["pyi", "Python"],
  ["pyw", "Python"],
  ["java", "Java"],
  ["c", "C"],
  ["h", "C"],
  ["cpp", "C++"],
  ["cc", "C++"],
  ["cxx", "C++"],
  ["c++", "C++"],
  ["hpp", "C++"],
  ["hh", "C++"],
  ["hxx", "C++"],
  ["h++", "C++"],
  ["cs", "C#"],
  ["css", "CSS"],
  ["scss", "SCSS"],
  ["sass", "Sass"],
  ["less", "Less"],
  ["html", "HTML"],
  ["htm", "HTML"],
  ["xml", "XML"],
  ["svg", "SVG"],
  ["json", "JSON"],
  ["jsonc", "JSON with Comments"],
  ["json5", "JSON5"],
  ["yaml", "YAML"],
  ["yml", "YAML"],
  ["toml", "TOML"],
  ["ini", "INI"],
  ["cfg", "INI"],
  ["conf", "Config"],
  ["properties", "Properties"],
  ["sh", "Shell"],
  ["bash", "Shell"],
  ["zsh", "Shell"],
  ["fish", "Fish"],
  ["ps1", "PowerShell"],
  ["psm1", "PowerShell"],
  ["bat", "Batch"],
  ["cmd", "Batch"],
  ["rb", "Ruby"],
  ["rake", "Ruby"],
  ["kt", "Kotlin"],
  ["kts", "Kotlin"],
  ["swift", "Swift"],
  ["lua", "Lua"],
  ["dart", "Dart"],
  ["vue", "Vue"],
  ["svelte", "Svelte"],
  ["env", "Dotenv"],
  ["gitignore", "Git Config"],
  ["gitattributes", "Git Config"],
  ["dockerignore", "Docker Ignore"],
  ["editorconfig", "EditorConfig"],
  ["graphql", "GraphQL"],
  ["gql", "GraphQL"],
  ["proto", "Protocol Buffers"],
  ["tf", "HCL"],
  ["tfvars", "HCL"],
  ["hcl", "HCL"],
  ["gradle", "Gradle"],
  ["groovy", "Groovy"],
  ["scala", "Scala"],
  ["sc", "Scala"],
  ["r", "R"],
  ["pl", "Perl"],
  ["pm", "Perl"],
  ["ex", "Elixir"],
  ["exs", "Elixir"],
  ["erl", "Erlang"],
  ["hrl", "Erlang"],
  ["hs", "Haskell"],
  ["lhs", "Haskell"],
  ["clj", "Clojure"],
  ["cljs", "Clojure"],
  ["cljc", "Clojure"],
  ["zig", "Zig"],
  ["nim", "Nim"],
  ["asm", "Assembly"],
  ["s", "Assembly"],
  ["coffee", "CoffeeScript"],
  ["elm", "Elm"],
  ["fs", "F#"],
  ["fsi", "F#"],
  ["fsx", "F#"],
  ["jl", "Julia"],
  ["tex", "LaTeX"],
  ["sol", "Solidity"],
  ["v", "Verilog"],
  ["vhdl", "VHDL"],
  ["vhd", "VHDL"],
  ["wat", "WebAssembly"],
]);

const CODE_EXTENSIONS = new Set(LANGUAGE_BY_EXTENSION.keys());

/**
 * Extension lists used by the native Save As dialog. Keep these derived from
 * the classification maps so the dialog can never drift from the editor.
 */
export const MARKDOWN_FILE_EXTENSIONS: readonly string[] = [
  ...MARKDOWN_EXTENSIONS,
];

export const TEXT_FILE_EXTENSIONS: readonly string[] = [...TEXT_EXTENSIONS];

export const CODE_FILE_EXTENSIONS: readonly string[] = [
  ...CODE_EXTENSIONS,
].sort();

const LANGUAGE_BY_FILENAME: ReadonlyMap<string, string> = new Map([
  ["dockerfile", "Dockerfile"],
  [".dockerfile", "Dockerfile"],
  ["makefile", "Makefile"],
  [".makefile", "Makefile"],
  ["gnumakefile", "Makefile"],
  ["cmakelists.txt", "CMake"],
  ["gemfile", "Ruby"],
  ["rakefile", "Ruby"],
  ["procfile", "Procfile"],
  ["jenkinsfile", "Jenkinsfile"],
  ["vagrantfile", "Ruby"],
  ["brewfile", "Ruby"],
  ["justfile", "Just"],
  ["taskfile", "Taskfile"],
  [".env", "Dotenv"],
  [".gitignore", "Git Config"],
  [".gitattributes", "Git Config"],
  [".gitmodules", "Git Config"],
  [".dockerignore", "Docker Ignore"],
  [".editorconfig", "EditorConfig"],
  [".npmrc", "npm Config"],
  [".nvmrc", "Node Version"],
  [".prettierrc", "JSON"],
  [".eslintrc", "JSON"],
  [".babelrc", "JSON"],
]);

function fileName(path: string): string {
  return basename(path).toLowerCase();
}

function extensionOf(path: string): string {
  const name = fileName(path);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1);
}

export function isMarkdownFile(path: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extensionOf(path));
}

export function isTextFile(path: string): boolean {
  return TEXT_EXTENSIONS.has(extensionOf(path));
}

export function isImageFile(path: string): boolean {
  return IMAGE_MIME_BY_EXTENSION.has(extensionOf(path));
}

export function isLikeC4File(path: string): boolean {
  return LIKE_C4_EXTENSIONS.has(extensionOf(path));
}

export function isCodeFile(path: string): boolean {
  const name = fileName(path);
  if (LANGUAGE_BY_FILENAME.has(name)) return true;
  if (name.startsWith(".env.")) return true;
  if (name.startsWith("dockerfile.") || name.startsWith("makefile.")) {
    return true;
  }
  return CODE_EXTENSIONS.has(extensionOf(path));
}

export function imageMimeForPath(path: string): string | null {
  return IMAGE_MIME_BY_EXTENSION.get(extensionOf(path)) ?? null;
}

export function codeLanguageForPath(path: string): string {
  const name = fileName(path);
  const byName = LANGUAGE_BY_FILENAME.get(name);
  if (byName !== undefined) return byName;
  if (name.startsWith(".env.")) return "Dotenv";
  if (name.startsWith("dockerfile.")) return "Dockerfile";
  if (name.startsWith("makefile.")) return "Makefile";
  return LANGUAGE_BY_EXTENSION.get(extensionOf(path)) ?? "Plain Text";
}

export function documentKindForPath(path: string): DocumentKind {
  if (isMarkdownFile(path)) return "markdown";
  if (isLikeC4File(path)) return "likec4";
  if (isImageFile(path)) return "image";
  if (isCodeFile(path)) return "code";
  if (isTextFile(path)) return "text";
  return "unsupported";
}

export function documentLanguageForPath(
  path: string,
  kind: DocumentKind,
): string | null {
  return kind === "code" ? codeLanguageForPath(path) : null;
}

export function isEditableKind(kind: DocumentKind): boolean {
  return (
    kind === "markdown" ||
    kind === "text" ||
    kind === "code" ||
    kind === "likec4"
  );
}

export function isDocumentDirty(doc: OpenDocument | null): boolean {
  if (doc === null || doc.kind === "image") return false;

  return (
    (doc.path === null && !doc.detached) || doc.content !== doc.savedContent
  );
}
