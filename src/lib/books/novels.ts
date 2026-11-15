// Public-domain novels from Project Gutenberg — free and legal to download.
export type Novel = { id: number; title: string; author: string; genre: string; synopsis: string };

export const NOVEL_GENRES = ["All", "Classics", "Romance", "Adventure", "Mystery", "Horror", "Sci-Fi", "Fantasy"] as const;

export const NOVELS: Novel[] = [
  { id: 1342, title: "Pride and Prejudice", author: "Jane Austen", genre: "Romance", synopsis: "Elizabeth Bennet and the proud Mr. Darcy clash, misjudge each other and slowly fall in love." },
  { id: 1260, title: "Jane Eyre", author: "Charlotte Brontë", genre: "Romance", synopsis: "An orphan governess finds love and dark secrets at Thornfield Hall." },
  { id: 768, title: "Wuthering Heights", author: "Emily Brontë", genre: "Romance", synopsis: "A wild, obsessive love between Heathcliff and Catherine haunts two families." },
  { id: 158, title: "Emma", author: "Jane Austen", genre: "Romance", synopsis: "A clever matchmaker meddles in everyone's love life except her own." },
  { id: 84, title: "Frankenstein", author: "Mary Shelley", genre: "Horror", synopsis: "A young scientist creates life and is hunted by the creature he abandons." },
  { id: 345, title: "Dracula", author: "Bram Stoker", genre: "Horror", synopsis: "A Transylvanian count travels to England, and a small band sets out to stop him." },
  { id: 43, title: "Strange Case of Dr Jekyll and Mr Hyde", author: "Robert Louis Stevenson", genre: "Horror", synopsis: "A respected doctor hides a monstrous second self." },
  { id: 174, title: "The Picture of Dorian Gray", author: "Oscar Wilde", genre: "Classics", synopsis: "A young man stays beautiful while his portrait ages with every sin." },
  { id: 1661, title: "The Adventures of Sherlock Holmes", author: "Arthur Conan Doyle", genre: "Mystery", synopsis: "Twelve cases solved by the world's most famous detective." },
  { id: 2852, title: "The Hound of the Baskervilles", author: "Arthur Conan Doyle", genre: "Mystery", synopsis: "Holmes investigates a family curse and a ghostly hound on the moors." },
  { id: 863, title: "The Mysterious Affair at Styles", author: "Agatha Christie", genre: "Mystery", synopsis: "Hercule Poirot's first case: a poisoning at a country house." },
  { id: 120, title: "Treasure Island", author: "Robert Louis Stevenson", genre: "Adventure", synopsis: "Young Jim Hawkins sails for buried gold with the pirate Long John Silver." },
  { id: 1184, title: "The Count of Monte Cristo", author: "Alexandre Dumas", genre: "Adventure", synopsis: "A wrongly jailed sailor escapes, finds a fortune and plans his revenge." },
  { id: 1257, title: "The Three Musketeers", author: "Alexandre Dumas", genre: "Adventure", synopsis: "D'Artagnan joins three legendary swordsmen in court intrigue and duels." },
  { id: 103, title: "Around the World in Eighty Days", author: "Jules Verne", genre: "Adventure", synopsis: "Phileas Fogg bets his fortune he can circle the globe in 80 days." },
  { id: 164, title: "Twenty Thousand Leagues under the Sea", author: "Jules Verne", genre: "Sci-Fi", synopsis: "Captain Nemo and his submarine Nautilus explore the ocean depths." },
  { id: 35, title: "The Time Machine", author: "H. G. Wells", genre: "Sci-Fi", synopsis: "A traveller journeys to the far future and finds humanity split in two." },
  { id: 36, title: "The War of the Worlds", author: "H. G. Wells", genre: "Sci-Fi", synopsis: "Martians invade England with unstoppable machines." },
  { id: 11, title: "Alice's Adventures in Wonderland", author: "Lewis Carroll", genre: "Fantasy", synopsis: "Alice falls down a rabbit hole into a world of nonsense and wonder." },
  { id: 55, title: "The Wonderful Wizard of Oz", author: "L. Frank Baum", genre: "Fantasy", synopsis: "Dorothy is swept to Oz and follows the yellow brick road." },
  { id: 16, title: "Peter Pan", author: "J. M. Barrie", genre: "Fantasy", synopsis: "The boy who never grows up takes Wendy to Neverland." },
  { id: 1400, title: "Great Expectations", author: "Charles Dickens", genre: "Classics", synopsis: "Orphan Pip rises in the world thanks to a mysterious benefactor." },
  { id: 98, title: "A Tale of Two Cities", author: "Charles Dickens", genre: "Classics", synopsis: "Love and sacrifice in London and Paris during the French Revolution." },
  { id: 2554, title: "Crime and Punishment", author: "Fyodor Dostoyevsky", genre: "Classics", synopsis: "A poor student commits murder and wrestles with his conscience." },
  { id: 2701, title: "Moby Dick", author: "Herman Melville", genre: "Adventure", synopsis: "Captain Ahab hunts the white whale that took his leg." },
  { id: 76, title: "Adventures of Huckleberry Finn", author: "Mark Twain", genre: "Classics", synopsis: "Huck and Jim raft down the Mississippi toward freedom." },
  { id: 64317, title: "The Great Gatsby", author: "F. Scott Fitzgerald", genre: "Classics", synopsis: "A mysterious millionaire chases a lost love in the Jazz Age." },
  { id: 219, title: "Heart of Darkness", author: "Joseph Conrad", genre: "Classics", synopsis: "A voyage up the Congo River into colonial cruelty." },
];

export const novelLinks = (id: number) => ({
  cover: `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`,
  epub: `https://www.gutenberg.org/ebooks/${id}.epub3.images`,
  kindle: `https://www.gutenberg.org/ebooks/${id}.kf8.images`,
  read: `https://www.gutenberg.org/ebooks/${id}.html.images`,
});
