// The theology/history/commentary library.
//
// VOLUMES are the files the ingestion script downloads. WORKS are what the curriculum
// cites (author + title). A work lives inside a volume; one volume can hold many works
// (e.g. Ante-Nicene Fathers Vol. 1 holds Irenaeus, Justin Martyr and the Apostolic Fathers).
//
// Every item here is public domain: all are 19th-century or earlier English translations
// or editions (Schaff's ANF/NPNF 1885-1900, Beveridge's Calvin 1845, the English Dominican
// Summa 1911-1925, etc.). Keil & Delitzsch and Lightfoot are public domain but have no
// reliable plain-text source, so they are "manual" (see scripts/library-texts/README.md).
import type { Tradition } from './types';

export type Source =
  | { type: 'gutenberg'; title: string; author: string } // looked up in the Gutenberg catalog
  | { type: 'ccel'; path: string } // e.g. "schaff/anf01" -> ccel.org/ccel/schaff/anf01
  | { type: 'manual'; hint: string }; // student/admin downloads it and drops it in scripts/library-texts/

export interface Volume {
  id: string;
  label: string; // used in citations when a chunk can't be attributed to a single work
  editor: string;
  tradition: Tradition;
  sources: Source[];
  verify: string[]; // at least one phrase must appear in the downloaded text
  priority: 'core' | 'extended';
  approxTokens: number; // rough size, for planning database space
  sourceUrl: string; // human-readable page for attribution
}

export interface Work {
  id: string;
  author: string;
  title: string;
  tradition: Tradition;
  volumes: string[];
  /** Uppercase heading text that marks where this work starts inside a shared volume. */
  headingPatterns?: string[];
}

const ccel = (path: string) => `https://ccel.org/ccel/${path}`;

const anf = (n: number, label: string, priority: 'core' | 'extended', approx = 900_000): Volume => {
  const id = `anf${String(n).padStart(2, '0')}`;
  return {
    id,
    label: `Ante-Nicene Fathers, Vol. ${n} (${label})`,
    editor: 'Alexander Roberts, James Donaldson, A. Cleveland Coxe (eds.)',
    tradition: 'Patristic',
    sources: [{ type: 'ccel', path: `schaff/${id}` }],
    verify: ['Ante-Nicene', 'ANTE-NICENE'],
    priority,
    approxTokens: approx,
    sourceUrl: ccel(`schaff/${id}`),
  };
};

const npnf = (series: 1 | 2, n: number, label: string, priority: 'core' | 'extended', approx = 900_000): Volume => {
  const id = `npnf${series}${String(n).padStart(2, '0')}`;
  return {
    id,
    label: `Nicene and Post-Nicene Fathers, Series ${series}, Vol. ${n} (${label})`,
    editor: series === 1 ? 'Philip Schaff (ed.)' : 'Philip Schaff and Henry Wace (eds.)',
    tradition: 'Patristic',
    sources: [{ type: 'ccel', path: `schaff/${id}` }],
    verify: ['Nicene', 'NICENE'],
    priority,
    approxTokens: approx,
    sourceUrl: ccel(`schaff/${id}`),
  };
};

export const VOLUMES: Volume[] = [
  // ---- Patristic: Ante-Nicene Fathers ----
  anf(1, 'Apostolic Fathers, Justin Martyr, Irenaeus', 'core'),
  anf(2, 'Hermas, Tatian, Athenagoras, Theophilus, Clement of Alexandria', 'extended'),
  anf(3, 'Tertullian I', 'core'),
  anf(4, 'Tertullian IV, Minucius Felix, Commodian, Origen', 'core'),
  anf(5, 'Hippolytus, Cyprian, Caius, Novatian', 'core'),
  anf(6, 'Gregory Thaumaturgus, Dionysius, Julius Africanus, Methodius, Arnobius', 'extended'),
  anf(7, 'Lactantius, Didache, Apostolic Constitutions', 'core'),
  anf(8, 'Twelve Patriarchs, Clementina, Apocrypha', 'extended'),
  anf(9, 'Gospel of Peter, Diatessaron, Origen on Matthew and John', 'extended'),
  anf(10, 'Bibliographic Synopsis and General Index', 'extended', 300_000),
  // ---- Patristic: Nicene and Post-Nicene Fathers, Series 1 ----
  npnf(1, 1, 'Augustine: Confessions and Letters', 'core'),
  npnf(1, 2, 'Augustine: City of God, Christian Doctrine', 'core', 1_100_000),
  npnf(1, 3, 'Augustine: On the Trinity, Doctrinal Treatises, Moral Treatises', 'core'),
  npnf(1, 4, 'Augustine: Anti-Manichaean and Anti-Donatist Writings', 'extended'),
  npnf(1, 5, 'Augustine: Anti-Pelagian Writings', 'core'),
  npnf(1, 6, 'Augustine: Sermon on the Mount, Harmony of the Gospels', 'extended'),
  npnf(1, 7, 'Augustine: Homilies on John and 1 John, Soliloquies', 'extended'),
  npnf(1, 8, 'Augustine: Expositions on the Psalms', 'extended'),
  npnf(1, 9, 'Chrysostom: On the Priesthood, Ascetic Treatises, Homilies', 'core'),
  npnf(1, 10, 'Chrysostom: Homilies on Matthew', 'extended'),
  npnf(1, 11, 'Chrysostom: Homilies on Acts and Romans', 'extended'),
  npnf(1, 12, 'Chrysostom: Homilies on 1 and 2 Corinthians', 'core'),
  npnf(1, 13, 'Chrysostom: Homilies on Galatians through Philemon', 'extended'),
  npnf(1, 14, 'Chrysostom: Homilies on John and Hebrews', 'extended'),
  // ---- Series 2 ----
  npnf(2, 1, 'Eusebius: Church History, Life of Constantine', 'core'),
  npnf(2, 2, 'Socrates and Sozomenus: Church Histories', 'extended'),
  npnf(2, 3, 'Theodoret, Jerome, Gennadius, Rufinus', 'extended'),
  npnf(2, 4, 'Athanasius: Select Works and Letters', 'core'),
  npnf(2, 5, 'Gregory of Nyssa: Dogmatic Treatises', 'extended'),
  npnf(2, 6, 'Jerome: Letters and Select Works', 'extended'),
  npnf(2, 7, 'Cyril of Jerusalem, Gregory Nazianzen', 'core'),
  npnf(2, 8, 'Basil: Letters and Select Works', 'core'),
  npnf(2, 9, 'Hilary of Poitiers, John of Damascus', 'extended'),
  npnf(2, 10, 'Ambrose: Select Works and Letters', 'core'),
  npnf(2, 11, 'Sulpitius Severus, Vincent of Lerins, John Cassian', 'core'),
  npnf(2, 12, 'Leo the Great, Gregory the Great', 'core'),
  npnf(2, 13, 'Gregory the Great II, Ephraim Syrus, Aphrahat', 'extended'),
  npnf(2, 14, 'The Seven Ecumenical Councils', 'core', 1_100_000),

  // ---- Catholic / medieval ----
  {
    id: 'anselm-works',
    label: 'St. Anselm: Proslogium, Monologium, Cur Deus Homo',
    editor: 'Sidney Norton Deane (trans., 1903)',
    tradition: 'Catholic',
    sources: [
      { type: 'gutenberg', title: 'Proslogium', author: 'Anselm' },
      { type: 'ccel', path: 'anselm/basic_works' },
    ],
    verify: ['Cur Deus Homo', 'CUR DEUS HOMO'],
    priority: 'core',
    approxTokens: 120_000,
    sourceUrl: ccel('anselm/basic_works'),
  },
  {
    id: 'aquinas-summa',
    label: 'Thomas Aquinas, Summa Theologica',
    editor: 'Fathers of the English Dominican Province (trans., 1911-1925)',
    tradition: 'Catholic',
    sources: [{ type: 'ccel', path: 'aquinas/summa' }],
    verify: ['Whether, besides philosophy, any further doctrine is required'],
    priority: 'core',
    approxTokens: 4_500_000,
    sourceUrl: ccel('aquinas/summa'),
  },
  {
    id: 'kempis-imitation',
    label: 'Thomas à Kempis, The Imitation of Christ',
    editor: 'William Benham (trans.)',
    tradition: 'Catholic',
    sources: [
      { type: 'gutenberg', title: 'The Imitation of Christ', author: 'Thomas' },
      { type: 'ccel', path: 'kempis/imitation' },
    ],
    verify: ['followeth Me', 'followeth me'],
    priority: 'core',
    approxTokens: 90_000,
    sourceUrl: ccel('kempis/imitation'),
  },
  {
    id: 'lawrence-practice',
    label: 'Brother Lawrence, The Practice of the Presence of God',
    editor: 'Conversations and letters (English trans., 1895)',
    tradition: 'Catholic',
    sources: [
      { type: 'gutenberg', title: 'The Practice of the Presence of God', author: 'Lawrence' },
      { type: 'ccel', path: 'lawrence/practice' },
    ],
    verify: ['Brother Lawrence', 'BROTHER LAWRENCE'],
    priority: 'core',
    approxTokens: 20_000,
    sourceUrl: ccel('lawrence/practice'),
  },

  // ---- Lutheran ----
  {
    id: 'luther-bondage',
    label: 'Martin Luther, The Bondage of the Will',
    editor: 'Henry Cole (trans., 1823)',
    tradition: 'Lutheran',
    sources: [
      { type: 'gutenberg', title: 'Bondage of the Will', author: 'Luther' },
      { type: 'ccel', path: 'luther/bondage' },
    ],
    verify: ['Erasmus', 'ERASMUS'],
    priority: 'core',
    approxTokens: 200_000,
    sourceUrl: ccel('luther/bondage'),
  },
  {
    id: 'luther-small-catechism',
    label: "Martin Luther, The Small Catechism",
    editor: 'English trans. (public domain edition)',
    tradition: 'Lutheran',
    sources: [
      { type: 'gutenberg', title: 'Small Catechism', author: 'Luther' },
      { type: 'ccel', path: 'luther/smallcat' },
    ],
    verify: ['What does this mean', 'What is this'],
    priority: 'core',
    approxTokens: 15_000,
    sourceUrl: 'https://www.gutenberg.org/ebooks/search/?query=luther+small+catechism',
  },
  {
    id: 'luther-large-catechism',
    label: 'Martin Luther, The Large Catechism',
    editor: 'F. Bente and W. H. T. Dau (trans., 1921)',
    tradition: 'Lutheran',
    sources: [
      { type: 'gutenberg', title: 'Large Catechism', author: 'Luther' },
      { type: 'ccel', path: 'luther/largecatechism' },
    ],
    verify: ['Commandment', 'COMMANDMENT'],
    priority: 'core',
    approxTokens: 60_000,
    sourceUrl: 'https://www.gutenberg.org/ebooks/search/?query=luther+large+catechism',
  },
  {
    id: 'keil-delitzsch',
    label: 'C. F. Keil and F. Delitzsch, Biblical Commentary on the Old Testament',
    editor: 'T. & T. Clark English translation (1866-1891)',
    tradition: 'Lutheran',
    sources: [{ type: 'manual', hint: 'Download the plain-text (OCR) volumes from archive.org (search "Keil Delitzsch Biblical Commentary on the Old Testament") and save them combined as scripts/library-texts/keil-delitzsch.txt' }],
    verify: ['Keil', 'KEIL', 'Delitzsch'],
    priority: 'extended',
    approxTokens: 6_000_000,
    sourceUrl: 'https://archive.org/search?query=Keil+Delitzsch+Biblical+Commentary+Old+Testament',
  },

  // ---- Reformed ----
  {
    id: 'calvin-institutes',
    label: 'John Calvin, Institutes of the Christian Religion',
    editor: 'Henry Beveridge (trans., 1845)',
    tradition: 'Reformed',
    sources: [{ type: 'ccel', path: 'calvin/institutes' }],
    verify: ['knowledge of God and of ourselves'],
    priority: 'core',
    approxTokens: 800_000,
    sourceUrl: ccel('calvin/institutes'),
  },
  ...[1, 2, 3].map(
    (n): Volume => ({
      id: `hodge-st${n}`,
      label: `Charles Hodge, Systematic Theology, Vol. ${n}`,
      editor: 'Charles Hodge (1871-1873)',
      tradition: 'Reformed',
      sources: [{ type: 'ccel', path: `hodge/theology${n}` }],
      verify: ['HODGE', 'Hodge', 'THEOLOGY'],
      priority: 'core',
      approxTokens: 700_000,
      sourceUrl: ccel(`hodge/theology${n}`),
    }),
  ),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(
    (n): Volume => ({
      id: `schaff-hcc${n}`,
      label: `Philip Schaff, History of the Christian Church, Vol. ${n}`,
      editor: 'Philip Schaff (1858-1892)',
      tradition: 'Reformed',
      sources: [{ type: 'ccel', path: `schaff/hcc${n}` }],
      verify: ['History of the Christian Church', 'HISTORY OF THE CHRISTIAN CHURCH', 'Schaff'],
      priority: 'core',
      approxTokens: 700_000,
      sourceUrl: ccel(`schaff/hcc${n}`),
    }),
  ),
  ...[1, 2, 3].map(
    (n): Volume => ({
      id: `schaff-creeds${n}`,
      label: `Philip Schaff, The Creeds of Christendom, Vol. ${n}`,
      editor: 'Philip Schaff (1877)',
      tradition: 'Reformed',
      sources: [{ type: 'ccel', path: `schaff/creeds${n}` }],
      verify: ['Creeds of Christendom', 'CREEDS OF CHRISTENDOM', 'Creed'],
      priority: 'core',
      approxTokens: 500_000,
      sourceUrl: ccel(`schaff/creeds${n}`),
    }),
  ),
  ...[1, 2, 3, 4, 5, 6].map(
    (n): Volume => ({
      id: `henry-mhc${n}`,
      label: `Matthew Henry, Commentary on the Whole Bible, Vol. ${n} (${['Genesis-Deuteronomy', 'Joshua-Esther', 'Job-Song of Solomon', 'Isaiah-Malachi', 'Matthew-John', 'Acts-Revelation'][n - 1]})`,
      editor: 'Matthew Henry (1706-1721)',
      tradition: 'Reformed',
      sources: [{ type: 'ccel', path: `henry/mhc${n}` }],
      verify: ['Henry', 'HENRY'],
      priority: n >= 5 ? 'core' : 'extended',
      approxTokens: 1_400_000,
      sourceUrl: ccel(`henry/mhc${n}`),
    }),
  ),
  {
    id: 'jfb-commentary',
    label: 'Jamieson, Fausset and Brown, Commentary Critical and Explanatory on the Whole Bible',
    editor: 'Robert Jamieson, A. R. Fausset, David Brown (1871)',
    tradition: 'Reformed',
    sources: [
      { type: 'gutenberg', title: 'Commentary Critical and Explanatory', author: 'Jamieson' },
      { type: 'ccel', path: 'jamieson/jfb' },
    ],
    verify: ['Jamieson', 'JAMIESON', 'Fausset'],
    priority: 'core',
    approxTokens: 3_000_000,
    sourceUrl: ccel('jamieson/jfb'),
  },
  {
    id: 'spurgeon-lectures',
    label: 'C. H. Spurgeon, Lectures to My Students',
    editor: 'C. H. Spurgeon (1875-1894)',
    tradition: 'Reformed',
    sources: [
      { type: 'gutenberg', title: 'Lectures to My Students', author: 'Spurgeon' },
      { type: 'ccel', path: 'spurgeon/lectures' },
    ],
    verify: ['Lectures to My Students', 'LECTURES TO MY STUDENTS', 'lectures'],
    priority: 'core',
    approxTokens: 250_000,
    sourceUrl: ccel('spurgeon/lectures'),
  },

  // ---- Wesleyan / Arminian ----
  {
    id: 'wesley-sermons',
    label: 'John Wesley, Sermons on Several Occasions (the Standard Sermons)',
    editor: 'John Wesley (1746-1760; Thomas Jackson ed., 1872)',
    tradition: 'Wesleyan',
    sources: [
      { type: 'ccel', path: 'wesley/sermons' },
      { type: 'gutenberg', title: 'Sermons on Several Occasions', author: 'Wesley' },
    ],
    verify: ['Salvation by Faith', 'SALVATION BY FAITH'],
    priority: 'core',
    approxTokens: 1_100_000,
    sourceUrl: ccel('wesley/sermons'),
  },
  {
    id: 'wesley-perfection',
    label: 'John Wesley, A Plain Account of Christian Perfection',
    editor: 'John Wesley (1766)',
    tradition: 'Wesleyan',
    sources: [
      { type: 'gutenberg', title: 'Plain Account of Christian Perfection', author: 'Wesley' },
      { type: 'ccel', path: 'wesley/perfection' },
    ],
    verify: ['perfection', 'PERFECTION'],
    priority: 'core',
    approxTokens: 50_000,
    sourceUrl: ccel('wesley/perfection'),
  },
  ...[1, 2, 3].map(
    (n): Volume => ({
      id: `arminius-works${n}`,
      label: `The Works of James Arminius, Vol. ${n}`,
      editor: 'James Nichols and W. R. Bagnall (trans., 1825-1853)',
      tradition: 'Other',
      sources: [{ type: 'ccel', path: `arminius/works${n}` }],
      verify: ['Arminius', 'ARMINIUS'],
      priority: 'core',
      approxTokens: 600_000,
      sourceUrl: ccel(`arminius/works${n}`),
    }),
  ),

  // ---- Other ----
  {
    id: 'edersheim-life',
    label: 'Alfred Edersheim, The Life and Times of Jesus the Messiah',
    editor: 'Alfred Edersheim (1883)',
    tradition: 'Other',
    sources: [
      { type: 'ccel', path: 'edersheim/lifetimes' },
      { type: 'gutenberg', title: 'Life and Times of Jesus the Messiah', author: 'Edersheim' },
    ],
    verify: ['Messiah', 'MESSIAH'],
    priority: 'core',
    approxTokens: 700_000,
    sourceUrl: ccel('edersheim/lifetimes'),
  },
  {
    id: 'lightfoot-epistles',
    label: "J. B. Lightfoot, Commentaries on Galatians, Philippians, and Colossians and Philemon",
    editor: 'J. B. Lightfoot (1865-1875)',
    tradition: 'Other',
    sources: [{ type: 'manual', hint: 'Download the plain-text (OCR) editions of Lightfoot\'s "Saint Paul\'s Epistle to the Galatians", "...to the Philippians" and "...to the Colossians and to Philemon" from archive.org and save them combined as scripts/library-texts/lightfoot-epistles.txt' }],
    verify: ['Lightfoot', 'LIGHTFOOT', 'Galatians'],
    priority: 'extended',
    approxTokens: 600_000,
    sourceUrl: 'https://archive.org/search?query=Lightfoot+Epistle+Galatians',
  },
];

const w = (id: string, author: string, title: string, tradition: Tradition, volumes: string[], headingPatterns?: string[]): Work => ({
  id,
  author,
  title,
  tradition,
  volumes,
  headingPatterns,
});

export const WORKS: Work[] = [
  // Apostolic Fathers & ante-Nicene
  w('clement-1', 'Clement of Rome', 'First Epistle to the Corinthians', 'Patristic', ['anf01'], ['FIRST EPISTLE OF CLEMENT', 'THE FIRST EPISTLE OF CLEMENT TO THE CORINTHIANS']),
  w('ignatius-epistles', 'Ignatius of Antioch', 'Epistles', 'Patristic', ['anf01'], ['EPISTLE OF IGNATIUS', 'THE EPISTLE OF IGNATIUS']),
  w('polycarp-philippians', 'Polycarp', 'Epistle to the Philippians', 'Patristic', ['anf01'], ['EPISTLE OF POLYCARP']),
  w('martyrdom-polycarp', 'Church of Smyrna', 'The Martyrdom of Polycarp', 'Patristic', ['anf01'], ['MARTYRDOM OF POLYCARP', 'THE MARTYRDOM OF POLYCARP']),
  w('diognetus', 'Mathetes', 'Epistle to Diognetus', 'Patristic', ['anf01'], ['EPISTLE OF MATHETES TO DIOGNETUS', 'MATHETES']),
  w('barnabas', 'Barnabas (attributed)', 'Epistle of Barnabas', 'Patristic', ['anf01'], ['EPISTLE OF BARNABAS', 'THE EPISTLE OF BARNABAS']),
  w('justin-first-apology', 'Justin Martyr', 'First Apology', 'Patristic', ['anf01'], ['FIRST APOLOGY', 'THE FIRST APOLOGY OF JUSTIN']),
  w('justin-second-apology', 'Justin Martyr', 'Second Apology', 'Patristic', ['anf01'], ['SECOND APOLOGY', 'THE SECOND APOLOGY OF JUSTIN']),
  w('justin-trypho', 'Justin Martyr', 'Dialogue with Trypho', 'Patristic', ['anf01'], ['DIALOGUE WITH TRYPHO', 'DIALOGUE OF JUSTIN']),
  w('irenaeus-heresies', 'Irenaeus', 'Against Heresies', 'Patristic', ['anf01'], ['AGAINST HERESIES', 'IRENÆUS AGAINST HERESIES', 'IRENAEUS AGAINST HERESIES']),
  w('tertullian-apology', 'Tertullian', 'Apology', 'Patristic', ['anf03'], ['THE APOLOGY', 'APOLOGY']),
  w('tertullian-prescription', 'Tertullian', 'The Prescription Against Heretics', 'Patristic', ['anf03'], ['PRESCRIPTION AGAINST HERETICS', 'THE PRESCRIPTION AGAINST HERETICS']),
  w('tertullian-praxeas', 'Tertullian', 'Against Praxeas', 'Patristic', ['anf03'], ['AGAINST PRAXEAS']),
  w('tertullian-baptism', 'Tertullian', 'On Baptism', 'Patristic', ['anf03'], ['ON BAPTISM', 'OF BAPTISM']),
  w('origen-principles', 'Origen', 'De Principiis', 'Patristic', ['anf04'], ['DE PRINCIPIIS', 'ORIGEN DE PRINCIPIIS']),
  w('origen-celsus', 'Origen', 'Against Celsus', 'Patristic', ['anf04'], ['AGAINST CELSUS', 'ORIGEN AGAINST CELSUS']),
  w('cyprian-unity', 'Cyprian', 'On the Unity of the Church', 'Patristic', ['anf05'], ['ON THE UNITY OF THE CHURCH', 'THE UNITY OF THE CHURCH']),
  w('hippolytus-tradition', 'Hippolytus', 'Refutation of All Heresies', 'Patristic', ['anf05'], ['REFUTATION OF ALL HERESIES', 'THE REFUTATION OF ALL HERESIES']),
  w('didache', 'Anonymous', 'The Didache (Teaching of the Twelve Apostles)', 'Patristic', ['anf07'], ['TEACHING OF THE TWELVE APOSTLES', 'THE TEACHING OF THE TWELVE APOSTLES']),
  w('lactantius-institutes', 'Lactantius', 'The Divine Institutes', 'Patristic', ['anf07'], ['DIVINE INSTITUTES', 'THE DIVINE INSTITUTES']),
  // Augustine (NPNF1)
  w('augustine-confessions', 'Augustine', 'Confessions', 'Patristic', ['npnf101'], ['CONFESSIONS', 'THE CONFESSIONS']),
  w('augustine-city-of-god', 'Augustine', 'City of God', 'Patristic', ['npnf102'], ['CITY OF GOD', 'THE CITY OF GOD']),
  w('augustine-christian-doctrine', 'Augustine', 'On Christian Doctrine', 'Patristic', ['npnf102'], ['ON CHRISTIAN DOCTRINE', 'CHRISTIAN DOCTRINE']),
  w('augustine-trinity', 'Augustine', 'On the Trinity', 'Patristic', ['npnf103'], ['ON THE TRINITY']),
  w('augustine-enchiridion', 'Augustine', 'Enchiridion', 'Patristic', ['npnf103'], ['ENCHIRIDION', 'THE ENCHIRIDION']),
  w('augustine-nature-grace', 'Augustine', 'On Nature and Grace', 'Patristic', ['npnf105'], ['ON NATURE AND GRACE']),
  w('augustine-spirit-letter', 'Augustine', 'On the Spirit and the Letter', 'Patristic', ['npnf105'], ['ON THE SPIRIT AND THE LETTER']),
  w('augustine-predestination', 'Augustine', 'On the Predestination of the Saints', 'Patristic', ['npnf105'], ['ON THE PREDESTINATION OF THE SAINTS', 'PREDESTINATION OF THE SAINTS']),
  // Chrysostom
  w('chrysostom-priesthood', 'John Chrysostom', 'On the Priesthood', 'Patristic', ['npnf109'], ['ON THE PRIESTHOOD', 'TREATISE ON THE PRIESTHOOD']),
  w('chrysostom-1cor', 'John Chrysostom', 'Homilies on First Corinthians', 'Patristic', ['npnf112'], ['HOMILIES ON THE FIRST EPISTLE OF ST. PAUL THE APOSTLE TO THE CORINTHIANS', 'FIRST CORINTHIANS']),
  // NPNF2
  w('eusebius-history', 'Eusebius', 'Church History', 'Patristic', ['npnf201'], ['CHURCH HISTORY', 'THE CHURCH HISTORY OF EUSEBIUS']),
  w('eusebius-constantine', 'Eusebius', 'Life of Constantine', 'Patristic', ['npnf201'], ['LIFE OF CONSTANTINE', 'THE LIFE OF CONSTANTINE']),
  w('athanasius-incarnation', 'Athanasius', 'On the Incarnation of the Word', 'Patristic', ['npnf204'], ['ON THE INCARNATION', 'DE INCARNATIONE']),
  w('athanasius-arians', 'Athanasius', 'Discourses Against the Arians', 'Patristic', ['npnf204'], ['AGAINST THE ARIANS', 'FOUR DISCOURSES AGAINST THE ARIANS']),
  w('athanasius-antony', 'Athanasius', 'Life of Antony', 'Patristic', ['npnf204'], ['LIFE OF ANTONY', 'LIFE OF ST. ANTONY', 'VITA S. ANTONI']),
  w('cyril-lectures', 'Cyril of Jerusalem', 'Catechetical Lectures', 'Patristic', ['npnf207'], ['CATECHETICAL LECTURES', 'CATECHETICAL LECTURE']),
  w('gregory-nazianzen-orations', 'Gregory of Nazianzus', 'Theological Orations', 'Patristic', ['npnf207'], ['THEOLOGICAL ORATION', 'THE THEOLOGICAL ORATIONS']),
  w('basil-spirit', 'Basil of Caesarea', 'On the Holy Spirit', 'Patristic', ['npnf208'], ['ON THE SPIRIT', 'DE SPIRITU SANCTO', 'ON THE HOLY SPIRIT']),
  w('ambrose-duties', 'Ambrose', 'On the Duties of the Clergy', 'Patristic', ['npnf210'], ['DUTIES OF THE CLERGY', 'ON THE DUTIES OF THE CLERGY']),
  w('vincent-commonitory', 'Vincent of Lérins', 'Commonitory', 'Patristic', ['npnf211'], ['COMMONITORY', 'THE COMMONITORY']),
  w('cassian-conferences', 'John Cassian', 'Conferences', 'Patristic', ['npnf211'], ['CONFERENCES', 'THE CONFERENCES']),
  w('leo-tome', 'Leo the Great', 'Letters (including the Tome)', 'Patristic', ['npnf212'], ['LETTERS OF LEO', 'LEO THE GREAT']),
  w('gregory-pastoral-rule', 'Gregory the Great', 'Pastoral Rule', 'Patristic', ['npnf212'], ['PASTORAL RULE', 'BOOK OF PASTORAL RULE', 'THE BOOK OF PASTORAL RULE']),
  w('ecumenical-councils', 'Henry R. Percival (ed.)', 'The Seven Ecumenical Councils', 'Patristic', ['npnf214'], ['SEVEN ECUMENICAL COUNCILS', 'THE SEVEN ECUMENICAL COUNCILS']),
  // Medieval / Catholic
  w('anselm-proslogion', 'Anselm', 'Proslogion', 'Catholic', ['anselm-works'], ['PROSLOGIUM', 'PROSLOGION']),
  w('anselm-cur-deus-homo', 'Anselm', 'Cur Deus Homo', 'Catholic', ['anselm-works'], ['CUR DEUS HOMO']),
  w('aquinas-summa', 'Thomas Aquinas', 'Summa Theologica', 'Catholic', ['aquinas-summa']),
  w('kempis-imitation', 'Thomas à Kempis', 'The Imitation of Christ', 'Catholic', ['kempis-imitation']),
  w('lawrence-practice', 'Brother Lawrence', 'The Practice of the Presence of God', 'Catholic', ['lawrence-practice']),
  // Lutheran
  w('luther-bondage', 'Martin Luther', 'The Bondage of the Will', 'Lutheran', ['luther-bondage']),
  w('luther-small-catechism', 'Martin Luther', 'Small Catechism', 'Lutheran', ['luther-small-catechism']),
  w('luther-large-catechism', 'Martin Luther', 'Large Catechism', 'Lutheran', ['luther-large-catechism']),
  w('keil-delitzsch', 'C. F. Keil and F. Delitzsch', 'Biblical Commentary on the Old Testament', 'Lutheran', ['keil-delitzsch']),
  // Reformed
  w('calvin-institutes', 'John Calvin', 'Institutes of the Christian Religion', 'Reformed', ['calvin-institutes']),
  w('hodge-systematic', 'Charles Hodge', 'Systematic Theology', 'Reformed', ['hodge-st1', 'hodge-st2', 'hodge-st3']),
  w('schaff-history', 'Philip Schaff', 'History of the Christian Church', 'Reformed', ['schaff-hcc1', 'schaff-hcc2', 'schaff-hcc3', 'schaff-hcc4', 'schaff-hcc5', 'schaff-hcc6', 'schaff-hcc7', 'schaff-hcc8']),
  w('schaff-creeds', 'Philip Schaff', 'The Creeds of Christendom', 'Reformed', ['schaff-creeds1', 'schaff-creeds2', 'schaff-creeds3']),
  w('henry-commentary', 'Matthew Henry', 'Commentary on the Whole Bible', 'Reformed', ['henry-mhc1', 'henry-mhc2', 'henry-mhc3', 'henry-mhc4', 'henry-mhc5', 'henry-mhc6']),
  w('jfb-commentary', 'Jamieson, Fausset and Brown', 'Commentary Critical and Explanatory on the Whole Bible', 'Reformed', ['jfb-commentary']),
  w('spurgeon-lectures', 'C. H. Spurgeon', 'Lectures to My Students', 'Reformed', ['spurgeon-lectures']),
  // Wesleyan / Arminian
  w('wesley-sermons', 'John Wesley', 'Sermons on Several Occasions', 'Wesleyan', ['wesley-sermons']),
  w('wesley-perfection', 'John Wesley', 'A Plain Account of Christian Perfection', 'Wesleyan', ['wesley-perfection']),
  w('arminius-works', 'James Arminius', 'Works', 'Other', ['arminius-works1', 'arminius-works2', 'arminius-works3']),
  // Other
  w('edersheim-life', 'Alfred Edersheim', 'The Life and Times of Jesus the Messiah', 'Other', ['edersheim-life']),
  w('lightfoot-epistles', 'J. B. Lightfoot', 'Commentaries on Galatians, Philippians, Colossians and Philemon', 'Other', ['lightfoot-epistles']),
];

export const VOLUME_BY_ID: Record<string, Volume> = Object.fromEntries(VOLUMES.map((v) => [v.id, v]));
export const WORK_BY_ID: Record<string, Work> = Object.fromEntries(WORKS.map((x) => [x.id, x]));

const key = (author: string, title: string) => `${author}`.toLowerCase().trim() + '|' + `${title}`.toLowerCase().trim();
const WORK_BY_KEY = new Map(WORKS.map((x) => [key(x.author, x.title), x]));

export function findWork(author: string, title: string): Work | undefined {
  return WORK_BY_KEY.get(key(author, title));
}

/** Works whose text lives in exactly this one volume and nothing else. */
export function worksInVolume(volumeId: string): Work[] {
  return WORKS.filter((x) => x.volumes.includes(volumeId));
}
