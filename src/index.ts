import { CARD_TAG, REPO_URL } from './const';

import './cards/energy-manager-card';

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: CARD_TAG,
  name: 'Energy Manager Card',
  description:
    'PV-Überschuss anzeigen und Verbraucher nach Priorität schalten. Die Reihenfolge im Editor gibt die Priorität für die Automatik vor.',
  // Die Karte muss mit getStubConfig-Ausgabe und leerem Zustand fehlerfrei
  // rendern, sonst crasht der Karten-Picker.
  preview: true,
  documentationURL: REPO_URL,
});

console.info(
  `%c ENERGY-MANAGER-CARD %c ${__CARD_VERSION__} `,
  'color: white; background: #ff9800; font-weight: 700;',
  'color: #ff9800; background: white; font-weight: 700;',
);
