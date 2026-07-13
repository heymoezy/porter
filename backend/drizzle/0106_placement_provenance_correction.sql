-- 2026-07-13 — PROVENANCE CORRECTION.
--
-- Every vault placement was stamped proposed_by='ai'. That was FALSE. The association
-- function (resolveProposedParentId) has always been a deterministic stub — one commit has
-- ever touched it, the stub itself — so no classifier has ever run. All 5,176 placements are
-- the calling app's OWN declared hierarchy, passed straight through, and every one has
-- confidence = NULL because nothing ever scored them.
--
-- The mislabel is not cosmetic: it told a reviewer that 4,900 filings were machine guesses
-- needing human judgement when they are the app's own structure. Porter architecture rule 5 —
-- never label an unconfigured feature as active.
--
-- 'ai' is now RESERVED for a real Bridge-backed classifier and cannot be claimed until one
-- exists. Rows are relabelled by who ACTUALLY decided the parent. Labels only: no placement,
-- parent, state or node is altered.
UPDATE vault_placements SET proposed_by = 'app'          WHERE proposed_by = 'ai' AND parent_id IS NOT NULL;
UPDATE vault_placements SET proposed_by = 'default_root' WHERE proposed_by = 'ai' AND parent_id IS NULL;
