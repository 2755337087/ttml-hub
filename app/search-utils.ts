export type SearchableSong = {
  title: string;
  artists: string[];
  album?: string;
  albums?: string[];
  aliases?: string[];
};

export function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s·・._-]+/g, "");
}

function searchTerms(query: string) {
  return query
    .trim()
    .split(/\s+/u)
    .map(normalizeSearchText)
    .filter(Boolean);
}

function songFields(song: SearchableSong) {
  return {
    title: normalizeSearchText(song.title),
    artists: song.artists.map(normalizeSearchText),
    aliases: (song.aliases ?? []).map(normalizeSearchText),
    albums: (song.albums ?? (song.album ? [song.album] : [])).map(normalizeSearchText),
  };
}

/**
 * 每个空格分隔的关键词都可以匹配不同字段，结果按歌名和艺术家相关度排序。
 */
export function searchSongs<T extends SearchableSong>(songs: T[], query: string, limit = 20): T[] {
  const terms = searchTerms(query);
  if (!terms.length) return songs.slice(0, limit);

  const compactQuery = normalizeSearchText(query);
  return songs
    .map((song, index) => {
      const fields = songFields(song);
      const all = [fields.title, ...fields.artists, ...fields.aliases, ...fields.albums];
      if (!terms.every((term) => all.some((value) => value.includes(term)))) return null;

      let score = 0;
      if (fields.title === compactQuery) score += 1_000;
      else if (fields.title.includes(compactQuery)) score += 500;
      for (const term of terms) {
        if (fields.title === term) score += 100;
        else if (fields.title.includes(term)) score += 50;
        if (fields.artists.some((artist) => artist === term)) score += 40;
        else if (fields.artists.some((artist) => artist.includes(term))) score += 30;
        if (fields.aliases.some((alias) => alias.includes(term))) score += 15;
        if (fields.albums.some((album) => album.includes(term))) score += 10;
      }
      return { song, score, index };
    })
    .filter((result): result is { song: T; score: number; index: number } => result !== null)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((result) => result.song);
}
