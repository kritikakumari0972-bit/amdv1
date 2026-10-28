export type Example = { site: string; url: string; verified: boolean };

export const EXAMPLES: Example[] = [
  // ---- Pornhub: viewkeys taken from live homepage HTML, 2026-10-21 ----
  { site: 'pornhub', verified: true, url: 'https://www.pornhub.com/view_video.php?viewkey=6881deab3f441' },
  { site: 'pornhub', verified: true, url: 'https://www.pornhub.com/view_video.php?viewkey=66758de55e848' },
  { site: 'pornhub', verified: true, url: 'https://www.pornhub.com/view_video.php?viewkey=6739f36897ac9' },
  { site: 'pornhub', verified: true, url: 'https://www.pornhub.com/view_video.php?viewkey=66d3cd9b93877' },
  { site: 'pornhub', verified: true, url: 'https://www.pornhub.com/view_video.php?viewkey=ph6195dc3ce1102' },
  { site: 'pornhub', verified: true, url: 'https://www.pornhub.com/view_video.php?viewkey=ph639ce52259404' },
  { site: 'pornhub', verified: true, url: 'https://www.pornhub.com/view_video.php?viewkey=ph6376285401407' },
  { site: 'pornhub', verified: true, url: 'https://www.pornhub.com/view_video.php?viewkey=664e07b905c75' },
  { site: 'pornhub', verified: true, url: 'https://www.pornhub.com/view_video.php?viewkey=68117a7cb7ad9' },
  { site: 'pornhub', verified: true, url: 'https://www.pornhub.com/view_video.php?viewkey=680aa2ef3e3db' },
  { site: 'pornhub', verified: true, url: 'https://www.pornhub.com/view_video.php?viewkey=681027613acf7' },
  { site: 'pornhub', verified: true, url: 'https://www.pornhub.com/view_video.php?viewkey=675c107fb7c93' },
  { site: 'pornhub', verified: true, url: 'https://www.pornhub.com/view_video.php?viewkey=6ac6882d726fb' },
  { site: 'pornhub', verified: true, url: 'https://www.pornhub.com/view_video.php?viewkey=6ad429fb82571' },

  // ---- XVideos: ids from live homepage + related payload, 2026-10-21 ----
  { site: 'xvideos', verified: true, url: 'https://www.xvideos.com/video.olhhdule7ad' },
  { site: 'xvideos', verified: true, url: 'https://www.xvideos.com/video.oltkftv3362' },
  { site: 'xvideos', verified: true, url: 'https://www.xvideos.com/video.oltellvce21' },
  { site: 'xvideos', verified: true, url: 'https://www.xvideos.com/video.olhheki54d6' },
  { site: 'xvideos', verified: true, url: 'https://www.xvideos.com/video.olhilhv8966' },
  { site: 'xvideos', verified: true, url: 'https://www.xvideos.com/video.opfpepv1ad2' },
  { site: 'xvideos', verified: true, url: 'https://www.xvideos.com/video.olhivdb4153' },
  { site: 'xvideos', verified: true, url: 'https://www.xvideos.com/video.olhtvve69ac' },
  { site: 'xvideos', verified: true, url: 'https://www.xvideos.com/video.oltdcco49b3' },
  { site: 'xvideos', verified: true, url: 'https://www.xvideos.com/video.omdtppf053a' },
  { site: 'xvideos', verified: true, url: 'https://www.xvideos.com/video.uiftmbf924f' },
  { site: 'xvideos', verified: true, url: 'https://www.xvideos.com/video.uvtabad8907' },
  { site: 'xvideos', verified: true, url: 'https://www.xvideos.com/video.ulhafloeb5e' },
  { site: 'xvideos', verified: true, url: 'https://www.xvideos.com/video.omeubepca1e' },

  // ---- xHamster: ids from their own API pageURL fields, 2026-10-21 ----
  { site: 'xhamster', verified: true, url: 'https://xhamster.com/videos/xhJV1hz' },
  { site: 'xhamster', verified: true, url: 'https://xhamster.com/videos/xh8ghWB' },
  { site: 'xhamster', verified: true, url: 'https://xhamster.com/videos/xhjQutT' },
  { site: 'xhamster', verified: true, url: 'https://xhamster.com/videos/xhWdrUm' },
  { site: 'xhamster', verified: true, url: 'https://xhamster.com/videos/xhWS0xK' },
  { site: 'xhamster', verified: true, url: 'https://xhamster.com/videos/xhCN6LR' },
  { site: 'xhamster', verified: true, url: 'https://xhamster.com/videos/xh23oC8' },
  { site: 'xhamster', verified: true, url: 'https://xhamster.com/videos/xhIpkhE' },
  { site: 'xhamster', verified: true, url: 'https://xhamster.com/videos/xhEEGOR' },
  { site: 'xhamster', verified: true, url: 'https://xhamster.com/videos/xhb2MHW' },
  { site: 'xhamster', verified: true, url: 'https://xhamster.com/videos/xhUBl3m' },
  { site: 'xhamster', verified: true, url: 'https://xhamster.com/videos/xhAxzf5' },
  { site: 'xhamster', verified: true, url: 'https://xhamster.com/videos/xhAe70d' },

  // ---- pattern-only (site is in the registry, URL shape not re-checked today) ----
  { site: 'xnxx', verified: false, url: 'https://www.xnxx.com/video-1a2b3c4/xnxx_video' },
  { site: 'spankbang', verified: false, url: 'https://spankbang.com/1a2b3/video/example' },
  { site: 'eporner', verified: false, url: 'https://www.eporner.com/video-abcdefg/example/' },
  { site: 'youporn', verified: false, url: 'https://www.youporn.com/watch/12345678/example/' },
  { site: 'redtube', verified: false, url: 'https://www.redtube.com/12345678' },
  { site: 'tube8', verified: false, url: 'https://www.tube8.com/porn/example/12345678/' },
];