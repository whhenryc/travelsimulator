import type { CityConfig } from './types';

const gion: CityConfig = {
  id: 'gion',
  name: '京都祇園',
  bbox: { south: 34.9985, west: 135.7705, north: 35.0075, east: 135.78 },
  // 四條大橋中間，面向東邊嘅八坂神社
  spawn: { position: [135.7715, 35.00382], headingDegrees: 90 },
  // 木色深啡、瓦灰、朱紅點綴、黃昏暖光；樹葉混入秋天紅葉
  palette: {
    skyZenith: 0x3d4f86,
    skyHorizon: 0xf0b98a,
    sunGlow: 0xffd29a,
    fog: 0xd9a98a,
    ground: 0x9c8a74,
    road: 0x968b7c,
    path: 0xb3a892,
    water: 0x3e6b78,
    green: 0x5f7d48,
    woodDark: 0x4a3022,
    plaster: 0xe6dcc8,
    concrete: [0xc9bfae, 0xb5ab9c, 0xd8cfbf, 0x9e978c, 0x8c7b6b],
    tile: 0x4b4e57,
    vermilion: 0xc8462e,
    windowGlass: 0x2e3440,
    windowLight: 0xffc477,
    outline: 0x231a14,
    treeTrunk: 0x4d3626,
    treeLeaves: [0x4f6b35, 0x5d7a3c, 0x6b7f3a, 0xb5552f, 0xc9822e],
    lantern: 0xffe0b0,
    lampPool: 0xffb560,
  },
  lighting: {
    sunColor: 0xffb27a,
    sunIntensity: 2.4,
    sunElevationDegrees: 20,
    sunAzimuthDegrees: 245,
    skyLight: 0xc4bccb,
    groundLight: 0x6e5544,
    ambientIntensity: 2.1,
    fogNear: 60,
    fogFar: 420,
  },
  landmarks: [
    {
      id: 'nishiromon',
      name: '八坂神社西樓門',
      model: 'nishiromon.glb',
      osmId: 'way/105449683',
      frontDegrees: 270,
    },
    { id: 'minamiza', name: '南座', model: 'minamiza.glb', osmId: 'way/273471468', frontDegrees: 0 },
    {
      id: 'tatsumi-bashi',
      name: '白川巽橋',
      model: 'tatsumi-bashi.glb',
      osmId: 'way/190891717',
      frontDegrees: 173,
    },
  ],
  // 座標取自 OSM 對應要素嘅中心
  pois: [
    {
      id: 'shijo-ohashi',
      name: { zh: '四條大橋', en: 'Shijo Ohashi Bridge', ja: '四条大橋' },
      position: [135.7715, 35.003815],
      radius: 30,
      summary:
        '橫跨鴨川、連接河原町與祇園的大橋，是走進祇園的正門口。橋東端是京阪「祇園四條」站，站在橋上可以遠望鴨川兩岸與東山。',
      tip: '夏天（5 月至 9 月）鴨川西岸的料理店會搭起納涼床，黃昏時最有氣氛。',
      stayMinutes: 10,
      photoUrl: commons('Shijo Ohashi Kyoto'),
    },
    {
      id: 'minamiza',
      name: { zh: '南座', en: 'Minamiza Theatre', ja: '南座' },
      position: [135.772401, 35.003491],
      radius: 35,
      summary:
        '四條大橋東側的歌舞伎劇場，源流可追溯至江戶初期，是日本歷史最悠久的劇場之一。現存建築於 1929 年落成，正面的唐破風屋頂非常醒目。',
      tip: '每年 12 月的「顏見世」是京都冬天的盛事。沒有演出時不開放參觀，在正門外拍照即可。',
      stayMinutes: 10,
      photoUrl: commons('Minamiza Kyoto'),
    },
    {
      id: 'ichiriki',
      name: { zh: '一力亭', en: 'Ichiriki Chaya', ja: '一力亭' },
      position: [135.775219, 35.003597],
      radius: 25,
      summary:
        '四條通與花見小路交界的老牌茶屋，朱紅色的外牆是祇園最有代表性的街角。已有約 300 年歷史，因《忠臣藏》的故事而聞名。',
      tip: '茶屋只招待熟客介紹的客人，一般遊客在門外欣賞即可。',
      stayMinutes: 5,
      photoUrl: commons('Ichiriki Chaya Gion'),
    },
    {
      id: 'hanamikoji',
      name: { zh: '花見小路', en: 'Hanamikoji Street', ja: '花見小路' },
      position: [135.77485, 35.002652],
      radius: 40,
      summary:
        '由四條通向南延伸的石板路，兩旁是格子窗的茶屋與料亭。傍晚燈籠亮起後，有機會見到趕赴宴席的藝妓與舞妓。',
      tip: '部分私家小巷禁止拍照；遇到藝妓、舞妓請勿攔截或追拍。',
      stayMinutes: 30,
      photoUrl: commons('Hanamikoji Gion'),
    },
    {
      id: 'kaburenjo',
      name: { zh: '祇園甲部歌舞練場', en: 'Gion Kobu Kaburenjo Theatre', ja: '祇園甲部歌舞練場' },
      position: [135.775569, 35.00162],
      radius: 35,
      summary:
        '祇園甲部藝妓與舞妓練習和表演的劇場，建築於 1913 年落成。每年春天在這裡上演「都をどり」，是欣賞京舞的好機會。',
      tip: '「都をどり」每年 4 月舉行，需要預先買票。',
      stayMinutes: 15,
      photoUrl: commons('Gion Kobu Kaburenjo'),
    },
    {
      id: 'kenninji',
      name: { zh: '建仁寺', en: 'Kennin-ji Temple', ja: '建仁寺' },
      position: [135.774602, 35.000178],
      radius: 70,
      summary:
        '1202 年由榮西禪師創建，是京都最古老的禪寺。法堂天井繪有巨大的雙龍圖，方丈可以欣賞枯山水庭園，寺內亦展示俵屋宗達《風神雷神圖》的高精度複製品。',
      tip: '境內可以自由散步，進入方丈和法堂需要買拜觀券。',
      stayMinutes: 60,
      photoUrl: commons('Kennin-ji Kyoto'),
    },
    {
      id: 'yasui-konpiragu',
      name: { zh: '安井金比羅宮', en: 'Yasui Konpira-gu Shrine', ja: '安井金比羅宮' },
      position: [135.776323, 34.999902],
      radius: 30,
      summary:
        '以「斬斷惡緣、結良緣」聞名的神社。參拜者把願望寫在形代上，穿過貼滿紙條的「緣切緣結碑」石洞：由正面穿到背面斬斷惡緣，再由背面穿回正面結良緣。',
      tip: '假日排隊穿石洞的人很多，早上比較清靜。',
      stayMinutes: 20,
      photoUrl: commons('Yasui Konpiragu'),
    },
    {
      id: 'shirakawa',
      name: { zh: '白川・巽橋', en: 'Shirakawa & Tatsumi Bridge', ja: '白川・巽橋' },
      position: [135.774501, 35.005577],
      radius: 35,
      summary:
        '白川沿岸的祇園新橋一帶是傳統建築保存地區，石板路、垂柳與木造茶屋構成祇園最上鏡的景色。巽橋旁的辰巳大明神是藝妓們祈求技藝進步的小神社。',
      tip: '春天櫻花季特別漂亮，晚上燈籠亮起後也很有氣氛。',
      stayMinutes: 20,
      photoUrl: commons('Shirakawa Gion Tatsumi bridge'),
    },
    {
      id: 'yasaka-jinja',
      name: { zh: '八坂神社', en: 'Yasaka Shrine', ja: '八坂神社' },
      position: [135.778387, 35.003485],
      radius: 70,
      summary:
        '祇園的守護神社，每年 7 月整個月的祇園祭就是這裡的祭禮。朱紅色的西樓門正對四條通，本殿於 2020 年被指定為國寶。穿過境內可以走到東邊的圓山公園。',
      tip: '24 小時開放，晚上舞殿的燈籠全部點亮。',
      stayMinutes: 40,
      photoUrl: commons('Yasaka Shrine Kyoto'),
    },
  ],
};

function commons(query: string): string {
  return `https://commons.wikimedia.org/w/index.php?title=Special:MediaSearch&type=image&search=${encodeURIComponent(query)}`;
}

export default gion;
