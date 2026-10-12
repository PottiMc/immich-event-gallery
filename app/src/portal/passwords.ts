/*
 * Password suggestions for new albums: two everyday words plus four digits,
 * e.g. "maple-lantern-4827" or "ahorn-laterne-4827", in the language of the
 * admin page. Easy to read out loud and type on a phone, and with ~250 words
 * per language over 500 million combinations - more than enough together
 * with the login rate limits.
 * Only ASCII letters (no umlauts) so nobody has to hunt for special keys.
 */

import crypto from 'crypto'
import type { Lang } from '../shared/i18n'

const unique = (words: string[]) => words.filter((w, i, all) => all.indexOf(w) === i)

export const WORDS: Record<Lang, string[]> = {
  en: unique([
    // Landscape
    'meadow', 'forest', 'river', 'valley', 'summit', 'canyon', 'harbor', 'island', 'lagoon', 'glacier',
    'prairie', 'orchard', 'garden', 'pond', 'brook', 'creek', 'cliff', 'dune', 'beach', 'shore', 'coast',
    'reef', 'ridge', 'plateau', 'grove', 'marsh', 'spring', 'waterfall', 'lake', 'bay', 'cove', 'trail',
    'path', 'bridge', 'tower', 'lighthouse', 'cabin', 'village', 'market', 'fountain', 'castle', 'chapel',
    'windmill', 'barn', 'pier',
    // Sky and weather
    'sunrise', 'sunset', 'rainbow', 'thunder', 'breeze', 'cloud', 'snowflake', 'frost', 'mist', 'sunshine',
    'moonlight', 'starlight', 'comet', 'aurora', 'horizon', 'twilight', 'dawn', 'noon', 'evening', 'planet',
    // Animals
    'fox', 'otter', 'badger', 'beaver', 'rabbit', 'hedgehog', 'squirrel', 'deer', 'moose', 'bison', 'falcon',
    'eagle', 'heron', 'robin', 'sparrow', 'swallow', 'owl', 'penguin', 'dolphin', 'whale', 'seal', 'turtle',
    'salmon', 'trout', 'butterfly', 'ladybug', 'bumblebee', 'firefly', 'panda', 'koala', 'lynx', 'wolf',
    'pony', 'zebra', 'giraffe', 'camel', 'llama', 'parrot', 'pelican', 'flamingo', 'toucan', 'walrus',
    'puffin', 'gecko', 'crane', 'stork', 'woodpecker', 'finch',
    // Plants
    'maple', 'oak', 'birch', 'willow', 'pine', 'cedar', 'aspen', 'linden', 'poppy', 'tulip', 'daisy', 'lily',
    'orchid', 'lavender', 'clover', 'fern', 'moss', 'ivy', 'sunflower', 'daffodil', 'magnolia', 'heather',
    'bamboo', 'cactus', 'lotus', 'jasmine', 'mint', 'basil', 'crocus', 'chestnut', 'acorn', 'palm',
    // Colors and stones
    'amber', 'coral', 'crimson', 'indigo', 'ivory', 'jade', 'scarlet', 'silver', 'golden', 'copper',
    'violet', 'teal', 'turquoise', 'emerald', 'sapphire', 'azure', 'lilac', 'saffron', 'ochre', 'pearl',
    // Things
    'lantern', 'candle', 'kite', 'balloon', 'compass', 'anchor', 'sail', 'canoe', 'kayak', 'bicycle', 'train',
    'ticket', 'postcard', 'camera', 'picture', 'album', 'journal', 'pencil', 'crayon', 'guitar', 'piano',
    'violin', 'drum', 'trumpet', 'melody', 'rhythm', 'dance', 'picnic', 'campfire', 'festival', 'parade',
    'confetti', 'ribbon', 'banner', 'puzzle', 'marble', 'button', 'pocket', 'blanket', 'pillow', 'teapot',
    // Food
    'muffin', 'pancake', 'waffle', 'cookie', 'pretzel', 'popcorn', 'cupcake', 'lemonade', 'orange', 'cherry',
    'apple', 'peach', 'plum', 'mango', 'melon', 'lemon', 'berry', 'coconut', 'almond', 'walnut', 'hazelnut',
    'honey', 'cinnamon', 'vanilla', 'caramel', 'cocoa',
    // Moods
    'sunny', 'breezy', 'gentle', 'bright', 'happy', 'jolly', 'merry', 'lucky', 'swift', 'quiet', 'cheerful',
    'brave', 'clever', 'curious', 'friendly', 'playful', 'sparkling', 'wild', 'calm', 'bold', 'mellow', 'tiny'
  ]),
  de: unique([
    // Landschaft
    'wiese', 'wald', 'fluss', 'tal', 'berg', 'gipfel', 'schlucht', 'hafen', 'insel', 'lagune', 'gletscher',
    'garten', 'teich', 'bach', 'klippe', 'strand', 'ufer', 'riff', 'delta', 'plateau', 'hain', 'moor', 'quelle',
    'wasserfall', 'see', 'bucht', 'pfad', 'weg', 'turm', 'leuchtturm', 'dorf', 'markt', 'brunnen', 'platz',
    'burg', 'kapelle', 'windrad', 'scheune', 'steg', 'lichtung', 'felsen', 'senke', 'kanal', 'allee',
    // Himmel und Wetter
    'sonne', 'mond', 'stern', 'komet', 'regenbogen', 'donner', 'brise', 'wolke', 'schnee', 'flocke', 'frost',
    'nebel', 'sonnenschein', 'mondlicht', 'sternschnuppe', 'horizont', 'morgenrot', 'abendrot', 'mittag',
    'abend', 'planet', 'polarlicht',
    // Tiere
    'fuchs', 'otter', 'dachs', 'biber', 'hase', 'igel', 'eichhorn', 'hirsch', 'elch', 'bison', 'falke', 'adler',
    'reiher', 'rotkehlchen', 'spatz', 'schwalbe', 'eule', 'pinguin', 'delfin', 'wal', 'robbe', 'lachs',
    'forelle', 'falter', 'hummel', 'panda', 'koala', 'luchs', 'wolf', 'pony', 'zebra', 'giraffe', 'kamel',
    'lama', 'papagei', 'pelikan', 'flamingo', 'tukan', 'walross', 'gecko', 'kranich', 'storch', 'specht',
    'meise', 'amsel', 'fink', 'kiebitz', 'libelle', 'schnecke', 'dohle',
    // Pflanzen
    'ahorn', 'eiche', 'birke', 'weide', 'kiefer', 'zeder', 'espe', 'linde', 'mohn', 'tulpe', 'lilie',
    'orchidee', 'lavendel', 'klee', 'farn', 'moos', 'efeu', 'sonnenblume', 'narzisse', 'magnolie', 'heide',
    'bambus', 'kaktus', 'lotus', 'jasmin', 'minze', 'basilikum', 'flieder', 'krokus', 'kastanie', 'eichel',
    'tanne', 'fichte', 'palme', 'distel', 'kamille',
    // Farben und Steine
    'bernstein', 'koralle', 'karmin', 'indigo', 'elfenbein', 'jade', 'scharlach', 'silber', 'golden',
    'kupfer', 'violett', 'petrol', 'smaragd', 'saphir', 'azur', 'lila', 'safran', 'ocker', 'purpur', 'perle',
    // Dinge
    'laterne', 'kerze', 'drachen', 'ballon', 'kompass', 'anker', 'segel', 'kanu', 'kajak', 'fahrrad', 'zug',
    'ticket', 'postkarte', 'kamera', 'bild', 'album', 'tagebuch', 'bleistift', 'kreide', 'gitarre', 'klavier',
    'geige', 'trommel', 'trompete', 'melodie', 'rhythmus', 'tanz', 'picknick', 'lagerfeuer', 'festival',
    'parade', 'konfetti', 'schleife', 'banner', 'puzzle', 'murmel', 'knopf', 'tasche', 'decke', 'kissen',
    'teekanne',
    // Essen
    'muffin', 'pfannkuchen', 'waffel', 'keks', 'brezel', 'popcorn', 'limonade', 'orange', 'kirsche', 'apfel',
    'pfirsich', 'pflaume', 'mango', 'melone', 'zitrone', 'beere', 'kokosnuss', 'mandel', 'walnuss',
    'haselnuss', 'honig', 'zimt', 'vanille', 'karamell', 'kakao',
    // Stimmung
    'sonnig', 'heiter', 'sanft', 'hell', 'froh', 'lustig', 'munter', 'flink', 'leise', 'mutig', 'klug',
    'neugierig', 'freundlich', 'verspielt', 'wild', 'ruhig', 'bunt', 'frisch', 'warm', 'klar', 'stolz', 'zart'
  ])
}

export function suggestPassword (lang: Lang = 'en'): string {
  const words = WORDS[lang] || WORDS.en
  const a = words[crypto.randomInt(words.length)]
  let b = words[crypto.randomInt(words.length)]
  while (b === a) b = words[crypto.randomInt(words.length)]
  const digits = String(crypto.randomInt(1000, 10000))
  return `${a}-${b}-${digits}`
}
