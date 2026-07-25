# Schnittstelle zur Energy-Manager-Integration

Dieses Dokument hält fest, worauf sich die noch zu bauende Integration verlassen darf — und worauf
ausdrücklich nicht. Es ist die Begründung für mehrere Entwurfsentscheidungen der Karte.

## Rollenverteilung

|                               | Karte (v1)      | Integration (später) |
| ----------------------------- | --------------- | -------------------- |
| Überschuss berechnen          | ja, zur Anzeige | ja, maßgeblich       |
| Priorität festlegen           | ja, im Editor   | nein, übernimmt sie  |
| Verbraucher schalten          | nur auf Klick   | automatisch          |
| Zeitfelder durchsetzen        | nein            | ja                   |
| Zustand über Neustarts halten | nein            | ja                   |

Die Karte **schreibt nichts nach außen**. Sie ruft ausschließlich `homeassistant.turn_on/off` auf,
wenn der Nutzer klickt. Es gibt keinen Service-Call, mit dem sie Konfiguration exportiert.

## Wie die Integration an die Konfiguration kommt

Vorgesehener Weg im Config-Flow der Integration:

1. Gespeicherte Lovelace-Konfiguration lesen (`hass.data['lovelace']` bzw. `.storage/lovelace*`).
2. Alle Views und Karten **rekursiv** nach `type == 'custom:energy-manager-card'` durchsuchen —
   auch verschachtelt in `grid`, `vertical-stack`, `horizontal-stack` und `sections`.
3. Bei genau einem Treffer „Konfiguration aus der Karte übernehmen" anbieten; bei mehreren eine
   Auswahl nach `title` und Anzahl der Verbraucher.
4. Felder 1:1 in `ConfigEntry.options` kopieren. **Deshalb sind die Feldnamen und Einheiten
   identisch** — es soll keine Übersetzungsschicht nötig sein.

Ein „Erneut synchronisieren"-Schritt im Options-Flow gleicht über `devices[].id` ab:
gleiche ID = bestehender Eintrag (Reihenfolge und Werte aktualisieren), neue ID = neuer Verbraucher,
verschwundene ID = entfernt.

### Bewusst offen gelassene Sollbruchstelle

Erweist sich der Lovelace-Lesepfad als unpraktikabel (Storage- gegenüber YAML-Modus), bleibt als
Rückfallebene, dass der Nutzer den `devices`-Block von Hand kopiert. Damit das funktioniert, gilt
für das Schema:

- **keine verschachtelten Objekte** in `DeviceConfig`,
- **keine rein kartenspezifischen Darstellungsoptionen** innerhalb von `devices[]`.

Beides ist eingehalten.

## Priorität

Es gibt **zwei** mögliche Quellen, und die Reihenfolge zwischen ihnen ist festgelegt:

1. **`devices[].priority_entity`** — ein `input_number` mit dem Rang (1 = höchste). Ist er gesetzt
   und liefert einen endlichen Wert, gilt er.
2. **Array-Index** in `devices[]` — für alle Verbraucher ohne verwertbaren Helferwert. Bei
   Gleichstand entscheidet ebenfalls der Array-Index, damit die Reihenfolge nie springt.

Ein `priority`-Zahlenfeld **in der Karten-Config** gibt es weiterhin bewusst nicht: es wäre eine
dritte Quelle, die beim Sortieren im Dashboard sofort veralten würde.

Die zweite Quelle war unvermeidlich. Eine Lovelace-Karte kann ihre eigene Konfiguration zur
Laufzeit nicht schreiben — Sortieren im Dashboard geht also nur über Entitäten. Die Karte schreibt
beim Umsortieren lückenlos `1..n` per `input_number.set_value`, und zwar nur für die Verbraucher,
deren Wert sich tatsächlich ändert.

**Für die Integration heißt das:** Sie muss dieselbe Rangfolge anwenden — erst Helferwert, dann
Array-Index. Verlässt sie sich allein auf den Array-Index, schaltet sie in einer anderen Reihenfolge,
als die Karte anzeigt. Referenz: `src/lib/priority.ts`, Funktion `orderDevices`.

## Automatik-Teilnahme

Ebenfalls zwei Quellen, gleiche Logik:

1. **`devices[].auto_entity`** — ein `input_boolean` (oder `switch`). Ist er gesetzt und verfügbar,
   gilt sein Zustand.
2. **`devices[].managed`** — der statische Rückfall, Standard `true`.

Ist `auto_entity` gesetzt, schaltet der Toggle in der Kartenzeile diesen Helfer statt der
Geräte-Entität; das Gerät bleibt über den Detail-Dialog bedienbar. Ein nicht teilnehmender
Verbraucher wird in der Karte weiterhin mit Ampel angezeigt — er ist nur gekennzeichnet.

Die Integration darf einen Verbraucher mit `auto_entity == off` **nicht** automatisch schalten.

## Zeitfelder — was die Karte darf und was nicht

Die Integration ist die **einzige** Instanz, die `turn_on_delay`, `turn_off_delay`, `min_runtime`
und `min_off_time` verbindlich durchsetzt. Sie braucht dafür einen eigenen Laufzeitzustand je
`devices[].id`:

- Zeitpunkt der letzten **von ihr** ausgelösten Schalthandlung,
- Zeitpunkt, seit dem die Ein- bzw. Ausschaltbedingung ununterbrochen erfüllt ist.

Sie darf sich **nicht** auf `last_changed` der Schalt-Entität verlassen:

- manuelles Schalten (auch über diese Karte) setzt `last_changed` zurück,
- ein HA-Neustart ebenfalls,
- `last_updated` ist erst recht ungeeignet, weil jede Attributänderung es erneuert.

Die Karte zeigt für `min_runtime`/`min_off_time` dennoch einen Countdown an, berechnet aus
`last_changed`. Das ist ausdrücklich eine **Näherung zur Orientierung**, keine Sperre: der Toggle
bleibt immer bedienbar. `turn_on_delay`/`turn_off_delay` zeigt die Karte gar nicht an, weil sie
dafür einen Zustand über Reloads hinweg führen müsste.

## Überschussformel

Die Integration sollte dieselbe Formel verwenden, damit Anzeige und Verhalten nicht auseinanderlaufen.
Referenzimplementierung: `src/lib/surplus.ts`.

Bilanz am Netzverknüpfungspunkt, alles in Watt, `G` = Netzleistung (>0 Bezug),
`B` = Batterieleistung (>0 Laden):

```
G = C_haus + B − P_pv     ⟹     S_roh = P_pv − C_haus = B − G
```

- Modus `grid`: `S_roh = −G + B_eff`
- Modus `split`: `S_roh = P_prod − C_haus` (`+ B_eff`, wenn `consumption_includes_battery`)

`B_eff` hängt an `battery_mode`:

- `charge_only` (Standard): `B_eff = max(B, 0)` — Ladeleistung ist umlenkbar, Entladung wird
  ignoriert.
- `full`: `B_eff = B` — Entladung wird abgezogen.

Der Standard ist bewusst `charge_only`: Mit `full` meldet die Karte bei entladender Batterie ein
Defizit in Höhe der Entladeleistung, während der Zähler nahezu Null zeigt — für den Nutzer sieht
das wie ein Rechenfehler aus. Die Integration muss denselben Modus respektieren, sonst schaltet sie
anders, als die Karte anzeigt.

Anschließend gilt in beiden Modi:

```
available = S_roh − battery_reserve_w
wenn soc < battery_min_soc:  available = min(available, 0)
```

Kein Clamping auf ≥ 0. Ein negativer Wert bedeutet ein **Defizit gegenüber der Erzeugung** — und
ausdrücklich _nicht_ Netzbezug in gleicher Höhe, denn die Batterie kann einen Teil davon stützen.
Wer den tatsächlichen Zählerwert braucht, nimmt `G` direkt.

Weitere Festlegungen, die die Integration übernehmen sollte:

- Einheiten strikt über `unit_of_measurement` normalisieren; ein Energiezähler (kWh) ist ein
  Konfigurationsfehler und **nie** als 0 zu behandeln.
- Fällt der Batteriesensor aus, mit Korrektur 0 weiterrechnen und den Zustand als unsicher führen —
  nicht raten.
- Geglättet wird der **Rohwert**; Reserve und SoC-Regel greifen danach, sonst laufen sie dem
  Mittelungsfenster hinterher.
- Budget in Prioritätsreihenfolge kaskadierend verteilen; bereits eingeschaltete Verbraucher
  verbrauchen kein Budget, weil ihr Verbrauch im gemessenen Überschuss schon enthalten ist.

## Erweiterungen, die die Karte v2 nachziehen wird

Additiv, ohne bestehende Konfigurationen zu brechen:

- `secondary_info` ist ein Enum und kann um `'automation'` erweitert werden, um pro Verbraucher den
  Automatikzustand anzuzeigen.
- Ein optionales `automation_entity` auf Kartenebene für einen globalen „Automatik aus/an"-Schalter.
- Sobald die Integration je Verbraucher einen „gesperrt bis"-Zeitstempel als Entität veröffentlicht,
  ersetzt die Karte ihre `last_changed`-Näherung durch diesen exakten Wert.
