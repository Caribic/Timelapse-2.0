# Intervalometer — Time-lapse (PWA)

Bezplatná webová aplikace (PWA) sloužící jako programovatelný intervalometer
pro tvorbu time-lapse videí na iPhonu.

## Funkce
- Živý náhled kamery (přední/zadní)
- 3 režimy: cílový počet snímků / celková doba trvání / bez limitu (ruční zastavení)
- Nastavitelný interval mezi snímky
- Volba rozlišení snímků (plné / střední / nízké) kvůli paměti při dlouhých lapsech
- Živé readouty: uplynulý čas, zbývající čas, odhad délky výsledného videa
- Kruhový ciferník s průběhem (jako clona objektivu)
- Wake Lock — obrazovka nezhasne během běhu (lze vypnout)
- Export všech snímků jako ZIP
- Přímé sestavení WebM videa z nasnímaných záběrů (nastavitelné FPS)
- Sdílení výstupu přes iOS Share Sheet
- Funguje offline díky service workeru

## Důležité upozornění pro dlouhé time-lapsy
iOS uspává Safari/PWA na pozadí a při zamčené obrazovce, i s Wake Lockem.
Pro spolehlivý běh:
- nech telefon připojený k nabíječce,
- nech aplikaci na popředí (obrazovka zapnutá),
- vypni Nízkou spotřebu (Low Power Mode),
- u velmi dlouhých lapsů zvol nižší rozlišení, ať se prohlížeč nezpomalí nedostatkem paměti.

## Nasazení
Stejný postup jako u aplikace StopMotion Spoušť — nahrát soubory (včetně
podsložky `icons/`) do GitHub repozitáře, zapnout GitHub Pages, otevřít
odkaz v Safari na iPhonu a přidat na plochu.
