# Änderungsprotokoll

Dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [0.4.1] — 2026-07-26

### Behoben

- **Der Editor sprach mit Integration weiter von Helfern.** „Sortieren im Dashboard" behauptete,
  es brauche bei allen Verbrauchern einen Prioritäts-Helfer — mit Integration geht es ohne jede
  Vorbereitung. Auch „Was der Schalter tut" verwies auf einen Automatik-Helfer, den es dort nicht
  gibt. Beide Felder haben jetzt einen eigenen Text für den Fall mit Integration.
- `use_integration` bleibt bewusst **ohne** Schalter im Editor. Die Karte ist das Anzeigeteil der
  Integration; sie ohne diese zu betreiben ist ein Rückfall, kein Betriebsmodus — ein Feld im
  Formular würde dafür werben. Wer es braucht, setzt das Feld im YAML.

- **Die Karte lag in einer Sections-Ansicht unter der nächsten Karte.** Sie meldete Lovelace eine
  feste Zeilenzahl, die sie aus der gerenderten Verbraucherliste ableitete — beim Aufbau des
  Layouts hatte aber noch kein Rendern stattgefunden, mit Integration ergab das _zwei_ Zeilen. Eine
  feste Zeilenzahl bedeutet in Sections eine feste Höhe; längerer Inhalt lief darüber hinaus.

  Die Karte meldet jetzt `rows: auto` — ihre Höhe hängt an Dingen, die sich zur Laufzeit ändern
  (Zahl der Verbraucher, Fehlerhinweise, Sortiermodus), und HA misst das genauer, als die Karte es
  vorhersagen kann. Die Verbraucherzahl kommt zusätzlich direkt aus der Integration statt aus der
  gerenderten Liste.

## [0.4.0] — 2026-07-26

Verbraucher werden nur noch an **einer** Stelle gepflegt.

### Geändert — betrifft bestehende Konfigurationen

- **Ist die [Energy Manager Integration](https://github.com/eltomato89/EnergyManagerIntegration)
  installiert, liest die Karte alles von dort**: Überschuss, Verbraucher, Rangfolge, Ampelzustand
  und Sperrzeiten. `devices` und die Sensorfelder werden dann nicht mehr gebraucht; der Editor
  blendet sie aus und verweist auf die Integration. Bestehende Konfigurationen bleiben lesbar — die
  Felder werden nur ignoriert.
  Wer die Integration installiert hat, sie für eine Karte aber nicht nutzen will, setzt
  `use_integration: false`.
- **Die Helfer-Funktion ist entfallen.** Der Knopf legte je Verbraucher zwei echte HA-Helfer an;
  genau der Wildwuchs, den die Integration abschafft. Ohne Integration bleibt der Weg über von Hand
  angelegte Helfer bestehen.
- `setConfig` wirft nicht mehr, wenn Zählersensoren fehlen. Lovelace ruft es **vor** dem
  `hass`-Setter auf — dort ist nicht zu sehen, ob die Integration die Sensoren stellt. Fehlt
  tatsächlich jede Datenquelle, zeigt die Karte jetzt einen Hinweis statt einer roten Fehlerkarte.

### Neu

- **Hauptschalter der Automatik** im Kartenkopf, sobald die Integration läuft. Ist er aus, wird
  nichts geschaltet.
- **Sperrzeiten sind exakt statt geschätzt.** Bisher rechnete die Karte aus `last_changed`, was
  manuelles Schalten und Neustarts verfälschen. Mit Integration nimmt sie deren Zeitstempel.
- Sortieren im Dashboard funktioniert mit Integration ohne Vorbereitung — sie legt je Verbraucher
  eine Prioritäts-Entität an. Die Karte leitet die Service-Domain aus der Entitäts-ID ab, `number`
  und `input_number` kennen beide `set_value`.

### Hintergrund

Ohne diesen Umbau müssten Verbraucher zweimal gepflegt werden: in der Karte und in der Integration.
Zwei Listen für dieselbe Sache laufen unweigerlich auseinander — dann zeigt die Karte etwas anderes
an, als die Automatik tut.

## [0.3.0] — zurückgezogen

Bedienen direkt im Dashboard, ohne den Bearbeitungsmodus. **Nie veröffentlicht:** der hier
beschriebene Weg über Helfer-Variablen wurde durch die Integration ersetzt (siehe 0.4.0).

### Neu

- **Sortieren im Dashboard.** Ein Symbol im Kartenkopf schaltet einen Sortiermodus ein; erst dann
  erscheinen Griffe und Pfeiltasten. Bewusst ein Modus und kein Dauerzustand — sonst verschiebt man
  auf dem Tablet beim Scrollen versehentlich Prioritäten.
- **Der Schalter steuert die Automatik** statt das Gerät, sobald ein `auto_entity` konfiguriert ist
  (`switch_action`). Ein farbiger Punkt am Symbol zeigt weiterhin, ob das Gerät läuft; schalten
  lässt es sich über den Detail-Dialog.
- Zwei neue Felder je Verbraucher: `priority_entity` (`input_number`) und `auto_entity`
  (`input_boolean`). **Ist ein Prioritäts-Helfer gesetzt, schlägt sein Wert die Array-Position.**
- Knopf im Editor, der die fehlenden Helfer per WebSocket anlegt und einträgt — von Hand wären das
  zwei je Verbraucher, samt passender Grenzen.
- Warnungen bei gemischter Ausstattung (nur manche Verbraucher mit Prioritäts-Helfer) und bei
  eingeschaltetem Sortieren ohne vollständige Helfer.

### Hintergrund

Eine Lovelace-Karte kann ihre eigene Konfiguration zur Laufzeit **nicht** speichern — im Dashboard
ist sie schreibgeschützt. Reihenfolge und Automatik-Status brauchen deshalb einen Speicherort
außerhalb der Karte. Helfer-Entitäten sind zugleich das, was die spätere Integration ausliest.

## [0.2.0] — unveröffentlicht

### Geändert — betrifft bestehende Konfigurationen

- **Batterieentladung verringert den Überschuss nicht mehr** (neue Option `battery_mode`, Standard
  `charge_only`). Bisher meldete die Karte bei entladender Batterie ein Defizit in Höhe der
  Entladeleistung, obwohl der Zähler nahezu Null zeigte — bei 7 W Netzbezug und 386 W Entladung
  standen dort 390 W. Ladeleistung zählt unverändert als verfügbar. Das alte Verhalten (reiner
  PV-Überschuss) gibt es weiterhin mit `battery_mode: full`.
- **Ein negativer Wert heißt jetzt „Defizit" statt „Netzbezug".** Die alte Beschriftung behauptete
  einen Netzbezug, den es so nicht gab — die Batterie kann den größten Teil davon stützen.
- Die widersprüchliche Legende „frei −390 W" entfällt bei negativem Überschuss.

### Neu

- Zeile mit den tatsächlichen Zählerwerten unter dem Überschuss
  („Netz 7 W Bezug · Batterie 386 W entladen"), damit berechneter Überschuss und realer Netzfluss
  nicht verwechselt werden.

### Behoben

- Die Sperrzeit steht in einer eigenen Zeile; vorher blieb beim Umbruch ein Trennpunkt am
  Zeilenende hängen.

## [0.1.0] — 2026-07-25

Erste Fassung. Anzeigen und manuelles Schalten; die Automatik folgt in einer eigenen Integration.

### Neu

- Überschussanzeige mit zweigeteilter Leiste (belegt / frei) und Negativbereich bei Netzbezug
- Zwei Zählervarianten: bidirektionaler Netzsensor oder getrennte Sensoren für Erzeugung und
  Verbrauch, mit umkehrbarem Vorzeichen
- Optionale Hausbatterie mit Ladestand, Lade-/Entladekorrektur, Mindestladestand und Reserve
- Zeitgewichtete Glättung des Überschusses gegen Wolkenflackern
- Verbraucherliste mit Ampel, deren Budget kaskadierend nach Priorität verteilt wird
- Priorisierung per Drag & Drop im Editor, mit Pfeil-Buttons als Tastatur- und Touch-Pfad
- Vier Zeitfelder je Verbraucher (`turn_on_delay`, `turn_off_delay`, `min_runtime`, `min_off_time`)
  für die spätere Automatik; die Karte zeigt für die beiden letzteren einen Countdown
- Manuelles Schalten über `homeassistant.turn_on/off` mit optimistischer Anzeige und optionaler
  Rückfrage
- Grafischer Editor, Lokalisierung Deutsch und Englisch
- Klartextmeldung statt stiller 0 W, wenn ein Sensor keine Leistung misst (etwa ein kWh-Zähler)
