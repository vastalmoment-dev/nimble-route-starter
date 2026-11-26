export type MangaFeedKind = "latest" | "popular" | "top" | "newest";

export interface MangaItem {
  id: string;
  title: string;
  coverUrl: string | null;
  coverFallbackUrl?: string | null;
  genres: string[];
  status: string | null;
  year: number | null;
  description: string;
  lastChapter: string | null;
  updatedAt: string | null;
}

export interface MangaPageSource {
  url: string;
  fallbackUrl: string;
}

export interface MangaChapter {
  id: string;
  chapter: string;
  numberValue: number;
  volume: string | null;
  title: string | null;
  pages: number;
  publishAt: string | null;
  scanlator: string | null;
}

export const MANGA_GENRE_TAGS: Record<string, string> = {
  Action: "391b0423-d847-456f-aff0-8b0cfc03066b",
  Adventure: "87cc87cd-a395-47af-b27a-93258283bbc6",
  Comedy: "4d32cc48-9f00-4cca-9b5a-a839f0764984",
  Drama: "b9af3a63-f058-46de-a9a0-e0c13906197a",
  Fantasy: "cdc58593-87dd-415e-bbc0-2ae27bf404cc",
  Horror: "cdad7e68-1419-41dd-bdce-27753074a640",
  Mystery: "ee968100-4191-4968-93d3-f82d72be7e46",
  Romance: "423e2eae-a7a2-4a8b-ac03-a8351462d71d",
  "Sci-Fi": "256c8bd9-4904-4360-bf4f-508a76d67183",
  "Slice of Life": "e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
  Sports: "69964a64-2f90-4d33-beeb-f3ed2875eb4c",
  Supernatural: "eabc5b4c-6aff-42f3-b657-3e90cbd00b75",
};
