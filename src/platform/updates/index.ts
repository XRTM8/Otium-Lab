import type { UpdateAdapter } from '../../core/updates/types';
import * as runtime from '../runtime';
import { androidUpdateAdapter } from './android';
import { desktopUpdateAdapter } from './desktop';

/**
 * Returns the update transport for the current platform.
 */
export function getUpdateAdapter(): UpdateAdapter | null {
  const getPlatform = typeof runtime.getPlatformId === 'function' ? runtime.getPlatformId : () => 'android';
  switch (getPlatform()) {
    case 'android':
      return androidUpdateAdapter;
    case 'windows':
      return desktopUpdateAdapter;
    default:
      return androidUpdateAdapter;
  }
}
