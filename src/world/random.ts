/** FNV-1a：由 OSM id（加 salt 分開唔同用途）得出穩定嘅 0 至 1 隨機值 */
export function seededRandom(id: string, salt = ''): number {
  const key = salt ? `${id}:${salt}` : id;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0xffffffff;
}
