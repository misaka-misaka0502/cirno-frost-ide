export function filePathToUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const leadingSlash = normalized.startsWith("/") ? "" : "/";
  return encodeURI(`file://${leadingSlash}${normalized}`)
    .replace(/#/g, "%23")
    .replace(/\?/g, "%3F");
}

export function uriToFilePath(uri: string): string {
  const url = new URL(uri);
  let pathname = decodeURIComponent(url.pathname);
  if (/^\/[A-Za-z]:/.test(pathname)) {
    pathname = pathname.slice(1);
  }
  return pathname.replace(/\//g, "\\");
}

export function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() || normalized;
}

export function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const directory = normalized.slice(0, normalized.lastIndexOf("/"));
  return directory.replace(/\//g, "\\") || filePath;
}

export function relativePath(rootPath: string, filePath: string): string {
  const root = rootPath.replace(/\\/g, "/").replace(/\/$/, "");
  const file = filePath.replace(/\\/g, "/");
  return file.startsWith(`${root}/`) ? file.slice(root.length + 1) : basename(file);
}

export function languageForPath(filePath: string): string {
  const extension = basename(filePath).split(".").pop()?.toLowerCase();
  switch (extension) {
    case "py":
    case "pyw":
      return "python";
    case "json":
      return "json";
    case "md":
      return "markdown";
    case "html":
      return "html";
    case "css":
      return "css";
    case "js":
    case "mjs":
    case "cjs":
      return "javascript";
    case "ts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "yaml":
    case "yml":
      return "yaml";
    case "toml":
      return "ini";
    default:
      return "plaintext";
  }
}

