# QR-Code-Generator

Eine kleine, statische Website, die QR-Codes für Text/URL, WLAN, Kontakte (vCard) und E-Mail erzeugt – komplett im Browser. Live: <https://qr.aleksanderbauer.de>

## Zweck

Ein überschaubares Projekt, an dem ich Webgrundlagen (HTML, CSS, JavaScript, Barrierefreiheit, Auslieferung über einen eigenen Server) geübt habe. Nützlich ist es trotzdem: Ein WLAN-Code für Gäste oder ein Link auf einem Aushang ist in Sekunden erstellt.

## Funktionen

- **Inhaltstypen:** Text/URL, WLAN (WPA/WEP/offen, optional verstecktes Netzwerk), Kontakt als vCard 3.0, E-Mail (`mailto:` mit Betreff und Text)
- **Darstellung:** Zielgröße, Fehlerkorrektur L/M/Q/H, Vorder- und Hintergrundfarbe
- **Hinweise:** Warnung bei zu geringem Farbkontrast und bei invertierten Codes, Hinweis bei zu langem Inhalt, bei fehlendem WLAN-Passwort und bei URLs ohne `https://`
- **Export:** PNG und SVG herunterladen, PNG in die Zwischenablage kopieren (nur wenn der Browser es in einem sicheren Kontext erlaubt), Live-Vorschau, Anzeige des kodierten Inhalts
- **Bedienung:** deutsche Oberfläche, Tastaturbedienung mit sichtbarem Fokus, Sprunglink, Labels an allen Feldern, helles und dunkles Farbschema (`prefers-color-scheme`), Layout ab 375 px Breite ohne horizontales Scrollen

Eine englische Oberfläche gibt es bewusst nicht; sie wäre nur sauber mit zusätzlichem Code lösbar, und ich wollte die Datei-Struktur klein halten.

## Warum alles im Browser?

QR-Codes enthalten oft Sensibles – ein WLAN-Passwort ist das beste Beispiel. Die erste Version dieses Projekts (2025) hat dafür noch eine externe Schnittstelle (QR Server API) angefragt, also Eingaben an Dritte gesendet. Das ist die überarbeitete Fassung von 2026 nicht mehr:

- Der Code wird lokal mit einer mitgelieferten Bibliothek berechnet (siehe unten).
- Es gibt keine Anfragen an Dritte: kein CDN, keine Web-Fonts, kein Tracking, keine Analyse.
- Es wird nichts gespeichert (kein `localStorage`, keine Cookies).
- Eine Content-Security-Policy im HTML (`connect-src 'none'`, nur eigene Skripte und Styles) sorgt dafür, dass der Browser selbst unerwünschte Verbindungen blockieren würde. Sie ist ein zusätzlicher Riegel, kein Ersatz für das Weglassen des Codes.

## Aufbau

```
index.html        Seite und Formular
style.css         Gestaltung (Farbschemata, responsive, Fokus)
app.js            Logik: Inhalte bauen, Code rendern, Export
favicon.svg       Symbol
vendor/
  qrcode.js                      qrcode-generator 2.0.4, unverändert
  LICENSE-qrcode-generator.txt   Lizenz der Bibliothek (MIT)
  README.txt                     Herkunft der Datei
LICENSE           MIT-Lizenz dieses Projekts
```

Es gibt keinen Build-Schritt und keine Abhängigkeiten zur Laufzeit außer `vendor/qrcode.js`.

### Bibliothek

[`qrcode-generator`](https://github.com/kazuhikoarase/qrcode-generator) von Kazuhiko Arase, Version 2.0.4, MIT-Lizenz. Die Datei `dist/qrcode.js` aus dem npm-Paket liegt unverändert unter `vendor/`. Da das npm-Paket keine Lizenzdatei enthält, stammt der Lizenztext aus dem Upstream-Repository; Details stehen in `vendor/README.txt`. Die Bibliothek berechnet nur die Modulmatrix; SVG- und PNG-Ausgabe, UTF-8-Kodierung der Eingabe und die Inhaltsformate sind in `app.js` umgesetzt.

„QR Code“ ist eine eingetragene Marke der DENSO WAVE INCORPORATED.

## Lokal ausführen

Einfach per statischem Server, zum Beispiel:

```
python -m http.server 8000
```

und dann <http://localhost:8000> öffnen. (Direktes Öffnen von `index.html` per Doppelklick geht meist auch; das Kopieren in die Zwischenablage braucht aber `localhost` oder HTTPS.)

## Hosting

Die Dateien werden unverändert als statische Dateien von einem Caddy-Dateiserver auf meinem eigenen Linux-Server ausgeliefert, mit automatischem HTTPS. Die erste Version lief 2025 noch auf AWS (S3 + CloudFront); mit der Überarbeitung 2026 bin ich auf den eigenen Server umgezogen.

## Geprüft

Beim Bau habe ich lokal mit einem echten Browser (Chromium über Playwright) und einem unabhängigen Decoder (OpenCV `QRCodeDetector`) geprüft:

- erzeugte PNGs für URL, WLAN, vCard, E-Mail und einen Text mit Umlauten und Emoji lassen sich decodieren und ergeben exakt den erwarteten Inhalt
- ein aus dem SVG gerenderter Code lässt sich decodieren
- PNG- und SVG-Download funktionieren, Kopieren nach Zwischenablage liefert ein `image/png`
- während der Benutzung entstehen keine Anfragen außer auf die eigenen Dateien
- bei 375 px Breite gibt es in allen vier Typen kein horizontales Scrollen

Das sind manuelle Prüfungen während der Entwicklung, keine automatisierte Testsuite im Repository und keine CI. Nicht geprüft habe ich echte Scanner-Apps auf Smartphones und Bildschirmlesegeräte.

## Bekannte Grenzen

- **WLAN-Sonderfall:** Sonderzeichen in SSID und Passwort (`\ ; , : "`) werden nach dem `WIFI:`-Schema mit Backslash maskiert. Eine SSID oder ein Passwort, das ausschließlich aus Hex-Ziffern besteht, müssten manche Geräte in Anführungszeichen gesetzt bekommen, um nicht als Hex-Wert gelesen zu werden. Das setze ich nicht um, weil die Implementierungen der Scanner-Apps hier unterschiedlich sind.
- **Farben:** Der Kontrast wird nach der WCAG-Formel bewertet. Ob ein Scanner einen Code mit ungewöhnlichen Farben liest, hängt trotzdem vom Gerät ab – im Zweifel mit dem Handy testen.
- **Größe:** Das PNG hat eine ganzzahlige Modulgröße, damit es scharf bleibt; die Ausgabegröße weicht deshalb leicht von der Zielgröße ab (wird im Formular angezeigt).

## Entstehung

Dieses Projekt habe ich mit Unterstützung eines KI-Assistenten (Claude) gebaut. Ich habe Anforderungen, Aufbau und Datenschutzentscheidungen vorgegeben und das Ergebnis geprüft und getestet; Teile des Codes wurden vom Assistenten geschrieben.

## Lizenz

[MIT](LICENSE) – für den eigenen Code. Die Bibliothek unter `vendor/` steht unter ihrer eigenen MIT-Lizenz.

---

## In English

A small static website that generates QR codes for text/URL, Wi-Fi, vCard contacts and email entirely in the browser. The QR matrix is computed locally with the bundled MIT-licensed library `qrcode-generator` (v2.0.4); there are no third-party requests, no CDN, no fonts from external hosts, no tracking and no storage. Export as PNG or SVG, copy to clipboard where the browser allows it. The UI is in German only. No build step: serve the folder with any static file server (e.g. `python -m http.server`). Built with AI assistance; tested manually in Chromium and by decoding the output with OpenCV, but there is no automated test suite or CI in this repository.
