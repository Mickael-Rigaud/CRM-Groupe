// RGD Renova : l'application métier (hébergée à part) occupe la page entière du CRM.
// Rien n'est dupliqué — c'est l'outil RGD Renova lui-même, avec ses données et sa propre connexion.
import { CONFIG } from '../config.js';
import { scope } from '../data/scope.js';
import { esc } from '../ui.js';

export const rgdDashboardPage = {
  title: () => 'RGD Renova',
  fullBleed: true,   // en-tête du CRM réduit à ses commandes : ni titre ni date par-dessus l'application
  render(root) {
    if (!scope.activityKeys.includes('rgd')) {
      root.innerHTML = '<div class="card"><div class="empty">Vous n\'avez pas accès à l\'activité RGD Renova.</div></div>';
      return {};
    }

    const url = CONFIG.RGD_DASHBOARD_URL;
    // Page à ras : ni carte, ni bordure, ni titre en double — l'application occupe la surface.
    root.classList.add('flush');
    root.innerHTML = '<div class="embed-frame" id="e-frame"></div>';
    const host = root.querySelector('#e-frame');

    // Les commandes vivent dans la barre du CRM, pour ne rien ajouter par-dessus l'application.
    const bar = document.querySelector('.topbar');
    const actions = document.createElement('div');
    actions.className = 'embed-actions';
    actions.innerHTML = `
      <button type="button" class="embed-act" id="e-reload" title="Recharger l'application">Recharger</button>
      <button type="button" class="embed-act" id="e-full" title="Afficher en plein écran">Plein écran</button>
      <a class="embed-act" href="${esc(url)}" target="_blank" rel="noopener"
         title="La connexion RGD Renova est indépendante de celle du CRM. Si elle ne se mémorise pas dans le cadre, votre navigateur refuse le stockage des sites affichés dans un autre site : passez par un onglet.">Ouvrir dans un onglet ↗</a>`;
    bar.insertBefore(actions, bar.querySelector('.datepill'));

    const fit = () => {
      if (document.fullscreenElement === host) { host.style.height = ''; return; }
      host.style.height = Math.max(420, window.innerHeight - host.getBoundingClientRect().top) + 'px';
    };

    // On recrée l'élément plutôt que de réaffecter src : pas d'entrée parasite dans l'historique.
    const mount = () => {
      host.innerHTML = '';
      const frame = document.createElement('iframe');
      frame.src = url;
      frame.title = 'Application RGD Renova';
      frame.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen');
      host.appendChild(frame);
      fit();
    };

    actions.querySelector('#e-reload').onclick = mount;
    actions.querySelector('#e-full').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else host.requestFullscreen?.();
    };

    window.addEventListener('resize', fit);
    document.addEventListener('fullscreenchange', fit);
    mount();

    return {
      destroy() {
        window.removeEventListener('resize', fit);
        document.removeEventListener('fullscreenchange', fit);
        if (document.fullscreenElement === host) document.exitFullscreen();
        actions.remove();
        root.classList.remove('flush');
      },
    };
  },
};
