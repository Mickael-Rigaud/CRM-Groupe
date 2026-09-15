// Jeu d'icônes de navigation (SVG inline, trait courant, 20 × 20).
// Les emoji ne sont pas lisibles à la taille du rail et changent d'un système à l'autre.
const P = {
  home: '<path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1z"/>',
  check: '<rect x="3" y="3" width="14" height="14" rx="3"/><path d="m6.8 10.2 2.2 2.2 4.2-4.6"/>',
  kanban: '<rect x="3" y="3" width="4.5" height="14" rx="1.5"/><rect x="12.5" y="3" width="4.5" height="9" rx="1.5"/>',
  target: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3"/>',
  building: '<path d="M4 17V5.5A1.5 1.5 0 0 1 5.5 4h6A1.5 1.5 0 0 1 13 5.5V17"/><path d="M13 9h2.5A1.5 1.5 0 0 1 17 10.5V17"/><path d="M2.5 17h15"/><path d="M6.8 7.5h3.4M6.8 10.5h3.4M6.8 13.5h3.4"/>',
  key: '<circle cx="7" cy="10" r="3.2"/><path d="M10.2 10H17l-1.6 2M13.6 10v2.2"/>',
  gear: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.8v1.9M10 15.3v1.9M17.2 10h-1.9M4.7 10H2.8M15.1 4.9l-1.3 1.3M6.2 13.8l-1.3 1.3M15.1 15.1l-1.3-1.3M6.2 6.2 4.9 4.9"/>',
  search: '<circle cx="8.8" cy="8.8" r="5.4"/><path d="m12.8 12.8 4 4"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v14H5.5A1.5 1.5 0 0 0 4 18.5z"/><path d="M7 7h6M7 10h6"/>',
  mail: '<rect x="2.5" y="4.5" width="15" height="11" rx="2"/><path d="m3.5 6 6.5 4.8L16.5 6"/>',
  users: '<circle cx="7.5" cy="7" r="2.8"/><path d="M2.8 16c.4-2.6 2.4-4 4.7-4s4.3 1.4 4.7 4"/><path d="M13.6 5.1a2.6 2.6 0 0 1 0 4.8M14.4 12.4c1.5.5 2.5 1.8 2.8 3.6"/>',
};
export const icon = (name, size = 20) => `<svg viewBox="0 0 20 20" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.kanban}</svg>`;
