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
4. Jedes weitere Gerät mit einem `status` ist ein **Verbraucher** — es sei denn, dessen Attribut
   `kind` lautet `battery`, dann ist es ein **Speicher**.

Die Art einer Zeile steht damit in einem Attribut und wird nicht aus einer Lücke geschlossen. Aus
der fehlenden `switch_entity` zu folgern, es müsse ein Speicher sein, hieße einen Fehler für eine
Aussage zu halten. Eine ältere Integration kennt `kind` nicht — sie hat aber auch keine
Speichergeräte.

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
| `status`          | Speicher    | Ampelzustand **und alle Angaben zum Speicher**      |
| `priority`        | Speicher    | Rang; wird beim Sortieren geschrieben               |
| `min_soc`         | Speicher    | Ladevorranggrenze; regelbar (nur mit Ladestand)     |

Verbraucher und Speicher teilen sich `status` und `priority` — dieselbe Rolle an einem anderen
Gerät. Das ist Absicht: Eine Zeile ist eine Zeile, und was sie unterscheidet, steht in `kind`.

Diese Schlüssel sind Teil der Zusage. Werden sie in der Integration umbenannt, findet die Karte die
Rolle nicht mehr.

## Versionierung: getrennte Nummern, dokumentierte Mindestversion

Beide Projekte tragen **eigene Versionsnummern**. Eine gemeinsame Nummer wäre naheliegend — beide
werden meist am selben Tag veröffentlicht, und wer eine Batteriezeile sieht, will wissen, welche
Integration dazugehört. Sie ist trotzdem verworfen, und zwar aus drei Gründen:

1. **Einseitige Releases sind der Normalfall, nicht die Ausnahme.** In der bisherigen gemeinsamen
   Historie stehen fünf Paare, die binnen zwei Minuten erschienen — und drei Fassungen, die es nur
   auf einer Seite gab: Karte `0.4.1` sowie Integration `0.3.0` und `0.3.1`. Gleichstand hätte jedes
   Mal ein leeres Release auf der anderen Seite erzwungen. Oder die Nummern wären beim ersten
   Ausnahmefall auseinandergelaufen — ein Versprechen, das einmal gebrochen wird, ist schlechter als
   keines.
2. **Gekoppelt sind die Attribute, nicht die Releases.** Was beide Seiten einhalten müssen, steht in
   diesem Dokument. Eine Versionsgleichheit würde eine harte Kopplung behaupten, die es nicht gibt.
3. **Die Karte fragt Attribute ab, nie Versionen.** Fehlt `battery_load`, entfällt die
   Batteriezeile. Eine ältere Integration führt damit zu weniger Anzeige statt zu einem Fehler —
   genau das, was eine Versionsprüfung erreichen soll, nur ohne Nummernvergleich.

Hinzu kommt, dass die Nummern nicht deckungsgleich zu machen wären, ohne eine der beiden Historien
zu verbiegen: Die Karte ist zwei Minor-Versionen weiter, weil sie vor der Integration existierte und
eine zurückgezogene Fassung hinter sich hat. Die Integration müsste von 0.4 auf 0.6 springen, ohne
dass das etwas bedeutete.

**Kein Grund ist**, dass die Karte ohne Integration läuft. Das ist Bestandsschutz für ältere
Konfigurationen und ausdrücklich kein vorgesehener Betriebsmodus — die Versionierung muss ihn nicht
abbilden.

**Stattdessen gilt:** Neue Attribute kommen additiv dazu, und jede Kartenfunktion, die eine
Integration braucht, nennt hier ihre Mindestversion.

| Kartenfunktion                                            | Karte   | Integration |
| --------------------------------------------------------- | ------- | ----------- |
| Integrationsmodus (Verbraucher, Ampel, Rang, Sperrzeiten) | ≥ 0.4.0 | ≥ 0.1.0     |
| Batteriezeile als verschiebbare Last                      | ≥ 0.6.0 | ≥ 0.4.0     |
| Stufenleiter regelbarer Verbraucher                       | ≥ 0.7.0 | ≥ 0.5.0     |
| Gedämpfter Statusbalken bei untätiger Automatik           | ≥ 0.7.0 | ≥ 0.1.0     |
| Tagesziel in Stunden statt kWh                            | ≥ 0.7.0 | ≥ 0.5.0b3   |
| Mehrere Speicher, je einer mit eigenem Gerät              | ≥ 0.7.0 | ≥ 0.5.0b4   |

<!-- version-pair -->

**Aktueller Stand:** Karte `0.7.0-beta.3`, erprobt gegen Integration ab `0.5.0b1`.

Bewusst eine Untergrenze und kein Paar: Eine Integrationsfassung, die allein erscheint, macht die
Zeile damit nicht falsch — sonst müsste sie bei jedem einseitigen Release nachgezogen werden, und
genau das wird einmal vergessen. Dass die genannte Kartenfassung stimmt, prüft der Release-Workflow
der Karte gegen den Tag.

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
| `consumer_type`                       | Verhaltenstyp: `switch` oder `modulating`           |

`consumer_type` ist der Verhaltenstyp des Verbrauchers. Fehlt das Attribut, gilt `switch` — eine
ältere Integration führt damit zu derselben Darstellung wie bisher. `modulating` ist vorgesehen für
Verbraucher mit einer Steuerentität; solange die Integration sie nicht ansteuert, liefert sie den
Wert nicht aus.

Zur Diagnose kommen `last_foreign_change` (ISO-Zeitstempel) und `last_foreign_to` (bool) dazu: wann
zuletzt jemand **anders als die Integration** diesen Verbraucher geschaltet hat und wohin. Die Karte
muss darauf nichts stützen — die Werte sind dafür da, im Betrieb abzulesen, wie häufig der Fall bei
einem Gerät auftritt. Bei Geräten, die intern takten (`climate`, `water_heater`), ist er der
Regelfall und nicht die Ausnahme.

### Regelbare Verbraucher

Ist ein Verbraucher regelbar, kommen am Status-Sensor dazu: `control_entity`, `level_source`
(`number_w`, `number_a` oder `select`), `level_count`, `min_level_w`, `max_level_w`, `level_w`,
`level_index` (1-basiert wie `rank`) und `setpoint_w`.

Bei einem rein schaltbaren Verbraucher **fehlen diese Attribute ganz**, statt mit `null` befüllt zu
sein. Daran — und nicht an `consumer_type` — erkennt die Karte, dass es etwas zu regeln gibt. Eine
ältere Integration liefert sie ebenfalls nicht und führt damit zu weniger Anzeige statt zu einem
Fehler; dieselbe Regel wie bei der Batteriezeile.

**Das Raster ist die Sache der Integration.** Die Karte leitet es nicht ab: Sie kennt weder die
Attribute der Steuerentität noch die Umrechnung von Ampere in Watt. Läge beides an zwei Stellen,
liefe es auseinander — genau der Fehler, den die Paritätsprüfung für die Überschussformel verhindert.

`level_w` ist die gestellte Stufe, `setpoint_w` die, auf die die Automatik gehen würde. Weichen sie
voneinander ab, steht ein Stufenwechsel an, und `blocked_by` sagt, warum er noch nicht stattgefunden
hat. `level_w` und `level_index` sind `null`, wenn keine Stufe zu lesen ist — etwa bei einer
Auswahlliste in der Aus-Stellung. Das ist etwas anderes als 0 W und muss als `null` durchkommen.

`required_w` ist bei einem regelbaren Verbraucher die **kleinste Stufe**, ausgewiesen über
`required_source: ladder`.

`observed_max_w` ist die höchste Leistung, die das Gerät seit dem Einschalten erreicht hat, und
`level_capped` sagt, ob die Leiter deswegen beschnitten ist. Beides ist die Antwort auf „warum geht
sie nicht höher": Nicht der Überschuss fehlt, das Gerät nimmt nicht mehr. Die Karte leitet das nicht
ab — ob eine Last dem Sollwert folgt, ergibt sich erst aus dem Verlauf über die Zeit, und den kennt
nur die Integration.

Nach einem Eingriff von außen hält sich die Automatik befristet fern; `manual_until` nennt den
**Endzeitpunkt**, nicht die Restdauer. Ein Zeitstempel bleibt richtig, während eine Restdauer mit
jeder Sekunde veraltet, und die Karte zeichnet nicht jede Sekunde neu. Fehlt das Attribut oder ist es
`null`, liegt keine Übersteuerung an.

Befristet und nicht dauerhaft, und das ist eine Zusage an den Nutzer: Es gibt eine Klasse von
Fehlerkennungen, die nicht wegzufiltern ist — Geräte, die ihren eigenen Zustand ändern. Dort läuft
eine befristete Sperre von selbst ab. Der `managed`-Schalter wird von der Integration **nie**
geschrieben; er bleibt Nutzerkonfiguration.

### Tagesziel

Hat ein Verbraucher ein Tagesziel, kommen `daily_target_kwh`, `daily_done_kwh`, `daily_forecast_kwh`
und `must_run` dazu; ohne Ziel fehlen sie ganz. Diese vier sind **immer in kWh**, auch wenn das Ziel
als Stunden eingetragen wurde — es ist die Größe, mit der die Automatik rechnet, und die Umrechnung
ist Sache der Integration: Sie hängt an derselben Nennleistung, deren Herkunft `required_source`
ausweist.

Bei einem **schaltbaren** Verbraucher kommen `daily_target_h` und `daily_done_h` hinzu — dieselben
Größen in der Einheit, in der das Ziel eingetragen wurde. Ohne sie müsste eine Anzeige durch die
Nennleistung teilen, um dem Nutzer sein eigenes Ziel wiederzuerkennen zu geben, und dazu die
Nennleistung kennen. Bei einer **modulierenden** Last fehlen sie: Sechs Stunden auf der kleinsten
Stufe und sechs auf der größten erfüllen ein Stundenziel gleich gut und unterscheiden sich um ein
Vielfaches. Sie fehlen ebenso, wenn keine Basis vorliegt — an ihrem Vorhandensein erkennt eine
Anzeige, dass Stunden die gemeinte Einheit sind, und die beiden kommen nur gemeinsam.

Es sind **Vollaststunden**, nicht die Uhr am Schalter: Läuft das Gerät unterhalb seiner
Nennleistung, kommen sie langsamer voran als die Zeit. Die tatsächliche Einschaltdauer wäre die
anschaulichere Zahl, stünde aber neben der Entscheidung statt davor — verglichen wird Energie mit
Prognose, und die Anzeige soll zeigen, was die Automatik tut.

`daily_forecast_kwh` ist `null`, wenn kein brauchbarer Prognosesensor konfiguriert ist. Das ist etwas
anderes als 0: 0 hieße „es kommt nichts mehr" und ließe jedes Tagesziel sofort auf Netzstrom laufen.
Ohne Prognose greift die Regel gar nicht.

`must_run` ist der einzige Fall, in dem die Automatik bewusst Netzstrom in Kauf nimmt — und damit die
Antwort auf „warum zieht das Gerät gerade aus dem Netz". Die Karte leitet das nicht ab: Ob sich das
Fehlende noch mit Sonne ausgeht, hängt an Prognose, Sonnenaufgang und Zählerstand.

Der Tag beginnt mit dem **Sonnenaufgang**, nicht um Mitternacht. Bei einer Anlage, deren Ertrag an
der Sonne hängt, ist das der Schnitt, der die Sache trifft.

## Der Statusbalken bei untätiger Automatik

Die Karte dämpft den Statusbalken einer Zeile auf Grau, wenn `blocked_by` einen Grund nennt, bei dem
die Automatik den Verbraucher **absichtlich liegen lässt**: `not_managed`, `unavailable`, `forced`,
`manual`. Sonst behauptet die Ampel „könnte laufen", und niemand rechnet damit, dass trotzdem nichts
geschieht.

Die Zeitbedingungen des Normalbetriebs gehören ausdrücklich **nicht** dazu — `settling`,
`turn_on_delay`, `turn_off_delay`, `min_runtime`, `min_off_time`, `level_hold`. Sie laufen bei jedem
gewöhnlichen Schaltvorgang: die Einschaltverzögerung davor, das Beruhigungsfenster danach. Wären sie
dabei, würde der Balken im Normalbetrieb dauernd grau blinken. Grau heißt „hier greift die Automatik
nicht ein", nicht „sie wartet gerade".

Der **Ampeltext** bleibt in allen Fällen unverändert: Was die Energielage hergibt, ist weiterhin
ablesbar. Nur der Balken sagt, ob damit auch etwas geschieht.

Am Überschuss-Sensor des Hubs: `grid_w`, `battery_w`, `battery_correction_w`, `battery_soc`,
`battery_min_soc`, `coverage`, `smoothing_window`, `degraded`, `errors`.

`battery_min_soc` steht dort unabhängig davon, ob die Batterie als verschiebbare Last teilnimmt —
die Grenze wirkt in der Überschussformel und damit immer. 0 heißt, dass die Regel nicht greift. Sie
ist keine Einstellung des Eintrags, sondern eine Stellgröße hinter der `min_soc`-Entität am
Speichergerät: Bei guter Vorhersage darf ein Verbraucher schon am Vormittag bei niedrigem Ladestand
anlaufen, an einem trüben Tag nicht. Gibt es keinen Ladestandssensor, gibt es weder Entität noch
Wirkung.

Am Überschuss-Sensor steht sie weiterhin, damit eine Anzeige die Formel nachvollziehen kann, ohne
die Speicher einzeln zu lesen. Sobald es mehrere gibt, ist sie die des Speichers, mit dem gerechnet
wird — die verlässliche Angabe je Speicher steht an dessen eigenem Sensor.

### Am Ampel-Sensor eines Speichers

`kind` (`battery`), `consumer_id`, `consumer_name`, `soc_entity`, `soc`, `min_soc`, `mode`,
`reserve_w`, `max_charge_w` und `shiftable`. Nimmt der Speicher an der Reihenfolge teil, kommen
`rank`, `priority`, `claim_w`, `charging_w`, `headroom_w` und `full` dazu.

`shiftable` ist der Unterschied zwischen einem Speicher, der in der Reihenfolge steht, und einem,
der bloß ein Korrekturterm in der Bilanz ist: Ohne eingetragene Ladeleistung hat er weder Rang noch
Anspruch, und genau daran erkennt eine Anzeige, dass sie ihm keine Zeile in der Reihenfolge geben
darf. Dass er dennoch einen Sensor hat, ist kein Widerspruch — er ist konfiguriert, er ist nur
nicht verschiebbar.

`consumer_id` und `consumer_name` heißen so, obwohl ein Speicher kein Verbraucher ist: Eine Anzeige
liest die Zeile eines Speichers mit demselben Code wie die eines Verbrauchers, und zwei Namen für
dasselbe Feld wären dort zwei Fälle statt einem.

`claim_w` ist die Leistung, die insgesamt für diesen Speicher zurückgelegt ist — einschließlich
einer eingetragenen `reserve_w`, die schon vor dem ersten Verbraucher abgezogen wurde.
`headroom_w` ist, was danach für tiefer priorisierte Verbraucher übrig bleibt. Ob er voll ist, sagt
`full`, und ob die Vorranggrenze gerade greift, `below_threshold`; die Karte leitet beides nicht
selbst aus dem Ladestand ab, sonst lägen zwei Schwellen nebeneinander.

Bis Integration 0.5.0b3 standen diese Angaben mit dem Präfix `battery_` am Überschuss-Sensor des
Hubs, wo genau einer Platz hatte. Sie sind dort entfallen.

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

### Die Verteilung ist greedy, und das bleibt sie

**Ein Verbraucher gibt niemals Leistung an einen niedriger priorisierten ab, auch wenn dadurch
Überschuss ungenutzt bleibt.** Das Budget läuft von oben nach unten durch die Rangfolge; wer oben
steht, nimmt so viel er kann.

Bei rein schaltbaren Verbrauchern fällt das nicht auf, weil niemand etwas teilweise abgeben kann.
Sobald ein Verbraucher in Stufen fährt, ist der Fall sichtbar:

> 4,5 kW Überschuss. Rang 1 ein Heizstab, regelbar von 1,4 bis 3,6 kW. Rang 2 eine Wallbox, die ab
> 1,4 kW laufen kann. Greedy gibt dem Heizstab 3,6 kW; die verbleibenden 0,9 kW reichen der Wallbox
> nicht, sie bleibt aus. 0,9 kW gehen ins Netz. Mit 3,1 kW am Heizstab wäre alles genutzt.

Das ist **dokumentiertes Verhalten, kein Fehler.** Die Alternative wäre ein Optimierer über alle
Ränge — damit wäre die Rangfolge keine Reihenfolge mehr, sondern ein Gewicht, und die Frage „warum
läuft dieses Gerät nicht" hätte keine Antwort mehr in einem Satz. Wer den Fall vermeiden will, setzt
über `min_power`/`max_power` engere Grenzen; das ist der vorgesehene Weg.

## Batterie als verschiebbare Last

Trägt der Nutzer in der Integration eine **maximale Ladeleistung** ein, nimmt der Speicher an
der Prioritätsreihenfolge teil — sonst bleibt sie wie bisher nur ein Korrekturterm im Überschuss.

Die Integration hängt sie dann als eigenen Rang in dieselbe Budget-Kaskade wie die Verbraucher:
Wer **über** der Batterie steht, bekommt den Überschuss zuerst und bleibt eingeschaltet; die
Batterie legt an ihrem Rang bis zu ihrer Ladeleistung zurück, abzüglich einer bereits
abgezogenen `battery_reserve_w`; nur der Rest steht Verbrauchern **unter** ihr zur Verfügung. Das ist reine Verteilung — die Batterie wird nicht angesteuert.

Die Karte stellt jeden Speicher als eigene Zeile dar (`kind: 'battery'`), gebaut aus dessen
Ampel-Sensor — derselbe Weg wie bei einem Verbraucher. Die Zeile hat **keinen Schalter** (es gibt
nichts zu schalten), aber einen Rang: über die `priority`-number lässt sie sich mitsortieren. An
der Stelle des Schalters steht die **Ladevorranggrenze**; ein Tippen darauf öffnet den Dialog der
`min_soc`-Entität, deren Schieberegler Home Assistant selbst mitbringt. Der Detail-Dialog der Zeile
führt zum Ladestandssensor (`soc_entity`).

Ein Speicher ohne eingetragene Ladeleistung bekommt keine Zeile: `shiftable` ist dann `false`, er
steht nicht in der Reihenfolge, und ein Rang wäre eine Behauptung, die die Automatik nicht einlöst.

Das Batterie-Badge im Kartenkopf setzt einen eindeutigen Ladestand voraus und erscheint deshalb nur
bei genau einem Speicher. Bei mehreren liefert die Integration keinen mehr — ein Gesamtwert bräuchte
die Kapazitäten —, und die Zeilen zeigen die einzelnen Ladestände.

Damit die Reihenfolge lückenlos bleibt, zählt die Integration die Speicher beim Vergeben der
`rank`-Werte mit: die Verbraucher-Ränge lassen ihre Positionen frei, sodass Karte und Automatik
dieselbe Abfolge zeigen.

**Unterhalb seiner Ladevorranggrenze steht ein Speicher vor allen Verbrauchern**, unabhängig von
seinem Rang. Das löst die frühere globale Sperre ab, die den ausgewiesenen Überschuss auf 0
deckelte: Bei mehreren Speichern wäre sie nicht mehr eindeutig, und sie verschwieg, wohin die
Leistung geht. Mit eingetragener Ladeleistung fordert der Speicher genau diese und gibt den Rest
weiter; ohne fordert er alles — und das ist die alte Sperre, nur sichtbar.

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

`battery_reserve_w` wird auf `battery_max_charge_w` **angerechnet**, nicht addiert: Nimmt die
Batterie als verschiebbare Last teil, fordert sie an ihrem Rang nur noch die Differenz an. Sonst
zögen zwei Felder mit derselben Bedeutung den Verbrauchern die Summe aus beidem ab.

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
