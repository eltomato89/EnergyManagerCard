# Schnittstelle zur Energy-Manager-Integration

Dieses Dokument hält fest, worauf sich Karte und
[Integration](https://github.com/eltomato89/EnergyManagerIntegration) gegenseitig verlassen — und
worauf ausdrücklich nicht.

## Die Richtung hat sich umgekehrt

Ursprünglich war vorgesehen, dass die Integration die Verbraucherliste **aus der Lovelace-Config
der Karte liest**. Das ist verworfen. Der Auslöser: Sortieren im Dashboard und ein
Automatik-Schalter je Verbraucher brauchen einen Speicherort außerhalb der Karte, und der bestand
aus zwei `input_number`/`input_boolean`-Helfern pro Gerät. Bei acht Verbrauchern sind das sechzehn
Helfer, die sich in der Instanz ansammeln und von Hand gepflegt werden wollen.

Die Integration führt dieselben Zustände als eigene Entitäten — ohne Wildwuchs, mit sauberem
Aufräumen beim Löschen. Damit ist sie der natürliche Ort für die Verbraucher, und die Karte liest
von dort.

**Es gibt genau eine Stelle, an der Verbraucher gepflegt werden.** Zwei wären der eigentliche
Fehler: Sie liefen unweigerlich auseinander, und dann zeigte die Karte etwas anderes an, als die
Automatik tut.

## Rollenverteilung

|                               | Karte                     | Integration            |
| ----------------------------- | ------------------------- | ---------------------- |
| Überschuss berechnen          | nur ohne sie              | maßgeblich             |
| Verbraucher verwalten         | nur ohne sie              | maßgeblich             |
| Priorität festlegen           | bedienen, nicht speichern | speichern und anwenden |
| Verbraucher schalten          | auf Klick                 | automatisch            |
| Zeitfelder durchsetzen        | nein                      | ja                     |
| Zustand über Neustarts halten | nein                      | ja                     |

Die Karte **schreibt keine Konfiguration**. Sie ruft `homeassistant.turn_on/off`,
`switch.turn_on/off` und `number.set_value` auf — alles Bedienung, kein Datenexport.

## Wie die Karte die Integration findet

Über das Entitätsregister (`hass.entities`), nicht über Entitäts-IDs — die kann der Nutzer
umbenennen. Referenz: `src/lib/integration.ts`.

1. Alle Einträge mit `platform === 'energy_manager'` einsammeln, nach `device_id` gruppieren.
2. Die Rolle jeder Entität steht in ihrem `translation_key`.
3. Das Gerät mit `translation_key === 'surplus'` ist der **Hub**.
4. Jedes weitere Gerät mit einem `status` ist ein **Verbraucher**.

Findet sich kein Hub, rechnet die Karte selbst. Dasselbe bei `use_integration: false`.

### Die Rollen

| `translation_key` | Ort         | Wofür die Karte sie nutzt                           |
| ----------------- | ----------- | --------------------------------------------------- |
| `surplus`         | Hub         | Überschuss und alle Kennzahlen (siehe Attribute)    |
| `automation`      | Hub         | Hauptschalter im Kartenkopf                         |
| `status`          | Verbraucher | Ampelzustand **und alle Angaben zum Verbraucher**   |
| `priority`        | Verbraucher | Rang; wird beim Sortieren geschrieben               |
| `managed`         | Verbraucher | Teilnahme an der Automatik; der Toggle in der Zeile |
| `locked_until`    | Verbraucher | Sperrzeit-Countdown                                 |

Diese Schlüssel sind Teil der Zusage. Werden sie in der Integration umbenannt, findet die Karte die
Rolle nicht mehr.

## Attribute, auf die sich die Karte verlässt

Das ist der Kern des Vertrags: Die Karte stellt einen Verbraucher **allein aus den Attributen des
Status-Sensors** dar. Fehlt hier etwas, müsste sie dieselbe Liste ein zweites Mal führen.

Am Status-Sensor je Verbraucher:

| Attribut                              | Wofür                                               |
| ------------------------------------- | --------------------------------------------------- |
| `switch_entity`                       | das zu bedienende Gerät. **Ohne dies kein Eintrag** |
| `consumer_id`                         | stabiler Schlüssel für `repeat()`                   |
| `consumer_name`                       | Anzeigename                                         |
| `power_entity`                        | Leistungssensor, für den Detail-Dialog              |
| `rank`                                | Position in der Liste (1 = höchste)                 |
| `managed`, `is_on`                    | Zustand                                             |
| `power_w`, `required_w`, `headroom_w` | Zweitzeile und Ampelbegründung                      |
| `min_power`, `max_power`              | Skalierung der Überschussleiste                     |

Am Überschuss-Sensor des Hubs: `grid_w`, `battery_w`, `battery_correction_w`, `battery_soc`,
`coverage`, `smoothing_window`, `degraded`, `errors`.

`errors` verwendet Unterstriche (`grid_unavailable`); die Karte übersetzt sie in ihre eigene
Schreibweise mit Bindestrichen. Ein Testfall in `test/integration.test.ts` hält das fest.

## Priorität

Mit Integration ist die Quelle eindeutig: das `rank`-Attribut. Die Karte sortiert danach und
schreibt beim Umsortieren lückenlos `1..n` per `set_value` — nur für die Verbraucher, deren Wert
sich tatsächlich ändert.

Die Service-Domain leitet sie aus der Entitäts-ID ab (`number` oder `input_number`), weil beide
`set_value` kennen. So bedient derselbe Code die Integration und den Helfer-Weg.

Ohne Integration gilt die alte Regel: erst `devices[].priority_entity`, dann der Array-Index. Ein
`priority`-Zahlenfeld in der Karten-Config gibt es bewusst nicht — es wäre eine dritte Quelle, die
beim Sortieren sofort veraltet.

## Sperrzeiten — die eingelöste Zusage

Die Karte schätzte `min_runtime`/`min_off_time` früher aus `last_changed`. Das ist eine Näherung mit
bekannten Fehlern: manuelles Schalten setzt `last_changed` zurück, ein HA-Neustart ebenfalls, und
über `turn_on_delay`/`turn_off_delay` sagt es prinzipbedingt nichts.

Mit Integration nimmt die Karte stattdessen den Zeitstempel aus `locked_until` und die Art der
Sperre aus dessen Attribut `lock_kind`. Das ist exakt statt geschätzt.

Ohne Integration bleibt die Näherung — ausdrücklich zur Orientierung, keine Sperre: der Toggle
bleibt immer bedienbar.

## Überschussformel — nachgewiesener Gleichstand

Beide Implementierungen rechnen identisch. Das ist nicht bloß beabsichtigt, sondern geprüft: Aus
der TypeScript-Referenz (`src/lib/surplus.ts`) sind knapp 200 Fälle generiert, gegen die die
Python-Portierung antritt (`tests/test_parity.py` in der Integration).

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
das wie ein Rechenfehler aus.

Anschließend gilt in beiden Modi:

```
available = S_roh − battery_reserve_w
wenn soc < battery_min_soc:  available = min(available, 0)
```

Kein Clamping auf ≥ 0. Ein negativer Wert bedeutet ein **Defizit gegenüber der Erzeugung** — und
ausdrücklich _nicht_ Netzbezug in gleicher Höhe, denn die Batterie kann einen Teil davon stützen.

Weitere Festlegungen, die beide Seiten einhalten:

- Einheiten strikt über `unit_of_measurement` normalisieren; ein Energiezähler (kWh) ist ein
  Konfigurationsfehler und **nie** als 0 zu behandeln.
- Fällt der Batteriesensor aus, mit Korrektur 0 weiterrechnen und den Zustand als `degraded` führen —
  nicht raten.
- Geglättet wird der **Rohwert**; Reserve und SoC-Regel greifen danach, sonst laufen sie dem
  Mittelungsfenster hinterher.

## Die eine bewusste Abweichung

Beim Verteilen des Budgets in Prioritätsreihenfolge zieht die **Karte** auch für nicht verwaltete
Verbraucher Budget ab, die **Integration** nicht.

Das ist kein Fehler, sondern zwei verschiedene Fragen:

- Die Karte zeigt an, was tatsächlich zu erwarten ist. Ein manuell geschaltetes Gerät wird Strom
  ziehen — also ist der Überschuss dahinter belegt.
- Die Integration entscheidet, was sie schalten darf. Ein Gerät, das sie nicht schaltet, darf ihr
  kein Budget blockieren.

Der Status-Sensor meldet in beiden Fällen denselben Wert, damit Anzeige und Automatik übereinstimmen.
Nur die interne Verteilung weicht ab. Festgehalten in
`tests/test_entities.py::test_nicht_verwalteter_verbraucher_blockiert_kein_budget`.

Bereits eingeschaltete Verbraucher verbrauchen auf beiden Seiten kein Budget — ihr Verbrauch steckt
schon im gemessenen Überschuss.
