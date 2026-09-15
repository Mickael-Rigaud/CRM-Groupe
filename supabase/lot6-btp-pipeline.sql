-- =====================================================================
--  CRM Groupe — lot 6 : nouvelle pipeline BTP Expertise
--  À exécuter dans Supabase > SQL Editor, après lot5-btp.sql.
--  Idempotent : relançable sans risque.
--
--  Les étapes deviennent : Nouveau · RDV 1 · Qualifié · Lettre de mission ·
--  RDV sur place · Rédaction du rapport · RDV complémentaire · Rapport émis.
--
--  Les clés techniques « lead » et « rdv1 » sont conservées telles quelles :
--  ce sont celles qu'écrit la prise de rendez-vous du site btpexpertise.fr
--  (fonction creer_prospect_btp). Rien à changer côté site.
--
--  Une seule étape disparaît, « Mission planifiée » (mission_planifiee).
--  Les affaires qui s'y trouvent passent à « RDV sur place » : c'est le même
--  moment du dossier, la mission est lancée mais la visite n'a pas eu lieu.
-- =====================================================================

-- ÉTAPE 1 — Voir ce qui va bouger (ne modifie rien)
select stage, count(*) as affaires
from public.deals
where activity = 'btp'
group by stage
order by affaires desc;

-- ÉTAPE 2 — Déplacer les affaires de l'étape supprimée
update public.deals
   set stage = 'rdv',
       stage_changed_at = now(),
       updated_at = now()
 where activity = 'btp'
   and stage = 'mission_planifiee';

-- ÉTAPE 3 — Contrôle : plus aucune affaire BTP hors des huit étapes
select stage, count(*) as affaires
from public.deals
where activity = 'btp'
  and stage not in ('lead','rdv1','qualifie','proposition','rdv','mission_realisee','rdv_complementaire','rapport_remis')
group by stage;
