-- 2026-07-13 — PHOENIX OUT OF THE KNOWLEDGE GRAPH.
--
-- Moe: "phoenix needs to be completely out of the knowledge graph for now. phoenix is an
-- experiment which we have launched and paused because it's not really working and needs a
-- total revamp later when we're ready."
--
-- WHY: the vault review queue read 4,900 when Moe had nowhere near that many documents. It was
-- inflated by Phoenix CRM rows pushed into a KNOWLEDGE graph:
--     1,702 outreach_target  (cold-outreach PROSPECT COMPANIES, phoenix_v3_outreach_drafts)
--         5 mandate          (phoenix_v3_mandates)
--        32 concept "Thesis:*" (per-prospect scoring hypotheses masquerading as durable concepts)
--         1 domain "Outreach"
-- That breaks the standing rule (memory != database: structured entity/contact/deal data lives
-- in the admin DB, never in memory), and 1,702 cold prospects wired into a second brain is
-- exactly what produced the "weird associations" Moe saw in the graph.
--
-- ARCHIVE, NEVER DELETE. Phoenix will be revamped; these rows stay restorable by flipping
-- status back to 'active'. The Phoenix DATA itself is untouched in ymc_capital (phoenix_v3_*).
-- The Phoenix ENGINEERING DOCS (topic:phoenix learnings) are deliberately KEPT — our own design
-- knowledge is knowledge; a CRM row is not.

CREATE TEMP TABLE phoenix_nodes AS
SELECT id FROM vault_nodes
 WHERE app_scope = 'ymc'
   AND ( type IN ('outreach_target', 'mandate')
      OR (type = 'domain'  AND title = 'Outreach')
      OR (type = 'concept' AND title LIKE 'Thesis:%') );

-- The one real enquiry lived under the Outreach domain. Re-parent it to Deals so it does not
-- get orphaned when Outreach leaves.
UPDATE vault_placements p
   SET parent_id = (SELECT id FROM vault_nodes WHERE app_scope='ymc' AND type='domain' AND title='Deals' LIMIT 1)
  FROM vault_nodes n
 WHERE p.node_id = n.id
   AND p.app_scope = 'ymc'
   AND n.type = 'enquiry'
   AND p.parent_id IN (SELECT id FROM phoenix_nodes);

-- Edges touching Phoenix nodes go too (both endpoints are leaving).
DELETE FROM vault_edges
 WHERE app_scope = 'ymc'
   AND (from_node_id IN (SELECT id FROM phoenix_nodes) OR to_node_id IN (SELECT id FROM phoenix_nodes));

UPDATE vault_placements SET state = 'archived'
 WHERE app_scope = 'ymc' AND node_id IN (SELECT id FROM phoenix_nodes);

UPDATE vault_nodes SET status = 'archived'
 WHERE id IN (SELECT id FROM phoenix_nodes);
