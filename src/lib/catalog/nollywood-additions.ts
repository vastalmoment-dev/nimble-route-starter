// Full-length uploads verified on the official channel pages and YouTube oEmbed.
// Durations and channel attribution are factual; plot summaries are not guessed.
const additions = [
  ["lL4jB2KM514", "A Secret for the Season", "Omoni Oboli TV", "2:13:13"],
  ["VUzt40TJCKM", "My Mother's Christmas Guest", "Omoni Oboli TV", "2:03:54"],
  ["1FfwOJzNxfQ", "The River Remembers", "Omoni Oboli TV", "2:46:03"],
  ["vrvSNtNYeXY", "The Love Clause", "Omoni Oboli TV", "2:31:08"],
  ["tCa7-acZ9uM", "Love Looks Good on You", "Omoni Oboli TV", "2:51:50"],
  ["7UV1yrbuKLY", "If You Ask Me to Stay", "Omoni Oboli TV", "2:26:21"],
  ["pG_962LtEf8", "Millionaire Until Morning", "Omoni Oboli TV", "2:24:17"],
  ["7CQXWZ76YUQ", "Married for the Weekend", "Omoni Oboli TV", "1:37:46"],
  ["zKQoArfptqA", "The Bride Switch", "Omoni Oboli TV", "2:39:46"],
  ["H9qoC981BAU", "Love Was Not Invited", "Omoni Oboli TV", "1:43:26"],
  ["Ud1JUpJZZGQ", "Kiss Me Tomorrow", "Omoni Oboli TV", "2:08:20"],
  ["KioqX4LEuPM", "The Day Olivia Fell", "Omoni Oboli TV", "2:00:21"],
  ["yz7neOW_VWk", "The Party Crashers", "Omoni Oboli TV", "1:33:51"],
  ["RHXre4lxzSI", "Good Enough", "Omoni Oboli TV", "1:32:04"],
  ["srH_cKp_9CQ", "The House Manager", "Omoni Oboli TV", "1:57:32"],
  ["wQcDFc2OuRI", "The Farmer's Daughter", "Omoni Oboli TV", "2:15:13"],
  ["AKPM_o28w4M", "Love Edited", "Omoni Oboli TV", "2:01:09"],
  ["3oKgYl34ES4", "The Anchor", "Omoni Oboli TV", "1:40:11"],
  ["n_030oY87XY", "The Guest Room", "Ruth Kadiri 247", "1:44:23"],
] as const;

export const NOLLYWOOD_ADDITIONS = additions.map(([youtubeId, title, channel, duration]) => ({
  youtubeId, title, channel, duration,
  genre: "Newly added",
  format: "Full movie",
  image: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
  synopsis: `Full-length movie (${duration}) from the official ${channel} channel.`,
}));