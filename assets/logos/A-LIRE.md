# Logos des structures

Deux formats, deux usages. Nommer les fichiers exactement d'après la clé de
l'activité (`js/data/schema.js`) : `rgd`, `btp`, `courtage`, `propulsion`.

| Fichier                   | Où il s'affiche                              | Format attendu |
|---------------------------|----------------------------------------------|----------------|
| `<clé>.png`               | menu du CRM, à 20–26 px                       | **pictogramme seul**, carré, 128 × 128 px mini |
| `<clé>-complet.png`       | tableau de la vue d'ensemble, à 40 px de haut | **logo entier** (pictogramme + nom), fond transparent, 400 px de large mini |

Aucun des deux n'est obligatoire : le CRM prend le logo complet s'il existe,
sinon le pictogramme, sinon il écrit le nom de la structure.

Le pictogramme ne doit pas contenir de texte : à 20 px, un nom écrit est
illisible. Le logo complet, lui, est fait pour être lu.

## `btp-sombre.png` — à part, et pour une seule chose

Le pictogramme de BTP Expertise **à cercle blanc**, celui du verso de leur
carte de visite. Il ne sert pas au menu : il sert à fabriquer les icônes de
l'application `btp.html` (`python assets/faire-icones.py`), posées sur fond
sombre, où le cercle bleu nuit de `btp.png` disparaîtrait.

⚠ **SON MANCHE DE LOUPE EST REDESSINÉ, ET IL FALLAIT LE FAIRE** (28/10/2026,
Élodie : « le logo de BTP Expertise je n'aime pas, il est coupé »). Tous les
pictogrammes livrés coupent ce manche : `picto.png` le tranche à plat juste
au-dessus de la ligne de texte, et le logo maître lui-même le fait descendre
**jusqu'au bord bas de son image**, où il s'arrête net — il n'a jamais eu de
bout dessiné, parce qu'il passe derrière le mot « EXPERTISE ». Sur un carré
d'icône, ce moignon se lit comme une image mal recadrée.

Mesuré sur `logo-fond-sombre.png` (1600 × 1303) :

| | |
|---|---|
| cercle | centre (863,5 ; 523,5), rayon 515,5 — donc y 8 à 1039 |
| manche | barre droite, **largeur 130**, penchée de **dx/dy = 0,404** |
| bord gauche | x = 989 + 0,404 × (y − 1047) |

On reprend donc le fichier coupé à y = 1047 et on **prolonge la barre de
120 px**, fermée par un demi-rond de rayon 65. Le mark devient plus haut que
large, le cercle rétrécit un peu dans la tuile — c'est le prix d'une loupe
entière, et il se paie une fois.

Les trois autres structures n'ont pas de fichier équivalent : le symbole de La
Référence Courtage et celui de Propulsion sont **redessinés** par le script —
quatre et trois formes géométriques —, parce qu'un PNG de 128 px agrandi à
380 serait flou là où ces formes-là sont nettes à toute taille.
