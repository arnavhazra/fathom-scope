import type { ErrorMutation, ExportKind, ExportRow, GuardReport } from "@/lib/types";

type TokenKind = "ident" | "keyword" | "punct" | "lit";

interface Token {
  kind: TokenKind;
  value: string;
  depth: number;
}

interface Mode {
  type: "code" | "tpl";
  closeDepth: number | null;
}

export type ErrorBehavior =
  | "rethrow"
  | "wrap-and-throw"
  | "log-and-return"
  | "log-and-continue"
  | "return-fallback"
  | "swallow"
  | "empty";

export interface PublicExport {
  kind: ExportKind;
  name: string;
}

export interface ErrorSite {
  key: string;
  enclosing: string;
  index: number;
  binding: string | null;
  behavior: ErrorBehavior;
}

const KEYWORDS = new Set([
  "export",
  "function",
  "async",
  "const",
  "let",
  "var",
  "type",
  "interface",
  "class",
  "enum",
  "try",
  "catch",
  "finally",
  "throw",
  "return",
  "new",
  "default",
  "from",
  "as",
  "if",
  "else",
  "await",
  "extends",
]);

const PROPAGATING = new Set<ErrorBehavior>(["rethrow", "wrap-and-throw"]);

function readString(source: string, start: number): number {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    if (ch === "\n") return i;
    i += 1;
  }
  return i;
}

function readRegex(source: string, start: number): number {
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "/" || ch === "\n") {
      i += ch === "/" ? 1 : 0;
      while (i < source.length && /[a-z]/i.test(source[i] ?? "")) i += 1;
      return i;
    }
    if (ch === "[") {
      i += 1;
      while (i < source.length && source[i] !== "]" && source[i] !== "\n") {
        if (source[i] === "\\") i += 2;
        else i += 1;
      }
      continue;
    }
    i += 1;
  }
  return i;
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const modes: Mode[] = [{ type: "code", closeDepth: null }];
  let i = 0;
  let depth = 0;

  const push = (kind: TokenKind, value: string) => {
    tokens.push({ kind, value, depth });
  };

  while (i < source.length) {
    const mode = modes[modes.length - 1];
    if (!mode) break;

    if (mode.type === "tpl") {
      const ch = source[i] ?? "";
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "`") {
        modes.pop();
        i += 1;
        push("lit", "tpl");
        continue;
      }
      if (ch === "$" && source[i + 1] === "{") {
        push("punct", "{");
        depth += 1;
        modes.push({ type: "code", closeDepth: depth - 1 });
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    const ch = source[i] ?? "";
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      i += 2;
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i = Math.min(source.length, i + 2);
      continue;
    }
    if (ch === "'" || ch === '"') {
      i = readString(source, i);
      push("lit", "str");
      continue;
    }
    if (ch === "`") {
      modes.push({ type: "tpl", closeDepth: null });
      i += 1;
      continue;
    }

    const last = tokens[tokens.length - 1];
    const regexOk =
      !last ||
      (last.kind !== "ident" &&
        last.kind !== "lit" &&
        last.value !== ")" &&
        last.value !== "]");
    if (ch === "/" && source[i + 1] !== "/" && source[i + 1] !== "*" && regexOk) {
      i = readRegex(source, i);
      push("lit", "regex");
      continue;
    }

    if (ch === "{") {
      push("punct", "{");
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}") {
      depth = Math.max(0, depth - 1);
      push("punct", "}");
      i += 1;
      if (mode.closeDepth !== null && depth === mode.closeDepth && modes.length > 1) {
        modes.pop();
      }
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < source.length && /[A-Za-z0-9_$]/.test(source[j] ?? "")) j += 1;
      const word = source.slice(i, j);
      push(KEYWORDS.has(word) ? "keyword" : "ident", word);
      i = j;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < source.length && /[0-9._]/.test(source[j] ?? "")) j += 1;
      push("lit", "num");
      i = j;
      continue;
    }

    const three = source.slice(i, i + 3);
    const two = source.slice(i, i + 2);
    if (three === "===" || three === "!==" || three === "...") {
      push("punct", three);
      i += 3;
      continue;
    }
    if (["=>", ">=", "<=", "==", "!=", "&&", "||", "?.", "??"].includes(two)) {
      push("punct", two);
      i += 2;
      continue;
    }
    push("punct", ch);
    i += 1;
  }

  return tokens;
}

function skipBalanced(tokens: Token[], index: number, open: string, close: string): number {
  const first = tokens[index];
  if (!first || first.value !== open) return index;
  let depth = 0;
  for (let i = index; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) break;
    if (token.value === open) depth += 1;
    else if (token.value === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return tokens.length;
}

function findBody(tokens: Token[], start: number): number {
  let k = start;
  if (tokens[k]?.value === "<") k = skipBalanced(tokens, k, "<", ">");
  if (tokens[k]?.value === "(") k = skipBalanced(tokens, k, "(", ")");
  if (tokens[k]?.value === ":") {
    k += 1;
    let angle = 0;
    let paren = 0;
    let bracket = 0;
    while (k < tokens.length) {
      const value = tokens[k]?.value;
      if (value === "<") angle += 1;
      else if (value === ">") angle = Math.max(0, angle - 1);
      else if (value === "(") paren += 1;
      else if (value === ")") paren = Math.max(0, paren - 1);
      else if (value === "[") bracket += 1;
      else if (value === "]") bracket = Math.max(0, bracket - 1);
      else if (value === "{" && angle === 0 && paren === 0 && bracket === 0) {
        const end = skipBalanced(tokens, k, "{", "}");
        if (tokens[end]?.value === "{") {
          k = end;
          continue;
        }
        return k;
      } else if (value === "=>" && angle === 0 && paren === 0 && bracket === 0) {
        return tokens[k + 1]?.value === "{" ? k + 1 : -1;
      }
      k += 1;
    }
    return -1;
  }
  if (tokens[k]?.value === "{") return k;
  if (tokens[k]?.value === "=>" && tokens[k + 1]?.value === "{") return k + 1;
  return -1;
}

function nextSignificant(tokens: Token[], start: number): Token | undefined {
  for (let i = start; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token || token.kind === "punct") continue;
    return token;
  }
  return undefined;
}

function classify(body: Token[]): ErrorBehavior {
  let hasThrow = false;
  let wrapped = false;
  let hasReturn = false;
  let hasConsole = false;
  let hasWord = false;

  for (let i = 0; i < body.length; i += 1) {
    const token = body[i];
    if (!token) continue;
    if (token.kind === "ident" || token.kind === "keyword") hasWord = true;
    if (token.value === "throw") {
      hasThrow = true;
      if (nextSignificant(body, i + 1)?.value === "new") wrapped = true;
    } else if (token.value === "return") {
      hasReturn = true;
    } else if (
      token.value === "console" &&
      body[i + 1]?.value === "." &&
      ["error", "log", "warn", "info", "debug"].includes(body[i + 2]?.value ?? "")
    ) {
      hasConsole = true;
    }
  }

  if (!hasThrow && !hasReturn && !hasConsole && !hasWord) return "empty";
  if (hasThrow && wrapped) return "wrap-and-throw";
  if (hasThrow) return "rethrow";
  if (hasConsole && hasReturn) return "log-and-return";
  if (hasConsole) return "log-and-continue";
  if (hasReturn) return "return-fallback";
  return "swallow";
}

function describe(site: ErrorSite | undefined): string {
  if (!site) return "removed";
  const binding = site.binding ? `catch (${site.binding})` : "catch";
  return `${site.behavior} · ${binding}`;
}

function walkBlock(
  tokens: Token[],
  openIndex: number,
  enclosing: string,
  sites: ErrorSite[],
  counter: { n: number },
): number {
  let i = openIndex + 1;
  let depth = 1;
  while (i < tokens.length && depth > 0) {
    const token = tokens[i];
    if (!token) break;
    if (token.value === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (token.value === "}") {
      depth -= 1;
      i += 1;
      if (depth === 0) return i;
      continue;
    }
    if (token.value === "function") {
      const next = consumeFunction(tokens, i, sites);
      i = next > i ? next : i + 1;
      continue;
    }
    if (token.value === "const" || token.value === "let") {
      const arrowEnd = tryConsumeArrow(tokens, i, sites);
      if (arrowEnd !== null) {
        i = arrowEnd > i ? arrowEnd : i + 1;
        continue;
      }
    }
    if (token.value === "try") {
      const next = consumeTry(tokens, i, enclosing, sites, counter);
      i = next > i ? next : i + 1;
      continue;
    }
    i += 1;
  }
  return i;
}

function consumeTry(
  tokens: Token[],
  index: number,
  enclosing: string,
  sites: ErrorSite[],
  counter: { n: number },
): number {
  const siteIndex = counter.n;
  counter.n += 1;
  const open = tokens[index + 1];
  if (!open || open.value !== "{") return index + 1;
  let cursor = walkBlock(tokens, index + 1, enclosing, sites, counter);
  let binding: string | null = null;
  if (tokens[cursor]?.value === "catch") {
    cursor += 1;
    if (tokens[cursor]?.value === "(") {
      const name = tokens[cursor + 1];
      if (name && (name.kind === "ident" || name.kind === "keyword")) binding = name.value;
      cursor = skipBalanced(tokens, cursor, "(", ")");
    }
    if (tokens[cursor]?.value === "{") {
      const end = skipBalanced(tokens, cursor, "{", "}");
      const body = tokens.slice(cursor + 1, Math.max(cursor + 1, end - 1));
      sites.push({
        key: `${enclosing}#${siteIndex}`,
        enclosing,
        index: siteIndex,
        binding,
        behavior: classify(body),
      });
      walkBlock(tokens, cursor, enclosing, sites, counter);
      cursor = end;
    }
  }
  if (tokens[cursor]?.value === "finally" && tokens[cursor + 1]?.value === "{") {
    cursor = walkBlock(tokens, cursor + 1, enclosing, sites, counter);
  }
  return cursor;
}

function consumeFunction(tokens: Token[], index: number, sites: ErrorSite[], nameOverride?: string): number {
  let k = index + 1;
  let name = nameOverride ?? "";
  const next = tokens[k];
  if (
    !name &&
    next &&
    next.value !== "(" &&
    next.value !== "<" &&
    (next.kind === "ident" || next.kind === "keyword")
  ) {
    name = next.value;
    k += 1;
  }
  if (!name) name = `anonymous@${index}`;
  const bodyAt = findBody(tokens, k);
  if (bodyAt < 0 || tokens[bodyAt]?.value !== "{") return index + 1;
  return walkBlock(tokens, bodyAt, name, sites, { n: 0 });
}

function tryConsumeArrow(tokens: Token[], index: number, sites: ErrorSite[]): number | null {
  const name = tokens[index + 1];
  if (!name || (name.kind !== "ident" && name.kind !== "keyword")) return null;
  const startDepth = tokens[index]?.depth ?? 0;
  let k = index + 2;
  let arrow = -1;
  while (k < tokens.length) {
    const token = tokens[k];
    if (!token || token.depth < startDepth) break;
    if (token.depth === startDepth && token.value === ";") break;
    if (token.depth === startDepth && token.value === "=>") {
      arrow = k;
      break;
    }
    if (token.depth === startDepth && token.value === "{") {
      k = skipBalanced(tokens, k, "{", "}");
      continue;
    }
    if (token.depth === startDepth) k += 1;
    else k += 1;
  }
  if (arrow < 0) return null;
  if (tokens[arrow + 1]?.value !== "{") {
    let end = arrow + 1;
    while (end < tokens.length) {
      const token = tokens[end];
      if (!token || (token.depth === startDepth && token.value === ";")) return end + 1;
      if (token.depth < startDepth) return end;
      end += 1;
    }
    return end;
  }
  return walkBlock(tokens, arrow + 1, name.value, sites, { n: 0 });
}

export function extractErrorSites(tokens: Token[]): ErrorSite[] {
  const sites: ErrorSite[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;
    if (token.depth !== 0) {
      i += 1;
      continue;
    }
    if (token.value === "function") {
      const next = consumeFunction(tokens, i, sites);
      i = next > i ? next : i + 1;
      continue;
    }
    if (token.value === "const" || token.value === "let") {
      const arrowEnd = tryConsumeArrow(tokens, i, sites);
      if (arrowEnd !== null) {
        i = arrowEnd > i ? arrowEnd : i + 1;
        continue;
      }
    }
    i += 1;
  }
  return sites;
}

function addUnique(exports: PublicExport[], seen: Set<string>, kind: ExportKind, name: string) {
  if (!name || name === "{") return;
  const key = `${kind}:${name}`;
  if (seen.has(key)) return;
  seen.add(key);
  exports.push({ kind, name });
}

function addSpecifiers(
  tokens: Token[],
  braceIndex: number,
  forced: ExportKind | null,
  decls: Map<string, ExportKind>,
  exports: PublicExport[],
  seen: Set<string>,
) {
  let k = braceIndex + 1;
  while (k < tokens.length && tokens[k]?.value !== "}") {
    const token = tokens[k];
    if (!token) break;
    if (token.value === ",") {
      k += 1;
      continue;
    }
    if (token.kind === "ident" || token.kind === "keyword") {
      let local = token.value;
      let exported = local;
      let kind = forced;
      if (token.value === "type" && tokens[k + 1] && tokens[k + 1]?.value !== "as" && tokens[k + 1]?.value !== ",") {
        local = tokens[k + 1]?.value ?? local;
        exported = local;
        kind = "type";
        k += 1;
      }
      if (tokens[k + 1]?.value === "as" && tokens[k + 2]) {
        exported = tokens[k + 2]?.value ?? exported;
        k += 3;
      } else {
        k += 1;
      }
      addUnique(exports, seen, kind ?? decls.get(local) ?? "const", exported);
      continue;
    }
    k += 1;
  }
}

export function extractExports(tokens: Token[]): PublicExport[] {
  const decls = new Map<string, ExportKind>();
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token || token.depth !== 0) continue;
    const name = tokens[i + 1];
    if (!name) continue;
    if (token.value === "function" && (name.kind === "ident" || name.kind === "keyword")) {
      decls.set(name.value, "function");
    } else if ((token.value === "const" || token.value === "let" || token.value === "var") && name.kind !== "punct") {
      decls.set(name.value, "const");
    } else if (token.value === "class" && name.kind !== "punct") decls.set(name.value, "class");
    else if (token.value === "interface" && name.kind !== "punct") decls.set(name.value, "interface");
    else if (token.value === "enum" && name.kind !== "punct") decls.set(name.value, "enum");
    else if (token.value === "type" && name.value !== "{" && name.kind !== "punct") decls.set(name.value, "type");
  }

  const exports: PublicExport[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token || token.value !== "export" || token.depth !== 0) continue;
    let k = i + 1;
    if (tokens[k]?.value === "default") {
      k += 1;
      if (tokens[k]?.value === "function") addUnique(exports, seen, "function", tokens[k + 1]?.kind === "ident" ? tokens[k + 1]!.value : "default");
      else if (tokens[k]?.value === "class") addUnique(exports, seen, "class", tokens[k + 1]?.kind === "ident" ? tokens[k + 1]!.value : "default");
      else addUnique(exports, seen, "const", "default");
      continue;
    }
    if (tokens[k]?.value === "async") k += 1;
    const keyword = tokens[k]?.value;
    if (keyword === "function") addUnique(exports, seen, "function", tokens[k + 1]?.value ?? "");
    else if (keyword === "const" || keyword === "let" || keyword === "var") addUnique(exports, seen, "const", tokens[k + 1]?.value ?? "");
    else if (keyword === "class") addUnique(exports, seen, "class", tokens[k + 1]?.value ?? "");
    else if (keyword === "interface") addUnique(exports, seen, "interface", tokens[k + 1]?.value ?? "");
    else if (keyword === "enum") addUnique(exports, seen, "enum", tokens[k + 1]?.value ?? "");
    else if (keyword === "type" && tokens[k + 1]?.value === "{") addSpecifiers(tokens, k + 1, "type", decls, exports, seen);
    else if (keyword === "type") addUnique(exports, seen, "type", tokens[k + 1]?.value ?? "");
    else if (keyword === "{") addSpecifiers(tokens, k, null, decls, exports, seen);
  }
  return exports;
}

function exportKey(item: PublicExport): string {
  return `${item.kind}:${item.name}`;
}

export function diffContract(mainSource: string, branchSource: string): GuardReport {
  const mainTokens = tokenize(mainSource);
  const branchTokens = tokenize(branchSource);
  const mainExports = extractExports(mainTokens);
  const branchExports = extractExports(branchTokens);
  const mainSites = extractErrorSites(mainTokens);
  const branchSites = extractErrorSites(branchTokens);

  const branchExportKeys = new Set(branchExports.map(exportKey));
  const mainExportKeys = new Set(mainExports.map(exportKey));
  const rows: ExportRow[] = [];

  for (const item of mainExports) {
    rows.push({
      name: item.name,
      kind: item.kind,
      status: branchExportKeys.has(exportKey(item)) ? "preserved" : "removed",
    });
  }
  for (const item of branchExports) {
    if (!mainExportKeys.has(exportKey(item))) {
      rows.push({ name: item.name, kind: item.kind, status: "added" });
    }
  }
  const rank = { removed: 0, preserved: 1, added: 2 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));

  const mainMap = new Map<string, ErrorSite>();
  const branchMap = new Map<string, ErrorSite>();
  for (const site of mainSites) if (!mainMap.has(site.key)) mainMap.set(site.key, site);
  for (const site of branchSites) if (!branchMap.has(site.key)) branchMap.set(site.key, site);

  const errorMutations: ErrorMutation[] = [];
  for (const [key, site] of mainMap) {
    const after = branchMap.get(key);
    if (!after || after.behavior !== site.behavior || after.binding !== site.binding) {
      errorMutations.push({
        key,
        enclosing: site.enclosing,
        before: describe(site),
        after: describe(after),
      });
    }
  }
  for (const [key, site] of branchMap) {
    if (!mainMap.has(key) && !PROPAGATING.has(site.behavior)) {
      errorMutations.push({
        key,
        enclosing: site.enclosing,
        before: "absent",
        after: describe(site),
      });
    }
  }
  errorMutations.sort((a, b) => a.key.localeCompare(b.key));

  const publicExportsRemoved = rows.filter((row) => row.status === "removed").length;
  const publicExportsAdded = rows.filter((row) => row.status === "added").length;
  const publicExportsPreserved = rows.filter((row) => row.status === "preserved").length;
  const errorHandlingSignaturesMutated = errorMutations.length;
  const decision = publicExportsRemoved > 0 || errorHandlingSignaturesMutated > 0 ? "BLOCKED" : "APPROVED";

  const headline =
    decision === "BLOCKED"
      ? `ExportGuard blocks the PR. ${publicExportsRemoved} public export${publicExportsRemoved === 1 ? "" : "s"} removed. ${errorHandlingSignaturesMutated} error-handling signature${errorHandlingSignaturesMutated === 1 ? "" : "s"} mutated.`
      : "ExportGuard approves the PR. Public exports are intact and catch-site propagation matches main.";

  return {
    decision,
    headline,
    publicExportsRemoved,
    errorHandlingSignaturesMutated,
    publicExportsAdded,
    publicExportsPreserved,
    exports: rows,
    errorMutations,
    mainExportCount: mainExports.length,
    branchExportCount: branchExports.length,
    mainCatchCount: mainSites.length,
    branchCatchCount: branchSites.length,
  };
}
