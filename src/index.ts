import { CARD_TAG, REPO_URL } from './const';
import { localize } from './localize/localize';

import './cards/energy-manager-card';

window.customCards = window.customCards ?? [];
window.customCards.push({
  type: CARD_TAG,
  // Der Produktname bleibt stehen; uebersetzt wird die Beschreibung.
  name: 'Energy Manager Card',
  // Die Sprache kommt hier aus dem Browser und nicht aus `hass`: Der
  // Kartenkatalog wird beim Laden des Moduls gefuellt, lange bevor die Karte
  // eine Instanz und damit `hass.language` hat. Weicht die HA-Sprache von der
  // des Browsers ab, steht hier die falsche Sprache — das ist der eine Text,
  // bei dem sich das nicht vermeiden laesst, und ohne Uebersetzung stuende
  // deutscher Text in einer englischen Oberflaeche.
  description: localize(navigator.language, 'card.picker_description'),
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
