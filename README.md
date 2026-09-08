# Urenregistratie PWA

Persoonlijke urenregistratie als installeerbare web-app. Alle gegevens worden lokaal op het apparaat opgeslagen. Er is geen account, database of legacy-import nodig.

## Functies

- Stopwatch die actief blijft als de app wordt gesloten.
- Veilige tussenstatus wanneer een gestopte timer nog geboekt moet worden.
- Stoppen en daarna direct een nieuwe taak starten.
- Handmatige urenregistratie.
- Afronding naar boven per 10 of 15 minuten.
- Thema's en subthema's met populariteitsteller.
- Collega's met dezelfde, gezamenlijke of individuele tijd.
- Volledige registratiehistorie.
- Totalen over alle registraties en per thema.
- Registraties per thema.
- JSON-backup exporteren en later herstellen.
- Offline gebruik na de eerste succesvolle opening.

## Publiceren met GitHub Pages vanaf alleen een iPhone

1. Pak `Urenregistratie-PWA.zip` uit in de Bestanden-app.
2. Maak op github.com een nieuwe repository, bijvoorbeeld `urenregistratie`.
3. Upload **de inhoud van de map** naar de hoofdmap van de repository. `index.html` moet dus direct in de repository staan.
4. Open in GitHub de repository-instellingen en kies **Pages**.
5. Kies bij **Build and deployment**: `Deploy from a branch`.
6. Kies branch `main` en map `/ (root)` en sla op.
7. Open de door GitHub Pages gegeven HTTPS-link in Safari op de iPhone.
8. Tik op **Deel** en kies **Zet op beginscherm** / **Voeg toe aan beginscherm**. Kies, indien getoond, **Open als webapp**.

## Belangrijk over gegevens

De uren staan in lokale browseropslag op de iPhone waarop je de app gebruikt. Ze worden niet naar GitHub gestuurd. Maak daarom geregeld via **Beheer > Backup > Exporteer backup** een JSON-backup en bewaar die bijvoorbeeld in iCloud Drive.

Als Safari/sitegegevens worden gewist, of je de app op een andere iPhone gaat gebruiken, heb je zo'n backup nodig om je registraties terug te zetten.

## Bestanden

- `index.html` - app-shell
- `styles.css` - vormgeving
- `app.js` - volledige app-logica en lokale opslag
- `manifest.webmanifest` - PWA-installatiegegevens
- `sw.js` - offline cache
- `icons/` - app-iconen
- `.nojekyll` - voorkomt Jekyll-verwerking door GitHub Pages
