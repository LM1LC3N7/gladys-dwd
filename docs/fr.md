# DWD (Deutscher Wetterdienst) pour Gladys

Cette intégration fait du **service météorologique national allemand**
(Deutscher Wetterdienst, DWD) le fournisseur météo de Gladys. Le widget météo
du tableau de bord et l’assistante (« quel temps fera-t-il demain ? »)
utilisent ses prévisions MOSMIX et ses observations horaires. Elle ajoute ce
qu’il faut en Allemagne : les **avertissements officiels**, l’**indice
pollinique**, l’**indice UV** et le radar de précipitations.

Rien à saisir, ni compte ni clé : tout vient des serveurs de données ouvertes
du DWD, pour la position de votre maison. Les prévisions et observations
couvrent toute l’**Europe** (environ 4 300 stations) ; les avertissements,
pollens, UV et radar couvrent l’**Allemagne**.

> Connecteur non officiel : ni affilié ni approuvé par le Deutscher
> Wetterdienst.

## Installation

1. Installez l’intégration depuis le catalogue de Gladys (Gladys 5.1 ou
   plus récent).
2. Acceptez l’accès à la **position de vos maisons** : la météo est celle de
   la maison, rien d’autre à saisir.
3. Vérifiez que votre maison est placée sur la carte (**Paramètres →
   Maisons**). Sans position, pas de météo.
4. Dans l’écran **Configuration**, cliquez sur **Tester les sources du
   DWD** : le message dit ce que chaque source a répondu (prévisions,
   avertissements, pollens) et quelles stations sont utilisées.

Une fois installée, l’intégration prend le pas sur le service OpenWeather
intégré à Gladys. Le widget météo peut aussi la choisir explicitement.

## D’où vient la météo

- **Prévisions** : la prévision ponctuelle **MOSMIX** du DWD pour la station
  la plus proche de votre maison, 10 jours heure par heure (température,
  ressenti, humidité, pression, vent et rafales, nébulosité, visibilité,
  précipitations et leur probabilité, ensoleillement). Mise à jour quatre
  fois par jour (03, 09, 15 et 21 UTC). En Allemagne il y a un point de
  prévision tous les quelques kilomètres ; ailleurs en Europe, un par grande
  ville ou aéroport.
- **Conditions actuelles** : les **observations** horaires de la station
  synoptique la plus proche (environ 630 en Europe, à 60 km au plus). Sans
  station, la prévision de l’heure en cours fait office. Le bouton « Tester »
  nomme les deux stations.
- **Avertissements** : les avertissements officiels du DWD pour la commune
  de votre maison, avec un titre traduit ; les textes sont en allemand.
- **Pollens** : l’indice pollinique du DWD de votre région.
- **Indice UV** : le maximum journalier prévu pour la plus proche de 38
  villes allemandes, réparti sur la journée selon le soleil.
- **Radar** : le composite de précipitations du DWD, 1 km, toutes les
  5 minutes.

La température ressentie est la température apparente de Steadman
(température de l’air, humidité et vent), celle du service météo australien :
le DWD n’en publie pas dans ses données ouvertes.

## Configuration

- **Avertissements officiels** (activé par défaut) — les avertissements du
  DWD en cours pour votre maison (vent, orages, pluie, neige, gel, verglas,
  brouillard, chaleur…). Ils s’affichent dans le widget météo et alimentent
  le déclencheur de scène « Alerte météo » de Gladys. Quand un avertissement
  apparaît, change de niveau ou se termine, l’intégration prévient Gladys en
  quelques minutes au lieu d’attendre sa vérification toutes les 30 minutes.
  Allemagne seulement.
- **Alertes pollens** (désactivé par défaut) — ajoute une alerte quand
  l’indice pollinique de votre région atteint une exposition moyenne (2 sur
  l’échelle du DWD), relevée en sévérité « modérée » à une exposition forte
  (3). Ce n’est pas un avertissement officiel.
- **Radar de précipitations** (activé par défaut) — une image radar de
  300 × 200 km centrée sur votre maison. Activez l’option « images du
  fournisseur » du widget météo pour la voir. Allemagne et ses frontières.
- **Station de prévision (avancé)** — vide, la station MOSMIX la plus proche
  est utilisée. Pour en forcer une autre, saisissez son identifiant du
  catalogue de stations du DWD (`10384` pour Berlin-Tempelhof, `A051` pour
  un point local).

## Le widget « Avertissements DWD »

Les avertissements en cours pour la maison, du plus sévère au moins sévère,
chacun avec :

- sa **sévérité** (mineure, modérée, sévère, extrême : les quatre niveaux du
  DWD, du jaune au violet) ;
- sa **période** (début et fin, heure locale) ;
- la **description** et les **conseils** du DWD (en allemand), dans le
  panneau de détail.

Réglage **Maison** : le nom de la maison à afficher. Vide, c’est la première
maison localisée.

## Le widget « Pollens »

L’**indice pollinique** du DWD (Pollenflug-Gefahrenindex) couvre huit
pollens : noisetier, aulne, frêne, bouleau, graminées, seigle, armoise et
ambroisie, pour 27 régions d’Allemagne, aujourd’hui, demain et après-demain.
Le widget montre :

- l’**exposition du jour** sur une jauge, avec le niveau du pollen le plus
  présent ;
- les pics de **demain** et d’**après-demain** ;
- chaque pollen présent aujourd’hui avec sa valeur et son niveau ;
- les **conseils** du niveau.

| Indice | Niveau  |
| ------ | ------- |
| 0      | Aucune  |
| 1      | Faible  |
| 2      | Moyenne |
| 3      | Forte   |

Les valeurs intermédiaires (« 1-2 ») sont arrondies au niveau supérieur.
L’indice est publié une fois par jour vers 11 h ; avant, c’est la prévision
de la veille qui s’applique.

## Scènes

Un déclencheur, vérifié toutes les 5 minutes :

- **Niveau de pollens changé** — l’indice pollinique d’une maison (son
  pollen le plus présent du jour) atteint un nouveau niveau.

Filtres, tous facultatifs :

- **Niveau atteint** — ex. « Forte ». La scène se déclenche même si l’indice
  saute ce niveau (de « aucune » à « forte »).
- **Sens** — « Aggravation » ou « Amélioration ».
- **Maison** — le nom exact de la maison dans Gladys (vide = toutes).

Les actions suivantes peuvent lire `{{triggerEvent.data.summary}}` (une
phrase prête à envoyer), `{{triggerEvent.data.pollen}}` (les pollens à ce
niveau), `{{triggerEvent.data.value}}`, `{{triggerEvent.data.current_level}}`,
etc.

Exemples : fermer les fenêtres et passer la ventilation en recyclage quand le
niveau atteint « Moyenne » pendant la saison du bouleau ; envoyer une
notification le matin quand les graminées atteignent « Forte ».

La première évaluation après un démarrage ne déclenche rien (un redémarrage
en pleine saison ne doit pas rejouer toutes les scènes). Pour les
avertissements officiels, utilisez le déclencheur **Alerte météo** de Gladys
lui-même.

## Bon à savoir

- **Hors d’Allemagne** : les prévisions et observations fonctionnent partout
  où MOSMIX a une station (toute l’Europe) ; les avertissements, pollens,
  indice UV et radar se disent indisponibles.
- Loin de toute station (en mer, hors d’Europe), l’intégration le dit dans
  l’écran Configuration.
- Les prévisions MOSMIX n’ont pas d’indice UV : il vient de la prévision
  journalière du DWD pour la ville la plus proche, à 150 km au plus.
- Quand le DWD ne répond pas, la dernière météo connue reste affichée
  jusqu’à 6 heures.
- Les données sont en cache 15 minutes (5 pour les avertissements et le
  radar, 1 heure pour les indices pollinique et UV).

## Sources et licences

Données : Deutscher Wetterdienst, données ouvertes (GeoNutzungsverordnung,
mention « Datenbasis: Deutscher Wetterdienst ») : prévisions MOSMIX,
observations horaires, avertissements, indices pollinique et UV, composite
radar ; frontières de l’image radar : GeoBasis-DE / BKG. Les conseils
polliniques sont ceux de l’intégration, pas du DWD. Cette intégration n’est
ni affiliée ni approuvée par le Deutscher Wetterdienst.
