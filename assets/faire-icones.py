# -*- coding: utf-8 -*-
"""Les icones d'application des structures.

    python assets/faire-icones.py            ecrit les PNG manquants ou refaits
    python assets/faire-icones.py planche    une planche a regarder, dans /tmp

Chaque structure a son application — `btp.html`, `courtage.html`,
`propulsion.html`, et `rgd.html` qui l'a inauguree le 27/10/2026. Une
application installee sur un telephone n'est reconnue QUE par son icone : si
les quatre partageaient celle du CRM, on ne saurait pas laquelle on ouvre.

La recette reprend celle de RGD Renova, mesuree sur ses fichiers :

  icon-<cle>-512.png           carre arrondi (r = 100/512), marque a 74 % du cote
  icon-<cle>-192.png           le meme, reduit
  icon-<cle>-maskable-512.png  carre plein, marque a 60 % — Android recadre en
                               rond, tout ce qui depasse la zone sure est coupe
  icon-<cle>-apple-512.png     carre plein et OPAQUE : iOS remplit de NOIR tout
                               pixel transparent avant d'appliquer son masque,
                               un coin arrondi dans le fichier ferait un lisere

⚠ LES COULEURS NE SONT PAS CHOISIES ICI. Chaque marque est posee sur le fond
sombre que sa structure utilise DEJA sur ses propres supports : BTP Expertise
imprime son verso de carte sur #1B2033, La Reference Courtage sur #15384E, et
c'est pour ces fonds-la que leurs logos ont une version a cercle blanc ou a
barres eclaircies. Propulsion n'a pas de support imprime : on prend le ton
sombre que le CRM lui donne deja (`on` dans js/data/schema.js).

⚠ RGD RENOVA N'EST PAS DANS CE FICHIER, et c'est voulu : ses quatre icones
existent depuis le 27/10/2026 et tournent sur le telephone de la direction.
Les refaire par une autre route, c'est risquer de les changer sans le vouloir.
"""
import os
import sys

from PIL import Image, ImageDraw

ASSETS = os.path.dirname(os.path.abspath(__file__))
LOGOS = os.path.join(ASSETS, 'logos')

SS = 4            # on dessine en 4x puis on reduit : c'est ce qui lisse les bords
COTE = 512
ARRONDI = 100
PART = 0.74
PART_MASQUE = 0.60


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def marque_courtage(c):
    """symbole-la-reference-courtage, version fond fonce (viewBox 80.03 x 100).
       Redessine plutot que redimensionne : le PNG du menu fait 128 px, agrandi
       a 380 il serait flou — ces quatre formes, elles, sont nettes partout."""
    im = Image.new('RGBA', (c, c), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = c / 100.0
    for x, y, w, h, coul in [(0, 56.73, 23.32, 43.27, '#4FB3D3'),
                             (28.34, 39.52, 23.32, 60.48, '#2A93B8'),
                             (56.68, 23.30, 23.32, 76.70, '#7FCFE8')]:
        d.rounded_rectangle([x * k, y * k, (x + w) * k, (y + h) * k],
                            radius=6.1 * k, fill=rgb(coul) + (255,))
    d.ellipse([(68.34 - 9.1) * k, (9.13 - 9.1) * k, (68.34 + 9.1) * k, (9.13 + 9.1) * k],
              fill=rgb('#F4801C') + (255,))
    return im.crop(im.getbbox())


def marque_propulsion(c):
    """logo-propulsion/propulsion.svg (viewBox 128), redessine pour la meme raison."""
    im = Image.new('RGBA', (c, c), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = c / 128.0
    d.polygon([(64 * k, 8 * k), (103 * k, 78 * k), (64 * k, 60 * k), (25 * k, 78 * k)],
              fill=rgb('#E24C86') + (255,))
    d.rounded_rectangle([37 * k, 88 * k, 91 * k, 101 * k], radius=6.5 * k, fill=rgb('#EF7FAB') + (255,))
    d.rounded_rectangle([50 * k, 109 * k, 78 * k, 122 * k], radius=6.5 * k, fill=rgb('#F8C3D9') + (255,))
    return im.crop(im.getbbox())


def marque_btp(_c):
    """Le pictogramme a cercle BLANC, celui du verso de leur carte de visite.
       Le pictogramme courant (`logos/btp.png`) a un cercle bleu nuit : pose
       sur un fond sombre, il disparaitrait."""
    im = Image.open(os.path.join(LOGOS, 'btp-sombre.png')).convert('RGBA')
    return im.crop(im.getbbox())


STRUCTURES = {
    'btp':        {'fond': '#1B2033', 'marque': marque_btp},
    'courtage':   {'fond': '#15384E', 'marque': marque_courtage},
    'propulsion': {'fond': '#2F101C', 'marque': marque_propulsion},
}


def pose(fond_im, marque, part):
    c = fond_im.size[0]
    w, h = marque.size
    f = c * part / max(w, h)          # le plus grand cote de la marque fixe l'echelle
    m = marque.resize((max(1, round(w * f)), max(1, round(h * f))), Image.LANCZOS)
    fond_im.alpha_composite(m, ((c - m.size[0]) // 2, (c - m.size[1]) // 2))
    return fond_im


def tuile(cle, part, arrondi, opaque=False):
    s = STRUCTURES[cle]
    c = COTE * SS
    im = Image.new('RGBA', (c, c), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    fond = rgb(s['fond']) + (255,)
    if arrondi:
        d.rounded_rectangle([0, 0, c - 1, c - 1], radius=arrondi * SS, fill=fond)
    else:
        d.rectangle([0, 0, c - 1, c - 1], fill=fond)
    im = pose(im, s['marque'](c), part).resize((COTE, COTE), Image.LANCZOS)
    return im.convert('RGB') if opaque else im


def poser():
    for cle in STRUCTURES:
        a = tuile(cle, PART, ARRONDI)
        a.save(os.path.join(ASSETS, 'icon-%s-512.png' % cle))
        a.resize((192, 192), Image.LANCZOS).save(os.path.join(ASSETS, 'icon-%s-192.png' % cle))
        tuile(cle, PART_MASQUE, 0).save(os.path.join(ASSETS, 'icon-%s-maskable-512.png' % cle))
        tuile(cle, PART, 0, opaque=True).save(os.path.join(ASSETS, 'icon-%s-apple-512.png' % cle))
        print('icon-%s-{192,512,maskable-512,apple-512}.png' % cle)


def planche(vers):
    cles = list(STRUCTURES)
    cote, marge = 230, 20
    lignes = [("ecran d'accueil (512)", lambda k: tuile(k, PART, ARRONDI)),
              ('Android, masque en rond', lambda k: tuile(k, PART_MASQUE, 0)),
              ('iPhone (opaque)', lambda k: tuile(k, PART, 0, opaque=True))]
    pl = Image.new('RGBA', (marge + 4 * (cote + marge), marge + 3 * (cote + marge) + 26), (238, 238, 241, 255))
    d = ImageDraw.Draw(pl)
    for j, nom in enumerate(['icon-rgd-512.png', 'icon-rgd-maskable-512.png', 'icon-rgd-apple-512.png']):
        v = Image.open(os.path.join(ASSETS, nom)).convert('RGBA')
        v.thumbnail((cote, cote), Image.LANCZOS)
        pl.alpha_composite(v, (marge, marge + j * (cote + marge)))
    for i, cle in enumerate(cles):
        for j, (_, f) in enumerate(lignes):
            im = f(cle).convert('RGBA')
            im.thumbnail((cote, cote), Image.LANCZOS)
            pl.alpha_composite(im, (marge + (i + 1) * (cote + marge), marge + j * (cote + marge)))
    for i, nom in enumerate(['RGD Renova (existante)'] + cles):
        d.text((marge + i * (cote + marge) + 2, 6), nom, fill=(20, 20, 20, 255))
    for j, (titre, _) in enumerate(lignes):
        d.text((marge + 2, marge + j * (cote + marge) + cote + 3), titre, fill=(90, 90, 95, 255))
    pl.save(vers)
    print(vers)


if __name__ == '__main__':
    if sys.argv[1:2] == ['planche']:
        planche(sys.argv[2] if sys.argv[2:] else 'planche-applis.png')
    else:
        poser()
