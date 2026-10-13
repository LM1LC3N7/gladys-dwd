# DWD (Deutscher Wetterdienst) für Gladys

Diese Integration macht den **Deutschen Wetterdienst** (DWD) zum
Wetteranbieter von Gladys. Das Wetter-Widget des Dashboards und die
Assistentin („Wie wird das Wetter morgen?“) nutzen seine MOSMIX-Vorhersagen
und seine stündlichen Beobachtungen. Dazu kommt, was man in Deutschland
braucht: die **amtlichen Warnungen**, der **Pollenindex**, der **UV-Index**
und das Regenradar.

Nichts einzugeben, kein Konto, kein Schlüssel: alles kommt von den
Open-Data-Servern des DWD, für den Standort deines Zuhauses. Vorhersagen und
Beobachtungen decken ganz **Europa** ab (etwa 4.300 Stationen); Warnungen,
Pollen, UV und Radar gelten für **Deutschland**.

> Inoffizielle Anbindung: weder mit dem Deutschen Wetterdienst verbunden
> noch von ihm unterstützt.

## Installation

1. Installiere die Integration aus dem Gladys-Katalog (Gladys 5.1 oder
   neuer).
2. Erlaube den Zugriff auf den **Standort deiner Häuser**: das Wetter ist das
   des Zuhauses, sonst ist nichts einzugeben.
3. Prüfe, dass dein Zuhause auf der Karte steht (**Einstellungen →
   Zuhause**). Ohne Standort gibt es kein Wetter.
4. Klicke in der **Konfiguration** auf **DWD-Quellen testen**: die Meldung
   sagt, was jede Quelle geantwortet hat (Vorhersage, Warnungen, Pollen) und
   welche Stationen genutzt werden.
5. Optional: trage **Warnzellen** ein (Ferienhaus, Wohnort der Eltern, ein
   ganzer Landkreis) über ihre DWD-ID; der Knopf **Warnzelle suchen** findet
   Gemeinden nach Namen.

Einmal installiert, geht die Integration dem in Gladys eingebauten
OpenWeather-Dienst vor. Das Wetter-Widget kann sie auch ausdrücklich wählen.

## Woher das Wetter kommt

- **Vorhersage**: die **MOSMIX**-Punktvorhersage des DWD für die Station,
  die deinem Zuhause am nächsten liegt, 10 Tage Stunde für Stunde
  (Temperatur, gefühlte Temperatur, Luftfeuchte, Luftdruck, Wind und Böen,
  Bewölkung, Sichtweite, Niederschlag und seine Wahrscheinlichkeit,
  Sonnenschein). Vier Ausgaben am Tag (03, 09, 15 und 21 UTC). In
  Deutschland gibt es alle paar Kilometer einen Vorhersagepunkt, sonst in
  Europa einen je größerer Stadt oder Flughafen.
- **Aktuelle Werte**: die stündlichen **Beobachtungen** der nächsten
  synoptischen Station (etwa 630 in Europa, höchstens 60 km entfernt). Ohne
  eine solche gilt die Vorhersage der laufenden Stunde. Der Knopf „Testen“
  nennt beide Stationen.
- **Warnungen**: die amtlichen DWD-Warnungen für die Gemeinde deines
  Zuhauses und für die eingetragenen Warnzellen.
- **Pollen**: der Pollenindex des DWD für deine Region.
- **UV-Index**: das vorhergesagte Tagesmaximum der nächsten von 38
  deutschen Städten, nach dem Sonnenstand über den Tag verteilt.
- **Radar**: das Niederschlagskomposit des DWD, 1 km, alle 5 Minuten.

Die gefühlte Temperatur ist die scheinbare Temperatur nach Steadman
(Lufttemperatur, Feuchte und Wind), die des australischen Wetterdienstes:
der DWD veröffentlicht keine in seinen offenen Daten.

## Konfiguration

- **Amtliche Warnungen** (standardmäßig an) — die DWD-Warnungen für dein
  Zuhause (Wind, Gewitter, Regen, Schnee, Frost, Glätte, Nebel, Hitze …).
  Sie erscheinen im Wetter-Widget und speisen den Szenenauslöser
  „Wetterwarnung“ von Gladys. Erscheint eine Warnung, ändert sie ihre Stufe
  oder endet sie, sagt die Integration es Gladys binnen Minuten, statt auf
  die Prüfung alle 30 Minuten zu warten. Nur Deutschland.
- **Zusätzliche Warnzellen** (standardmäßig leer) — Warnzellen-IDs des DWD
  (9 Ziffern, durch Kommas getrennt): eine Gemeinde (IDs beginnen mit 7
  oder 8) oder ein ganzer Landkreis (IDs beginnen mit 1). Ihre Warnungen
  speisen Widget, Auslöser und Szenenaktion, nicht das Wetter der Häuser.
- **Pollenwarnungen** (standardmäßig aus) — fügt eine Warnung hinzu, wenn
  der Pollenindex deiner Region eine mittlere Belastung erreicht (2 auf der
  DWD-Skala), bei hoher Belastung (3) mit der Schwere „mäßig“. Keine
  amtliche Warnung.
- **Regenradar** (standardmäßig an) — ein Radarbild von 300 × 200 km um
  dein Zuhause. Schalte im Wetter-Widget „Bilder des Anbieters“ ein, um es
  zu sehen. Deutschland und Grenzgebiete.
- **Vorhersagestation (erweitert)** — leer wird die nächste MOSMIX-Station
  genutzt. Für eine andere ihre ID aus dem Stationskatalog des DWD
  (`10384` für Berlin-Tempelhof, `A051` für einen lokalen Punkt).

## Das Widget „DWD-Warnungen“

Für ein Zuhause in Deutschland oder eine eingetragene Warnzelle:

- zwei Kacheln, die **Stufe jetzt** und die **Stufe später** (die vier
  Stufen des DWD: 1 Wetterwarnung, 2 markantes Wetter, 3 Unwetter,
  4 extremes Unwetter);
- die aktiven Warnungen, dann die angekündigten (und die
  Vorabinformationen zu Unwettern), die schwersten zuerst, je mit
  **Zeitraum** in Ortszeit, einem **Stufen-Badge** und dem amtlichen
  **Text mit Verhaltenshinweisen** im Detailfenster; der Titel ist die
  amtliche Überschrift.

Einstellung **Zuhause oder Warnzelle**: der Name des Zuhauses oder eine
Warnzellen-ID aus der Konfiguration. Leer: das erste beobachtete Gebiet.

## Das Widget „Pollen“

Der **Pollenflug-Gefahrenindex** des DWD umfasst acht Pollen: Hasel, Erle,
Esche, Birke, Gräser, Roggen, Beifuß und Ambrosia, für 27 Regionen
Deutschlands, heute, morgen und übermorgen. Das Widget zeigt:

- die **Belastung heute** auf einer Anzeige, mit der Stufe des stärksten
  Pollens;
- die Spitzen von **morgen** und **übermorgen**;
- jeden heute fliegenden Pollen mit Wert und Stufe;
- die **Hinweise** zur Stufe.

| Index | Stufe  |
| ----- | ------ |
| 0     | Keine  |
| 1     | Gering |
| 2     | Mittel |
| 3     | Hoch   |

Zwischenwerte („1-2“) werden aufgerundet. Der Index erscheint einmal am
Tag gegen 11 Uhr; davor gilt die Vorhersage vom Vortag.

## Szenen

Drei Auslöser, alle 5 Minuten geprüft:

- **DWD-Warnung ausgegeben** — der DWD hat eine Warnung für ein Gebiet (ein
  Zuhause in Deutschland oder eine Warnzelle) ausgegeben, ihre Stufe erhöht
  oder eine Vorabinformation zur Warnung gemacht. Filter: **Gebiet** (Name
  des Zuhauses oder Zellen-ID), **Stufen** (kreuze 3 und 4 nur für Unwetter
  an), **Warnarten** (Gewitter, Wind, Regen, Schnee, Frost, Glätte,
  Tauwetter, Nebel, Hitze, UV, Sonstiges). Variablen: `title`, `type`,
  `level` (1 bis 4), `level_name`, `start`, `end` (Ortszeit, „morgen
  06:00“), `in_force`, `description` und `instruction` (die amtlichen
  Texte), `summary`, `area_name`, `house`.
- **DWD-Warnung aufgehoben** — für ein Gebiet besteht keine Warnung einer
  Art mehr: ihr Ende ist vorbei und der DWD hat sie nicht verlängert.
  Filter: Gebiet, Warnarten.
- **Pollenbelastung geändert** — der Pollenindex eines Zuhauses (sein
  stärkster Pollen des Tages) erreicht eine neue Stufe.

Warnungen werden nach Art und Stufe verglichen, nie nach der DWD-Kennung
(eine aktualisierte Warnung bekommt eine neue): eine Aktualisierung auf
gleicher Stufe löst nichts aus. Was angekündigt wurde, merkt sich die
Integration: ein Neustart löst nichts erneut aus, eine inzwischen
ausgegebene Warnung einmal.

Eine Szenenaktion:

- **Aktuelle DWD-Warnungen** — eine Zusammenfassung der aktiven und
  angekündigten Warnungen, fertig für eine Nachricht (`{{summary}}`), mit
  `count`, `current_level` und `upcoming_level` für eine folgende
  Bedingung. Feld **Gebiet**: ein Zuhause oder eine Zellen-ID, leer für
  alle.

Beispiele: Warnung der Stufe 3 oder 4 → „{{triggerEvent.data.title}},
{{triggerEvent.data.start}} – {{triggerEvent.data.end}}“ senden und die
Rollläden schließen; Wind oder Gewitter ab Stufe 2 → „Gartenmöbel
wegräumen“; jeden Morgen um 7 die Zusammenfassung des Tages auf Telegram,
wenn es eine gibt.

Pollenfilter, alle optional:

- **Erreichte Stufe** — z. B. „Hoch“. Die Szene läuft auch, wenn der Index
  diese Stufe überspringt (von „keine“ auf „hoch“).
- **Richtung** — „Verschlechterung“ oder „Besserung“.
- **Zuhause** — der genaue Name in Gladys (leer = alle).

Die folgenden Aktionen können `{{triggerEvent.data.summary}}` (ein fertiger
Satz), `{{triggerEvent.data.pollen}}` (die Pollen dieser Stufe),
`{{triggerEvent.data.value}}`, `{{triggerEvent.data.current_level}}` usw.
lesen.

Die erste Auswertung nach einem Start löst nichts aus (ein Neustart mitten
in der Saison darf nicht jede Szene wiederholen).

## Gut zu wissen

- **Außerhalb Deutschlands**: Vorhersage und Beobachtungen gehen überall,
  wo MOSMIX eine Station hat (ganz Europa); Warnungen, Pollen, UV-Index und
  Radar melden sich als nicht verfügbar.
- Weit weg von jeder Station (auf See, außerhalb Europas) sagt es die
  Integration in der Konfiguration.
- MOSMIX enthält keinen UV-Index: er kommt aus der Tagesvorhersage des DWD
  für die nächste Stadt, höchstens 150 km entfernt.
- Antwortet der DWD nicht, bleibt das letzte bekannte Wetter bis zu
  6 Stunden sichtbar.
- Die Daten werden 15 Minuten zwischengespeichert (5 für Warnungen und
  Radar, 1 Stunde für Pollen- und UV-Index).

## Quellen und Lizenzen

Daten: Deutscher Wetterdienst, Open Data (GeoNutzungsverordnung, Quelle
„Datenbasis: Deutscher Wetterdienst“): MOSMIX-Vorhersagen, stündliche
Beobachtungen, Warnungen, Pollen- und UV-Index, Radarkomposit; Grenzen im
Radarbild: GeoBasis-DE / BKG. Die Pollenhinweise stammen von der
Integration, nicht vom DWD. Diese Integration ist weder mit dem Deutschen
Wetterdienst verbunden noch von ihm unterstützt.
