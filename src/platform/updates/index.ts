import type { UpdateAdapter } from '../../core/updates/types';

/**
 * Returns the update transport for the current platform. Browser previews have
 * no installer, so the UI reports that updates belong to the installed app.
 */
export function getUpdateAdapter(): UpdateAdapter | null {
  // Lab builds must never install the stable application's update feed.
  return null;
}
