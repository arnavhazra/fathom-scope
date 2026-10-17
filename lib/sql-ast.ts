export interface SqlAst {
  tables: string[];
  rls: string[];
  policies: Array<{ name: string; table: string }>;
  missingRls: string[];
  tablesWithoutPolicy: string[];
  pass: boolean;
}

function strip(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

export function analyzeSql(sql: string): SqlAst {
  const source = strip(sql);
  const tables = [...source.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][\w]*)/gi)].map(
    (match) => (match[1] ?? "").toLowerCase(),
  );
  const rls = [
    ...source.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][\w]*)\s+enable\s+row\s+level\s+security/gi,
    ),
  ].map((match) => (match[1] ?? "").toLowerCase());
  const policies = [
    ...source.matchAll(/create\s+policy\s+(?:"([^"]+)"|([a-z_][\w]*))\s+on\s+(?:public\.)?([a-z_][\w]*)/gi),
  ].map((match) => ({
    name: match[1] || match[2] || "policy",
    table: (match[3] ?? "").toLowerCase(),
  }));
  const uniqueTables = [...new Set(tables.filter(Boolean))];
  const rlsSet = new Set(rls);
  const missingRls = uniqueTables.filter((table) => !rlsSet.has(table));
  const tablesWithoutPolicy = uniqueTables.filter((table) => !policies.some((policy) => policy.table === table));
  return {
    tables: uniqueTables,
    rls: [...new Set(rls)],
    policies,
    missingRls,
    tablesWithoutPolicy,
    pass: uniqueTables.length >= 2 && missingRls.length === 0 && tablesWithoutPolicy.length === 0,
  };
}
