// Formations RGD Renova — les quatre fiches de poste.
//
// REPRIS TEL QUEL DU TABLEAU DE BORD, le 21/09/2026.
// Ce contenu vivait dans `frontend/js/data/btp-referentiel.js` côté Cloudflare,
// exposé par une IIFE sur `window`. Ici c'est un module ES : seul l'emballage
// change, pas un mot du texte.
//
// LE NOM A CHANGÉ, ET C'EST VOULU
// Là-bas le fichier s'appelait `btp-referentiel` pour des raisons d'histoire :
// il portait aussi les normes DTU, parties dans l'espace BTP Expertise le
// 16/09/2026. Ce qui reste n'a rien de BTP Expertise — ce sont les postes de
// RGD Renova. Garder l'ancien nom dans un CRM où BTP Expertise existe vraiment
// aurait fait chercher ces fiches au mauvais endroit.
//
// AUCUNE BASE DERRIÈRE
// Pas de table, pas de relevé, rien à synchroniser : du texte que quelqu'un a
// écrit. Il se modifie ici, dans ce fichier, et nulle part ailleurs.

// Référentiel Formations RGD Renova
// 4 fiches de poste : Conducteur, Chargé d'affaires, Sous-traitance, Assistante.
// Les normes DTU ne sont plus ici : elles sont tenues dans l'espace BTP Expertise du CRM Groupe.

  // ================================================================
  // RUBRIQUE 1 — CONDUCTEUR DE TRAVAUX (5 fiches)
  // ================================================================
  const CONDUCTEUR_TRAVAUX = [
    {
      titre: 'Mission et rôle du conducteur de travaux',
      resume: 'Le chef d\'orchestre opérationnel du chantier. Il transforme un devis signé en chantier réussi.',
      sections: [
        { titre: 'Sa mission', contenu: 'Le conducteur de travaux pilote l\'exécution des chantiers de A à Z. Il est l\'interface entre le client, les équipes terrain, les sous-traitants et la direction. Sa réussite se mesure à la qualité finale, au respect du planning et de la marge.' },
        { titre: 'Pourquoi c\'est un poste clé', contenu: 'C\'est lui qui transforme un beau devis en marge réelle. Un mauvais conducteur = retards, malfaçons, dépassements. Un bon conducteur = clients satisfaits, équipes sereines, rentabilité préservée.' },
        { titre: 'Profil cible', puces: [
          'Expérience terrain BTP (5 ans minimum dans un corps de métier)',
          'Bonne lecture de plans et chiffrage',
          'Sens du commandement et capacité à recadrer',
          'Rigueur administrative (devis modificatifs, comptes-rendus)',
          'Permis B obligatoire, déplacements quotidiens',
        ]},
      ],
    },
    {
      titre: 'Préparation de chantier (avant démarrage)',
      resume: 'Un chantier se gagne ou se perd à la prépa. 80 % des problèmes viennent d\'une prépa bâclée.',
      sections: [
        { titre: 'Checklist 15 jours avant démarrage', puces: [
          'Devis signé + acompte encaissé',
          'Plans définitifs validés par le client',
          'Démarches administratives : DT-DICT, DP, PC selon travaux',
          'Bon de commande matériaux et planning de livraison',
          'Sous-traitants contractés avec docs URSSAF/vigilance/décennale à jour',
          'Visite contradictoire avec le client (état des lieux, accès, points sensibles)',
          'PV de réception des locaux mitoyens si copropriété',
        ]},
        { titre: 'Planning prévisionnel', contenu: 'Établir un planning Gantt avec phases, intervenants et jalons clients. Anticiper les délais d\'approvisionnement (menuiseries 6-8 semaines, granit/marbre 4-6 semaines).' },
        { titre: 'Réunion de lancement équipe', contenu: 'Briefer les équipes 48h avant : objectifs qualité, planning, points de vigilance client, contacts.' },
      ],
    },
    {
      titre: 'Suivi quotidien du chantier',
      resume: 'Le rituel quotidien qui sépare un chantier maîtrisé d\'un chantier qui dérape.',
      sections: [
        { titre: 'Routine matinale (30 min)', puces: [
          'Tour du chantier avant l\'arrivée des équipes',
          'Briefing 5-10 min : objectifs du jour + sécurité',
          'Vérification livraisons attendues et accès',
        ]},
        { titre: 'Routine fin de journée (30 min)', puces: [
          'Tour de chantier : qualité, sécurité, propreté',
          'Photos d\'avancement classées par date',
          'Compte-rendu hebdomadaire client (vendredi)',
          'Anticipation J+1 : matériaux, intervenants',
        ]},
        { titre: 'Points de vigilance permanents', puces: [
          'Sécurité (EPI, balisage, EPC) — risque pénal',
          'Hygiène et propreté → impacte la perception client',
          'Respect des voisins (horaires, bruit, propreté trottoir)',
          'Sauvegarde des éléments à conserver (parquet, cheminée, moulures)',
        ]},
      ],
    },
    {
      titre: 'Gestion humaine équipes et sous-traitants',
      resume: 'Animer une équipe qui livre. Cadrer un ST qui dérive.',
      sections: [
        { titre: 'Avec les équipes internes', puces: [
          'Briefer plutôt qu\'ordonner — expliquer le pourquoi',
          'Reconnaître publiquement les bons gestes',
          'Recadrer en privé, jamais en public',
          'Donner le ton qualité par l\'exemple',
        ]},
        { titre: 'Avec les sous-traitants', puces: [
          'Cahier des charges écrit en amont',
          'Réception intermédiaire avant paiement',
          'Pas de paiement intégral avant réception client',
          'Carnet de bord : si un ST dérive 2 fois → on arrête',
        ]},
        { titre: 'Conflits chantier', contenu: 'Toujours traiter à chaud. Un conflit non réglé entre deux corps d\'état pollue tout le chantier et fait fuir les bons éléments.' },
      ],
    },
    {
      titre: 'Réception et SAV',
      resume: 'La dernière impression vaut la première. Réception ratée = recommandation perdue.',
      sections: [
        { titre: 'Pré-réception (J-7)', puces: [
          'Pré-réception interne avec un œil neuf (autre conducteur)',
          'Liste exhaustive des reprises avant convocation client',
          'Nettoyage fin de chantier obligatoire',
        ]},
        { titre: 'Réception client', puces: [
          'PV de réception signé avec ou sans réserves',
          'Photos des réserves avec engagement de délai',
          'Remise du DOE : plans recolés, fiches techniques, garanties',
          'Mise en service des équipements + démonstration',
        ]},
        { titre: 'SAV et garanties', puces: [
          'Garantie parfait achèvement : 1 an — toutes reprises de réserves',
          'Garantie biennale : 2 ans — équipements dissociables',
          'Garantie décennale : 10 ans — gros œuvre et étanchéité',
          'Toujours répondre dans 48h à un SAV — même si on ne peut rien faire tout de suite',
        ]},
      ],
    },
  ];

  // ================================================================
  // RUBRIQUE 2 — CHARGÉ D'AFFAIRES (5 fiches)
  // ================================================================
  const CHARGE_AFFAIRES = [
    {
      titre: 'Mission et rôle du chargé d\'affaires',
      resume: 'Le commercial-technique qui transforme un prospect en client fidèle. Il porte le chiffre d\'affaires.',
      sections: [
        { titre: 'Sa mission', contenu: 'Le chargé d\'affaires détecte les opportunités, qualifie les prospects, chiffre les projets, négocie, signe et accompagne le client jusqu\'à la fin du chantier. Il est le visage de l\'entreprise.' },
        { titre: 'Pourquoi c\'est un poste clé', contenu: 'Sans chargé d\'affaires performant, pas de carnet de commandes. C\'est lui qui produit la marge en amont par la qualité du chiffrage et la posture commerciale.' },
        { titre: 'Profil cible', puces: [
          'Background technique BTP indispensable (formation initiale ou expérience terrain)',
          'Aisance relationnelle, écoute active',
          'Rigueur dans le chiffrage et la rédaction de devis',
          'Maîtrise de Costructor (ou équivalent métreur)',
          'Connaissance des aides à la rénovation (MaPrimeRénov\', CEE, éco-PTZ)',
        ]},
      ],
    },
    {
      titre: 'Découverte client et chiffrage',
      resume: 'La qualité du devis détermine la marge réelle. Sous-estimer = travailler à perte.',
      sections: [
        { titre: 'Visite de découverte', puces: [
          'Préparer 5 questions de cadrage avant la visite (budget, délais, motivation, points durs)',
          'Écouter d\'abord, parler ensuite (60/40)',
          'Photographier systématiquement chaque pièce et chaque détail technique',
          'Identifier les contraintes invisibles : copropriété, voisinage, accès',
          'Évaluer la maturité du projet (réflexion, décision, achat)',
        ]},
        { titre: 'Chiffrage rigoureux', puces: [
          'Métré complet à partir des plans ou relevés',
          'Décomposition par lot : maçonnerie, plâtrerie, électricité, etc.',
          'Provisions pour imprévus : 5 à 10 % en neuf, 15 % en rénovation',
          'Marge cible : 25 à 35 % de marge brute selon difficulté',
          'Costructor : exporter en PDF propre, structuré, avec photos',
        ]},
        { titre: 'Points de vigilance rénovation', contenu: 'En rénovation, toujours intégrer un poste "découvertes" et prévenir le client par écrit que des travaux supplémentaires pourront apparaître au démontage (humidité, structure, électricité non conforme).' },
      ],
    },
    {
      titre: 'Négociation et signature',
      resume: 'Une bonne négo, c\'est tenir sa marge sans casser la relation.',
      sections: [
        { titre: 'Présenter le devis', puces: [
          'En présentiel toujours si > 30 k€ (jamais par mail seul)',
          'Démarrer par le pourquoi (besoin client) avant le combien',
          'Justifier chaque ligne par la valeur apportée',
          'Anticiper les 3-4 objections classiques avec des réponses prêtes',
        ]},
        { titre: 'Gérer les objections', puces: [
          '"C\'est cher" → comparer à la valeur (durée de vie, garantie, énergie économisée)',
          '"J\'ai un devis moins cher" → analyser ce qui n\'est PAS inclus chez l\'autre',
          '"Je dois réfléchir" → questionner ce qui retient vraiment',
          '"Vous pouvez baisser ?" → offrir une variante (matériaux), pas une remise',
        ]},
        { titre: 'Signer', puces: [
          'Acompte 30 % à la commande (loi Hamon : pas plus)',
          'CGV jointes et acceptées par signature',
          'Échéancier de paiement clair : 30 % - 30 % - 30 % - 10 %',
          'Délai de rétractation 14 jours pour particulier',
        ]},
      ],
    },
    {
      titre: 'Suivi commercial pendant le chantier',
      resume: 'Garder le contact client pendant le chantier = sécuriser la fin de paiement et la recommandation.',
      sections: [
        { titre: 'Rythme de contact', puces: [
          'Visite hebdomadaire (vendredi de préférence)',
          'Compte-rendu écrit après chaque visite',
          'Anticiper les questions du client AVANT qu\'il les pose',
          'Point téléphonique au démarrage de chaque nouvelle phase',
        ]},
        { titre: 'Gérer les devis modificatifs', puces: [
          'Toujours par écrit signé, jamais à l\'oral',
          'Chiffré avant exécution, pas après',
          'Facturé en cours de chantier, pas à la fin',
          'Bien expliquer le pourquoi → le client accepte plus facilement',
        ]},
      ],
    },
    {
      titre: 'Closing : facturation finale et recommandation',
      resume: 'Le moment qui transforme un client satisfait en ambassadeur.',
      sections: [
        { titre: 'Facturation finale', puces: [
          'Facture solde transmise dans les 48h après réception',
          'Détail clair des travaux réalisés et des avenants',
          'Rappel des garanties (parfait achèvement, biennale, décennale)',
          'Relance à J+15 si non réglé, J+30 puis recommandé',
        ]},
        { titre: 'Demander la recommandation', puces: [
          'À J+30 après réception, quand le client a vécu son intérieur rénové',
          'Demander un avis Google Maps + Pages Jaunes',
          'Proposer une parrainage : remise sur le prochain projet si recommandation aboutie',
          'Mettre à jour les photos avant/après dans le portfolio',
        ]},
        { titre: 'Suivi long terme', contenu: 'Un client satisfait = 3 à 5 recommandations potentielles sur 5 ans. Mettre en place une relance annuelle (carte vœux, newsletter trimestrielle) pour rester top of mind.' },
      ],
    },
  ];

  // ================================================================
  // RUBRIQUE 3 — SOUS-TRAITANCE (5 fiches)
  // ================================================================
  const SOUS_TRAITANCE = [
    {
      titre: 'Sélectionner un sous-traitant',
      resume: 'Le choix d\'un ST engage la qualité finale et la responsabilité de l\'entreprise.',
      sections: [
        { titre: 'Critères de sélection', puces: [
          'Qualifications professionnelles (Qualibat, Qualifelec, etc.)',
          'Assurance décennale en cours, montant suffisant pour le marché',
          'Référence sur 3 chantiers similaires (visite si possible)',
          'Solidité financière (extrait Kbis < 3 mois, infogreffe)',
          'Capacité à mobiliser sur les plannings RGD',
        ]},
        { titre: 'Drapeaux rouges', puces: [
          'Tarif anormalement bas (< 30 % du marché) → risque social / qualité',
          'Pas d\'adresse fiscale stable',
          'Difficulté à fournir les attestations obligatoires',
          'Manque de matériel propre (sous-sous-traitance déguisée)',
        ]},
      ],
    },
    {
      titre: 'Documents obligatoires à collecter',
      resume: 'En cas de contrôle URSSAF ou de sinistre, c\'est ce dossier qui protège l\'entreprise.',
      sections: [
        { titre: 'Avant le démarrage (obligatoire légalement)', puces: [
          'Attestation de vigilance URSSAF de moins de 6 mois',
          'Attestation d\'assurance décennale en cours',
          'Attestation d\'assurance Responsabilité Civile pro',
          'Extrait Kbis ou avis SIRENE de moins de 3 mois',
          'Pour ST étranger : équivalent URSSAF du pays d\'origine + DPAE',
          'Liste nominative des salariés affectés au chantier',
        ]},
        { titre: 'En cours de chantier', puces: [
          'Renouvellement vigilance URSSAF tous les 6 mois',
          'Justificatifs de paiement des salariés (rare contrôle URSSAF)',
        ]},
        { titre: 'Sanctions si défaut', contenu: 'Solidarité financière sur les cotisations URSSAF impayées + amende administrative + risque pénal pour travail dissimulé. À prendre très au sérieux.' },
      ],
    },
    {
      titre: 'Le contrat de sous-traitance',
      resume: 'Loi du 31 décembre 1975 : tout marché ST > 600 € HT doit faire l\'objet d\'un contrat écrit.',
      sections: [
        { titre: 'Mentions obligatoires', puces: [
          'Objet précis des travaux et corps d\'état',
          'Montant détaillé HT et TTC',
          'Délais et planning prévisionnel',
          'Modalités de paiement (échéancier, retenue de garantie)',
          'Clause de pénalités de retard',
          'Clause d\'assurance et de garantie',
        ]},
        { titre: 'Garanties à prévoir', puces: [
          'Retenue de garantie 5 % libérée 1 an après réception OU caution bancaire',
          'Pénalités de retard : 1/1000 par jour de retard (plafond 5 %)',
          'Clause de résiliation aux torts du ST si manquements graves',
        ]},
        { titre: 'Sécurité juridique', contenu: 'Toujours faire signer le contrat AVANT le démarrage. Sans contrat écrit, on s\'expose à un litige sur le périmètre des prestations.' },
      ],
    },
    {
      titre: 'Suivi qualité et réception des prestations ST',
      resume: 'Un ST se manage. Sinon il dérive.',
      sections: [
        { titre: 'Avant démarrage ST', puces: [
          'Cahier des charges écrit et signé',
          'Visite contradictoire de l\'état des supports',
          'Point sécurité et règles de chantier',
        ]},
        { titre: 'Pendant l\'intervention', puces: [
          'Visite quotidienne du conducteur de travaux',
          'Points de contrôle qualité programmés (avant fermeture des cloisons, etc.)',
          'Communication directe en cas de dérive, escalade rapide à la direction si besoin',
        ]},
        { titre: 'Réception ST', puces: [
          'PV de réception interne entre RGD et le ST',
          'Liste de reprises chiffrée si non-conformités',
          'Pas de paiement final tant que reprises non levées',
          'Photos avant/après archivées',
        ]},
      ],
    },
    {
      titre: 'Paiement et solde du sous-traitant',
      resume: 'Le paiement est l\'outil de management le plus puissant.',
      sections: [
        { titre: 'Échéancier type', puces: [
          'Pas d\'acompte sauf cas particulier (matériaux spécifiques)',
          '40 % à la mi-intervention si validation qualité',
          '50 % à la fin d\'intervention après PV de réception interne',
          '10 % retenu jusqu\'à la réception client (libéré sous 30 j)',
        ]},
        { titre: 'Délais légaux', puces: [
          'Délai de paiement : 30 j fin de mois ou 45 j fin de mois (à convenir)',
          'Mention obligatoire du délai sur la facture ST',
          'Pénalités de retard automatiques si non respect (taux BCE + 10)',
        ]},
        { titre: 'Sécuriser le paiement final', contenu: 'Tant qu\'il reste un point ouvert (qualité, document manquant, SAV à anticiper), le solde reste un levier. Une fois soldé, on perd toute marge de manœuvre.' },
      ],
    },
  ];

  // ================================================================
  // RUBRIQUE 4 — ASSISTANTE ADMINISTRATIVE (5 fiches)
  // ================================================================
  const ASSISTANTE_ADMIN = [
    {
      titre: 'Mission et rôle de l\'assistante administrative',
      resume: 'Le pivot administratif de l\'entreprise. Sans elle, le dirigeant et les commerciaux s\'épuisent dans la paperasse.',
      sections: [
        { titre: 'Sa mission', contenu: 'L\'assistante administrative organise et fiabilise tous les flux administratifs : devis, factures, relances, gestion des fournisseurs, RH simple, accueil. Elle libère du temps aux opérationnels.' },
        { titre: 'Pourquoi c\'est un poste clé', contenu: 'Une assistante efficace = un dirigeant qui peut se concentrer sur le développement et la stratégie. Une assistante débordée = un dirigeant qui fait du secrétariat à 22h.' },
        { titre: 'Profil cible', puces: [
          'Maîtrise des outils bureautiques (Excel, Word, PDF)',
          'Connaissance d\'un logiciel de gestion BTP (Costructor, BatiChiffrage, etc.)',
          'Rigueur et confidentialité absolue',
          'Sens du service client (accueil téléphonique)',
          'Bases en compta (rapprochements bancaires, TVA)',
        ]},
      ],
    },
    {
      titre: 'Gestion administrative quotidienne',
      resume: 'La routine qui maintient l\'entreprise en ordre.',
      sections: [
        { titre: 'Accueil et standard', puces: [
          'Standard téléphonique de 9h à 17h (heures à définir)',
          'Qualification des appels entrants (prospect, client, fournisseur)',
          'Réponse aux mails du jour : tout traiter sous 24h',
          'Tri courrier et numérisation systématique',
        ]},
        { titre: 'Gestion documentaire', puces: [
          'Classement systématique : 1 dossier par chantier',
          'Numérisation et archivage cloud (Dropbox, Google Drive)',
          'Conservation 10 ans des dossiers chantier (garantie décennale)',
          'Conservation 6 ans des pièces comptables',
        ]},
      ],
    },
    {
      titre: 'Facturation et relances clients',
      resume: 'La trésorerie de l\'entreprise se joue là. Une bonne assistante = un BFR maîtrisé.',
      sections: [
        { titre: 'Émission des factures', puces: [
          'Acompte 30 % émis à la signature du devis',
          'Factures intermédiaires aux jalons du planning',
          'Facture finale émise dans les 48h après réception',
          'Mentions obligatoires : SIRET, TVA, RCS, échéance, mode paiement',
          'TVA à 10 % logement > 2 ans, 20 % logement < 2 ans, 5,5 % rénovation énergétique',
        ]},
        { titre: 'Suivi des règlements', puces: [
          'Rapprochement bancaire quotidien',
          'Tableau de bord créances : mise à jour hebdomadaire',
          'Indicateur DSO (délai moyen de paiement) suivi mensuellement',
        ]},
        { titre: 'Relances impayés', puces: [
          'J+7 après échéance : relance amicale par email',
          'J+15 : relance téléphonique avec confirmation écrite',
          'J+30 : mise en demeure recommandée AR (intérêts de retard)',
          'J+60 : procédure injonction de payer (tribunal de commerce)',
        ]},
      ],
    },
    {
      titre: 'Coordination équipes et RH simple',
      resume: 'L\'assistante est souvent le pivot RH au quotidien : plannings, congés, notes de frais.',
      sections: [
        { titre: 'Gestion du personnel', puces: [
          'Suivi des heures (pointage chantier)',
          'Préparation des éléments de paie pour le cabinet comptable (fin de mois)',
          'Suivi des congés payés et RTT',
          'Notes de frais : collecte, vérification, refacturation chantier',
        ]},
        { titre: 'Suivi habilitations équipes', puces: [
          'Tableau de bord des habilitations électriques (validité 3 ans)',
          'Suivi CACES, AIPR, amiante SS4 (recyclage)',
          'Alerte 3 mois avant expiration pour reprogrammer',
          'Visites médicales périodiques (tous les 2 ans en BTP)',
        ]},
        { titre: 'Sécurité chantier', puces: [
          'Tenue du registre unique du personnel',
          'Gestion du DUERP (Document Unique Évaluation des Risques)',
          'Suivi de la procédure DT-DICT pour les chantiers concernés',
        ]},
      ],
    },
    {
      titre: 'Outils essentiels au quotidien',
      resume: 'Sans outils performants, l\'assistante est freinée. Voici la stack minimale recommandée.',
      sections: [
        { titre: 'Stack outils RGD Renova', puces: [
          'Costructor : devis, factures, fiche client',
          'Excel ou Google Sheets : tableaux de bord, suivi créances',
          'Outlook / Gmail : mail centralisé',
          'Stockage cloud (Drive, Dropbox) : documents chantier',
          'Outil de signature électronique (Yousign, DocuSign) pour les devis',
          'Calendrier partagé : RDV commerciaux, démarrages chantier',
        ]},
        { titre: 'Bonnes pratiques outils', puces: [
          'Modèles de mails préenregistrés (relance, accueil, AR)',
          'Modèles de courriers Word (mise en demeure, demande de pièces ST)',
          'Raccourcis clavier maîtrisés : gain de 30 % de productivité',
          'Sauvegarde automatique cloud activée partout',
        ]},
        { titre: 'Ce qu\'il faut éviter', puces: [
          'Multiplier les outils non interconnectés',
          'Tout stocker en local sans sauvegarde',
          'Réinventer un modèle à chaque envoi : standardiser',
        ]},
      ],
    },
  ];

  // ================================================================
  // RUBRIQUES (structure principale)
  // ================================================================
export const RUBRIQUES = [
    {
      key: 'conducteur-travaux',
      titre: 'Conducteur de travaux',
      icon: '👷',
      tint: '#2d8e4f',
      description: 'Le chef d\'orchestre opérationnel — préparation, suivi, équipes, réception',
      type: 'poste',
      fiches: CONDUCTEUR_TRAVAUX,
    },
    {
      key: 'charge-affaires',
      titre: 'Chargé d\'affaires',
      icon: '💼',
      tint: '#3b9eae',
      description: 'Le commercial-technique — découverte, devis, négo, signature, recommandation',
      type: 'poste',
      fiches: CHARGE_AFFAIRES,
    },
    {
      key: 'sous-traitance',
      titre: 'Sous-traitance',
      icon: '🤝',
      tint: '#8e6cc4',
      description: 'Sélection, documents, contrat, suivi qualité, paiement des sous-traitants',
      type: 'poste',
      fiches: SOUS_TRAITANCE,
    },
    {
      key: 'assistante-admin',
      titre: 'Assistante administrative',
      icon: '📋',
      tint: '#d9a527',
      description: 'Le pivot administratif — facturation, relances, RH simple, coordination',
      type: 'poste',
      fiches: ASSISTANTE_ADMIN,
    },
  ];

