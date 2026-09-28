/*
 * Password suggestions for new albums: two wine-themed words plus four digits,
 * e.g. "riesling-karaffe-4827". Easy to read out loud and type on a phone,
 * and with ~200 words about 400 million combinations - more than enough
 * together with the login rate limits.
 * Only ASCII letters so nobody has to hunt for umlauts.
 */

import crypto from 'crypto'

export const WORDS = [
  // Rebsorten
  'riesling', 'silvaner', 'kerner', 'dornfelder', 'lemberger', 'trollinger', 'muskateller', 'scheurebe',
  'bacchus', 'regent', 'portugieser', 'elbling', 'auxerrois', 'chardonnay', 'merlot', 'syrah', 'malbec',
  'sauvignon', 'cabernet', 'gamay', 'tempranillo', 'rivaner', 'huxel', 'ortega', 'solaris', 'cabertin',
  'acolon', 'dunkelfelder', 'domina', 'rondo', 'nobling', 'optima', 'sieger', 'faberrebe', 'johanniter',
  // Regionen, Orte, Landschaft
  'mosel', 'saar', 'ruwer', 'pfalz', 'nahe', 'baden', 'franken', 'ahr', 'rheingau', 'wachau', 'kaiserstuhl',
  'hunsrueck', 'eifel', 'schiefer', 'muschelkalk', 'loess', 'basalt', 'granit', 'terrasse', 'steilhang',
  'weinberg', 'lage', 'sonnenuhr', 'ufer', 'tal', 'hoehe', 'aussicht', 'wanderweg', 'pfad', 'bruecke',
  'burg', 'kapelle', 'dorf', 'marktplatz', 'brunnen', 'garten', 'wiese', 'waldrand', 'fluss', 'quelle',
  // Keller & Handwerk
  'keller', 'fass', 'barrique', 'gewoelbe', 'presse', 'kelter', 'most', 'lese', 'winzer', 'rebe', 'traube',
  'beere', 'ranke', 'blatt', 'knospe', 'bluete', 'wurzel', 'stock', 'jahrgang', 'etikett', 'korken',
  'flasche', 'magnum', 'karaffe', 'dekanter', 'roemer', 'kelch', 'glas', 'schoppen', 'viertel', 'krug',
  'tonkrug', 'probe', 'verkostung', 'spucknapf', 'sommelier', 'kellermeister',
  // Geschmack
  'bouquet', 'abgang', 'tannin', 'frucht', 'mineral', 'saeure', 'suesse', 'fruchtig', 'feinherb',
  'trocken', 'lieblich', 'spritzig', 'samtig', 'kernig', 'elegant', 'kraftvoll', 'duftig', 'saftig',
  'pfirsich', 'aprikose', 'quitte', 'apfel', 'birne', 'zitrone', 'limette', 'grapefruit', 'kirsche',
  'brombeere', 'himbeere', 'johannisbeere', 'pflaume', 'holunder', 'vanille', 'zimt', 'nelke', 'pfeffer',
  'honig', 'mandel', 'haselnuss', 'walnuss', 'karamell', 'toffee', 'kakao', 'minze', 'salbei', 'thymian',
  // Genuss & Geselligkeit
  'sekt', 'perlage', 'secco', 'federweisser', 'schorle', 'rose', 'weissherbst', 'rotling', 'eiswein',
  'spaetlese', 'auslese', 'kabinett', 'picknick', 'brotzeit', 'flammkuchen', 'zwiebelkuchen', 'kaese',
  'brezel', 'oliven', 'baguette', 'trueffel', 'strauss', 'besen', 'weinfest', 'hoffest', 'feierabend',
  'sonnenschein', 'abendrot', 'herbst', 'sommer', 'fruehling', 'lagerfeuer', 'laterne', 'kerze',
  'prost', 'zum wohl', 'genuss', 'freunde', 'lachen', 'musik', 'tanz', 'erinnerung', 'augenblick'
].map(w => w.replace(/\s+/g, '')).filter((w, i, all) => all.indexOf(w) === i)

export function suggestPassword (): string {
  const a = WORDS[crypto.randomInt(WORDS.length)]
  let b = WORDS[crypto.randomInt(WORDS.length)]
  while (b === a) b = WORDS[crypto.randomInt(WORDS.length)]
  const digits = String(crypto.randomInt(1000, 10000))
  return `${a}-${b}-${digits}`
}
