/**
 * The icon names that ship with NYSDS.
 *
 * NYSDS bundles a curated subset of Material Symbols, not the whole set. An
 * icon name outside this list renders as empty space. Source:
 * https://designsystem.ny.gov/components/icon/ and the icon library in
 * @nysds/components 1.21.0. Update this list when a release adds icons.
 */
export const NYSDS_ICON_NAMES: ReadonlySet<string> = new Set([
  'ac_unit',
  'account_balance_filled',
  'account_circle',
  'add',
  'air',
  'arrow_back',
  'arrow_downward',
  'arrow_forward',
  'arrow_upward',
  'attach_file',
  'calendar_month',
  'cancel',
  'cancel_filled',
  'check',
  'check_circle',
  'chevron_down',
  'chevron_left',
  'chevron_right',
  'chevron_up',
  'clear_day',
  'close',
  'code',
  'content_copy',
  'coronavirus',
  'delete',
  'download',
  'download_done',
  'drive_folder_upload',
  'edit_square',
  'emergency_home',
  'error',
  'expand_all',
  'filter_alt',
  'filter_list',
  'height',
  'help',
  'info',
  'language',
  'language_filled',
  'link',
  'location_on',
  'lock_filled',
  'mail',
  'menu',
  'more_vert',
  'notifications',
  'open_in_new',
  'phone_in_talk',
  'print',
  'progress_activity',
  'publish',
  'rainy',
  'refresh',
  'remove',
  'schedule',
  'search',
  'share',
  'sms',
  'social_bluesky',
  'social_facebook',
  'social_flickr',
  'social_google_play',
  'social_instagram',
  'social_linkedin',
  'social_pinterest',
  'social_rss',
  'social_snapchat',
  'social_soundcloud',
  'social_threads',
  'social_tiktok',
  'social_tumblr',
  'social_vimeo',
  'social_x',
  'social_youtube',
  'sort',
  'straight',
  'thumb_down',
  'thumb_up',
  'upload_file',
  'visibility',
  'visibility_off',
  'warning',
]);

/** Attribute names whose values are icon names. */
export const ICON_ATTRIBUTES = ['icon', 'prefixIcon', 'suffixIcon'] as const;

/**
 * Finds icon names used in a chunk of HTML: `icon`, `prefixIcon`, and
 * `suffixIcon` attributes on any element, plus `name` on `<nys-icon>`.
 */
export function findIconNames(html: string): string[] {
  const found: string[] = [];
  const attrPattern = /\b(?:icon|prefixIcon|suffixIcon)\s*=\s*"([^"]*)"/gi;
  for (const match of html.matchAll(attrPattern)) {
    found.push(match[1]);
  }
  const nysIconPattern = /<nys-icon\b[^>]*\bname\s*=\s*"([^"]*)"/gi;
  for (const match of html.matchAll(nysIconPattern)) {
    found.push(match[1]);
  }
  return found;
}

/** Returns the icon names in `html` that NYSDS does not ship. */
export function unknownIconNames(html: string): string[] {
  return findIconNames(html).filter((name) => name !== '' && !NYSDS_ICON_NAMES.has(name));
}
