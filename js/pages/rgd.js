// Tableau de bord RGD Renova : l'application métier (hébergée à part) affichée dans le CRM.
// Rien n'est dupliqué — c'est l'outil RGD Renova lui-même, avec ses données et sa propre connexion.
import { CONFIG } from '../config.js';
import { scope } from '../data/scope.js';
import { esc } from '../ui.js';

export const rgdDashboardPage = {
  title: () => 'RGD Renova — Tableau de bord',
  render(root) {
    if (!scope.activityKeys.includes('rgd')) {
      root.innerHTML = '<div class="card"><div class="empty">Vous n\'avez pas accès à l\'activité RGD Renova.</div></div>';
      return {};
    }

    const url = CONFIG.RGD_DASHBOARD_URL;
    root.innerHTML = `
      <div class="embed" id="e-wrap">
        <div class="embed-bar">
          <span class="embed-dot"></span>
          <b>Application RGD Renova</b>
          <span class="muted small">chantiers · devis · paiements · sous-traitants · agenda</span>
          <span class="grow"></span>
          <button class="btn ghost sm" id="e-reload">Recharger</button>
          <button class="btn ghost sm" id="e-full">Plein écran</button>
          <a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">Ouvrir dans un onglet ↗</a>
        </div>
        <div class="embed-frame" id="e-frame"></div>
        <p class="embed-help">La connexion au tableau de bord RGD Renova est indépendante de celle du CRM : la première fois, connectez-vous dans le cadre ci-dessus en cochant « Rester connecté ». S'il reste bloqué sur l'écran de connexion, votre navigateur refuse la mémorisation des sites affichés dans un autre site — passez alors par « Ouvrir dans un onglet ».</p>
      </div>`;

    const wrap = root.querySelector('#e-wrap');
    const host = root.querySelector('#e-frame');

    // Hauteur : tout l'espace restant sous la barre, recalculé au redimensionnement.
    const fit = () => {
      if (document.fullscreenElement === wrap) { host.style.height = ''; return; }
      const top = host.getBoundingClientRect().top;
      host.style.height = Math.max(460, window.innerHeight - top - 76) + 'px';
    };

    // On recrée l'élément plutôt que de réaffecter src : pas d'entrée parasite dans l'historique.
    const mount = () => {
      host.innerHTML = '';
      const frame = document.createElement('iframe');
      frame.src = url;
      frame.title = 'Tableau de bord RGD Renova';
      frame.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen');
      frame.loading = 'eager';
      host.appendChild(frame);
      fit();
    };

    root.querySelector('#e-reload').onclick = mount;
    root.querySelector('#e-full').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else wrap.requestFullscreen?.();
    };

    window.addEventListener('resize', fit);
    document.addEventListener('fullscreenchange', fit);
    mount();

    return {
      destroy() {
        window.removeEventListener('resize', fit);
        document.removeEventListener('fullscreenchange', fit);
        if (document.fullscreenElement === wrap) document.exitFullscreen();
      },
    };
  },
};
