const TURKISH: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' }

/** URL slug for organization names, Turkish-aware: "Kordon Bistro Çeşme" → "kordon-bistro-cesme". */
export function slugify(value: string): string {
  const slug = value
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıiöşü]/g, ch => TURKISH[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return slug || 'isletme'
}
