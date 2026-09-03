/**
 * vault-visibility.ts — the ONE predicate for "this node may be shown".
 *
 * Two readers had it and one did not. The graph (routes/v1/vault.ts) and the
 * Files list (routes/admin/files.ts) hid a file-backed document whose
 * locations are all absent; the MCP search (mcp/vault-lookup.ts) filtered
 * `status <> 'archived'` only. So on 2026-09-03, after the file scanner
 * retired a private root and /reconcile flipped all 43 of its locations
 * absent, `porter_search_vault` still returned its 36 documents (Moe's own
 * distribution memos and subscription packages) as live knowledge. Same
 * lesson as 2026-07-14: archiving that a reader ignores is bookkeeping.
 *
 * Hidden ⇔ status archived, OR it is a document that HAS location rows and
 * every one of them is absent. A database-backed document has no location
 * rows at all and stays visible; the tombstone fires on "this file is gone",
 * never on "this was never a file".
 *
 * `alias` is the vault_nodes alias in the caller's query.
 */
export function visibleNodeSql(alias = 'n'): string {
  return `${alias}.status <> 'archived'
    AND (${alias}.type <> 'document'
      OR NOT EXISTS (SELECT 1 FROM vault_artifact_locations val
                      WHERE val.app_scope = ${alias}.app_scope AND val.document_node_id = ${alias}.id)
      OR EXISTS (SELECT 1 FROM vault_artifact_locations val
                  WHERE val.app_scope = ${alias}.app_scope AND val.document_node_id = ${alias}.id AND val.present = true))`;
}
