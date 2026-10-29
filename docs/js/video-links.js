// Turns a pasted Instagram / TikTok / YouTube / Vimeo link into an embeddable
// player. Shared by the site and the dashboard.
window.parseVideoLink = function (url) {
  if (!/^https?:\/\//i.test(url || '')) return null;
  let m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  if (m) {
    return {
      platform: 'youtube',
      embed: `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0&playsinline=1`,
      thumb: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`,
      tall: /shorts\//i.test(url),
    };
  }
  m = url.match(/instagram\.com\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]+)/i);
  if (m) {
    const type = m[1].toLowerCase() === 'p' ? 'p' : 'reel';
    return { platform: 'instagram', embed: `https://www.instagram.com/${type}/${m[2]}/embed`, tall: true };
  }
  m = url.match(/tiktok\.com\/.*\/video\/(\d+)/i);
  if (m) return { platform: 'tiktok', embed: `https://www.tiktok.com/embed/v2/${m[1]}`, tall: true };
  if (/tiktok\.com\//i.test(url)) return { platform: 'tiktok', embed: null, tall: true };
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return { platform: 'video', embed: `https://player.vimeo.com/video/${m[1]}?autoplay=1` };
  return { platform: 'link', embed: null };
};
