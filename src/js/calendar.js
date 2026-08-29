/**
 * Export des fêtes au format iCalendar.
 *
 * Chaque saint devient un événement d'une journée, répété tous les ans à sa
 * date de fête. Le fichier s'ouvre dans n'importe quel agenda — Apple, Google,
 * Outlook, Thunderbird — sans compte ni service tiers.
 */

/** Plie les lignes à 75 octets, comme l'exige la norme iCalendar. */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let current = '';
  for (const char of line) {
    const next = current + char;
    // Une ligne de continuation commence par une espace et compte donc un octet.
    if (new TextEncoder().encode(next).length > (out.length ? 74 : 75)) {
      out.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  out.push(current);
  return out.join('\r\n ');
}

/** Échappe les caractères que la norme réserve. */
function esc(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function stamp(date = new Date()) {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/**
 * Construit le calendrier.
 *
 * @param {Array} saints fiches à inscrire
 * @param {object} helpers accès aux noms traduits
 * @returns {string} contenu du fichier .ics
 */
export function buildCalendar(saints, { name, country, lang, title }) {
  const now = stamp();
  // Année bissextile : le 29 février existe, et la répétition annuelle le
  // reportera d'elle-même les années où il n'existe pas.
  const YEAR = 2024;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SanctiMaps//Calendrier des saints//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(title)}`,
  ];

  for (const saint of saints) {
    const [month, day] = String(saint.feast || '').split('-');
    if (!month || !day) continue;
    const start = `${YEAR}${month}${day}`;
    const end = new Date(Date.UTC(YEAR, Number(month) - 1, Number(day) + 1));
    const summary = name(saint, lang);
    const where = `${saint.city} — ${country(saint.country, lang)}`;
    const notice = typeof saint.desc === 'string'
      ? saint.desc
      : saint.desc?.[lang] || saint.desc?.fr || saint.desc?.en || '';

    lines.push(
      'BEGIN:VEVENT',
      `UID:${saint.id}@sanctimaps`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${stamp(end).slice(0, 8)}`,
      'RRULE:FREQ=YEARLY',
      fold(`SUMMARY:${esc(summary)}`),
      fold(`LOCATION:${esc(where)}`),
      notice ? fold(`DESCRIPTION:${esc(notice)}`) : null,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}

/** Propose le fichier au téléchargement. */
export function downloadCalendar(content, filename = 'saints.ics') {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
