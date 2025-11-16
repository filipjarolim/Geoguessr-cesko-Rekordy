const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'index.html');
const OUTPUT_PATH = path.join(ROOT, 'data', 'leaderboards.json');

function cleanText(text = '') {
  return text.replace(/\s+/g, ' ').trim();
}

function readHtml() {
  return fs.readFileSync(HTML_PATH, 'utf8');
}

function ensureDataDir() {
  const dataDir = path.join(ROOT, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function parseEntries(cardEl) {
  const entries = [];
  cardEl
    .querySelectorAll('.leaderboard-red-item, .leaderboard-blue-item, .leaderboard-green-item')
    .forEach((entryEl) => {
      const spans = entryEl.querySelectorAll('span');
      if (spans.length < 3) {
        return;
      }

      const rank = cleanText(spans[0].textContent);
      const playerLink = spans[1].querySelector('a');
      const scoreLink = spans[2].querySelector('a');

      entries.push({
        rank,
        player: playerLink ? cleanText(playerLink.textContent) : cleanText(spans[1].textContent),
        playerUrl: playerLink ? playerLink.getAttribute('href') : null,
        resultLabel: cleanText(spans[2].textContent),
        resultUrl: scoreLink ? scoreLink.getAttribute('href') : null,
      });
    });

  return entries;
}

function parseCard(cardEl) {
  const headerEl = cardEl.querySelector('.leaderboard-header a');
  return {
    title: cleanText(headerEl?.textContent ?? ''),
    mapUrl: headerEl?.getAttribute('href') ?? null,
    theme: cardEl.classList.contains('leaderboard-red')
      ? 'primary'
      : cardEl.classList.contains('leaderboard-blue')
        ? 'secondary'
        : 'tertiary',
    entries: parseEntries(cardEl),
  };
}

function parseLeaderboardGroup(sectionEl) {
  const header = cleanText(sectionEl.querySelector('h2')?.textContent ?? '');
  const cards = [];

  sectionEl
    .querySelectorAll('.leaderboard-red, .leaderboard-blue, .leaderboard-green')
    .forEach((cardEl) => {
      cards.push(parseCard(cardEl));
    });

  return { header, cards };
}

function parseLeaderboardsFromHTML(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const groups = [];

  document.querySelectorAll('section').forEach((sectionEl) => {
    if (!sectionEl.id) {
      return;
    }
    const group = parseLeaderboardGroup(sectionEl);
    groups.push({ id: sectionEl.id, ...group });
  });

  return groups;
}

function run() {
  const html = readHtml();
  const groups = parseLeaderboardsFromHTML(html);

  ensureDataDir();
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ groups }, null, 2), 'utf8');
  console.log(`Extracted ${groups.length} groups to ${path.relative(ROOT, OUTPUT_PATH)}`);
}

if (require.main === module) {
  run();
}

module.exports = {
  parseLeaderboardsFromHTML,
};

