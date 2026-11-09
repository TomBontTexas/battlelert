/* Battlelert © 2011–2026 Tom Bont. All rights reserved. See LICENSE. */
/* Battlelert ship names. Every named ship is a real warship of the same type from one of the
   world's navies (the country is noted beside it), six per list and six lists per class, older
   ships first; tech level 5 draws from lists 1-2, 6 from 3-4, 7 from 5-6. No name is used by two classes. Gunboats get a fresh PT-1XX hull number
   for every job. Each ship keeps a service record in the career save (see career.js). */
(function (root) {
  "use strict";
  var BL = root.BL = root.BL || {};

  // [class id] -> six lists of six names, oldest first (two lists per tech level, 5 to 7).
  BL.SHIP_NAMES = {
    picket: [   // corvettes, guard ships and patrol vessels
      ["Gladiolus", "Sackville", "Aconit", "Gabbiano", "Uragan", "Bathurst"],          // UK, Canada, France, Italy, USSR, Australia
      ["Snowflake", "Moose Jaw", "Lobelia", "Cormorano", "Taifun", "Ballarat"],        // UK, Canada, France, Italy, USSR, Australia
      ["Asheville", "Skjold", "Flyvefisken", "Khanjar", "Göteborg", "Inhaúma"],        // US, Norway, Denmark, India, Sweden, Brazil
      ["Gallup", "Storm", "Hajen", "Kirpan", "Hamina", "Pohang"],                      // US, Norway, Denmark, India, Finland, South Korea
      ["Visby", "Heybeliada", "Lahav", "Tornio", "Gunsan", "Jaceguai"],                // Sweden, Turkey, Israel, Finland, South Korea, Brazil
      ["Helsingborg", "Büyükada", "Hanit", "Hanko", "Glimt", "Smerch"]                 // Sweden, Turkey, Israel, Finland, Norway, USSR
    ],
    destroyerEscort: [   // destroyer escorts, frigates and escort ships
      ["Samuel B. Roberts", "Shimushu", "Bayntun", "Swansea", "Parramatta", "Khukri"],                 // US, Japan, UK, Canada, Australia, India
      ["England", "Etorofu", "Loch Killin", "Van Speijk", "Lupo", "Commandant Rivière"],               // US, Japan, UK, Netherlands, Italy, France
      ["Knox", "Chikugo", "Amazon", "Kortenaer", "Maestrale", "D'Estienne d'Orves"],                   // US, Japan, UK, Netherlands, Italy, France
      ["Oliver Hazard Perry", "Halifax", "Niedersachsen", "Hydra", "Barbaros", "Espora"],              // US, Canada, Germany, Greece, Turkey, Argentina
      ["Anzac", "Talwar", "Floréal", "Santa María", "Fridtjof Nansen", "Amatola"],                     // Australia, India, France, Spain, Norway, South Africa
      ["Álvaro de Bazán", "Shivalik", "Roald Amundsen", "Spetsai", "Grecale", "Isandlwana"]            // Spain, India, Norway, Greece, Italy, South Africa
    ],
    destroyer: [
      ["Fletcher", "Glowworm", "Yukikaze", "Błyskawica", "Le Fantasque", "Haida"],                     // US, UK, Japan, Poland, France, Canada
      ["Johnston", "Cossack", "Shimakaze", "Grom", "Mogador", "Vampire"],                              // US, UK, Japan, Poland, France, Australia
      ["Laffey", "Kelly", "Fubuki", "Georg Thiele", "Lanciere", "Isaac Sweers"],                       // US, UK, Japan, Germany, Italy, Netherlands
      ["Hoel", "Jervis", "Akizuki", "Gremyashchy", "Artigliere", "Vasilefs Georgios"],                 // US, UK, Japan, USSR, Italy, Greece
      ["Arleigh Burke", "Daring", "Amatsukaze", "Sovremenny", "Rajput", "Almirante Brown"],            // US, UK, Japan, Russia, India, Argentina
      ["Zumwalt", "Dauntless", "Chevalier Paul", "Luigi Durand de la Penne", "Sejong the Great", "Kolkata"]   // US, UK, France, Italy, South Korea, India
    ],
    lightCruiser: [
      ["Ajax", "Achilles", "Jintsu", "Emden", "Gotland", "Almirante Cervera"],                         // UK, New Zealand, Japan, Germany, Sweden, Spain
      ["Sydney", "Atlanta", "Yūbari", "Königsberg", "De Ruyter", "Bartolomeo Colleoni"],               // Australia, US, Japan, Germany, Netherlands, Italy
      ["Penelope", "Juneau", "Naka", "Leipzig", "Java", "Émile Bertin"],                               // UK, US, Japan, Germany, Netherlands, France
      ["Arethusa", "Helena", "Yahagi", "Montcalm", "Duca degli Abruzzi", "Krasny Kavkaz"],             // UK, US, Japan, France, Italy, USSR
      ["Sheffield", "Cleveland", "Ōyodo", "Gloire", "Giuseppe Garibaldi", "Tre Kronor"],               // UK, US, Japan, France, Italy, Sweden
      ["Fiji", "Brooklyn", "Agano", "General Belgrano", "Sverdlov", "Almirante Grau"]                  // UK, US, Japan, Argentina, USSR, Peru
    ],
    cruiser: [   // protected and armoured cruisers
      ["Olympia", "Aurora", "Naniwa", "Esmeralda", "Zhiyuan", "Hamidiye"],                             // US, Russia, Japan, Chile, China, Ottoman Empire
      ["Charleston", "Varyag", "Yoshino", "Reina Cristina", "Novara", "Elli"],                         // US, Russia, Japan, Spain, Austria-Hungary, Greece
      ["Raleigh", "Askold", "Itsukushima", "Magdeburg", "Barroso", "Gelderland"],                      // US, Russia, Japan, Germany, Brazil, Netherlands
      ["Milwaukee", "Bogatyr", "Asama", "Dupuy de Lôme", "Varese", "Georgios Averof"],                 // US, Russia, Japan, France, Italy, Greece
      ["Glasgow", "Rurik", "Izumo", "Breslau", "Pueyrredón", "Ernest Renan"],                          // UK, Russia, Japan, Germany, Argentina, France
      ["Liverpool", "Gromoboi", "Kasuga", "Infanta María Teresa", "San Giorgio", "Sankt Georg"]        // UK, Russia, Japan, Spain, Italy, Austria-Hungary
    ],
    heavyCruiser: [
      ["Exeter", "Houston", "Furutaka", "Trento", "Duquesne", "Canarias"],                             // UK, US, Japan, Italy, France, Spain
      ["York", "Pensacola", "Aoba", "Trieste", "Suffren", "Canberra"],                                 // UK, US, Japan, Italy, France, Australia
      ["Dorsetshire", "Indianapolis", "Myōkō", "Zara", "Algérie", "Admiral Hipper"],                   // UK, US, Japan, Italy, France, Germany
      ["Norfolk", "Astoria", "Takao", "Pola", "Foch", "Prinz Eugen"],                                  // UK, US, Japan, Italy, France, Germany
      ["Devonshire", "Quincy", "Mogami", "Gorizia", "Colbert", "Blücher"],                             // UK, US, Japan, Italy, France, Germany
      ["London", "Baltimore", "Chōkai", "Bolzano", "Baleares", "Australia"]                            // UK, US, Japan, Italy, Spain, Australia
    ],
    battleship: [   // pre-dreadnoughts and the battleships of the First World War
      ["Mikasa", "Maine", "Majestic", "Potemkin", "Dingyuan", "Charlemagne"],                          // Japan, US, UK, Russia, China, France
      ["Oregon", "Canopus", "Retvizan", "Shikishima", "Wittelsbach", "Regina Margherita"],             // US, UK, Russia, Japan, Germany, Italy
      ["Texas", "Warspite", "Satsuma", "Danton", "Minas Geraes", "Rivadavia"],                         // US, UK, Japan, France, Brazil, Argentina
      ["Arizona", "Queen Elizabeth", "Fusō", "Nassau", "Viribus Unitis", "Almirante Latorre"],         // US, UK, Japan, Germany, Austria-Hungary, Chile
      ["Nevada", "Barham", "Ise", "König", "Conte di Cavour", "Gangut"],                               // US, UK, Japan, Germany, Italy, Russia
      ["Pennsylvania", "Royal Oak", "Nagato", "Bretagne", "Szent István", "España"]                    // US, UK, Japan, France, Austria-Hungary, Spain
    ],
    dreadnought: [   // the dreadnoughts, battlecruisers and fast battleships
      ["Dreadnought", "South Carolina", "Kawachi", "Von der Tann", "Dante Alighieri", "Sevastopol"],   // UK, US, Japan, Germany, Italy, Russia
      ["Invincible", "Delaware", "Kongō", "Seydlitz", "Courbet", "Yavuz"],                             // UK, US, Japan, Germany, France, Ottoman Empire
      ["Lion", "Colorado", "Haruna", "Derfflinger", "Dunkerque", "Marat"],                             // UK, US, Japan, Germany, France, USSR
      ["Hood", "North Carolina", "Kirishima", "Scharnhorst", "Richelieu", "Littorio"],                 // UK, US, Japan, Germany, France, Italy
      ["Nelson", "Massachusetts", "Musashi", "Tirpitz", "Jean Bart", "Vittorio Veneto"],               // UK, US, Japan, Germany, France, Italy
      ["Vanguard", "Missouri", "Yamato", "Bismarck", "Roma", "Sovetsky Soyuz"]                         // UK, US, Japan, Germany, Italy, USSR
    ]
  };

  BL.SHIP_PREFIX = "INS ";   // Imperial Navy Ship (a gunboat is just its PT number)

  // Each named ship's own hull number, fixed by its place in its class's list: the oldest ships
  // carry the lowest numbers (CL-101 ... CL-136). A gunboat's PT-1XX number is its name.
  BL.HULL_CODES = { picket: "DL", destroyerEscort: "DE", destroyer: "DD", lightCruiser: "CL", cruiser: "C", heavyCruiser: "CA", battleship: "BB", dreadnought: "DN" };
  BL.hullNumber = function (classId, ship) {
    var list = BL.SHIP_NAMES[classId], name = String(ship || "").replace(BL.SHIP_PREFIX, "").replace(/^TFS /, "");
    if (!list) return "";
    for (var i = 0; i < list.length; i++) {
      var k = list[i].indexOf(name);
      if (k >= 0) return BL.HULL_CODES[classId] + "-" + (101 + i * 6 + k);
    }
    return "";
  };
  // "INS Bartolomeo Colleoni CL-125"; a gunboat is just "PT-117".
  // hull: the job's own hull number (a ship that replaces one lost in action has a new one).
  BL.shipLabel = function (classId, ship, hull) { var h = hull || BL.hullNumber(classId, ship); return ship + (h ? " " + h : ""); };

  // A ship for a job: one of the twelve named ships of that class and tech level, or for a
  // gunboat a fresh hull number PT-101 ... PT-199.
  // used: names already taken ({ name: true }); a name is picked from the rest while any are left.
  BL.shipName = function (rng, classId, tl, used) {
    used = used || {};
    if (classId === "gunboat") {
      for (var i = 0, pt; i < 200; i++) { pt = "PT-1" + ("0" + rng.int([1, 99])).slice(-2); if (!used[pt]) return pt; }
      return pt;
    }
    var list = BL.SHIP_NAMES[classId];
    var k = 2 * (BL.TECH.clamp(classId, tl) - 5);
    var pool = list[k].concat(list[k + 1]).map(function (n) { return BL.SHIP_PREFIX + n; });
    var free = pool.filter(function (n) { return !used[n]; });
    return rng.pick(free.length ? free : pool);
  };
})(typeof window !== "undefined" ? window : globalThis);
