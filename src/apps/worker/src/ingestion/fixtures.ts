// Invented sample feeds for tests. All companies, publishers and headlines are fictional.

export const RSS_TWO_ITEMS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Markets Desk</title>
    <link>https://news.example.in/markets</link>
    <item>
      <title><![CDATA[Asterion Industries board approves Q2 results & interim dividend]]></title>
      <link>https://news.example.in/markets/asterion-q2?utm_source=rss</link>
      <guid isPermaLink="false">ex-1001</guid>
      <pubDate>Mon, 05 Oct 2026 10:05:00 +0530</pubDate>
    </item>
    <item>
      <title>Kestrel Power wins &#8377;900 crore transmission order</title>
      <link>https://news.example.in/markets/kestrel-order</link>
      <guid isPermaLink="false">ex-1002</guid>
      <pubDate>Mon, 05 Oct 2026 10:20:00 +0530</pubDate>
    </item>
  </channel>
</rss>`;

export const RSS_THREE_ITEMS = RSS_TWO_ITEMS.replace(
  '</channel>',
  `  <item>
      <title>Meridian Textiles promoter releases pledge on 2% stake</title>
      <link>https://news.example.in/markets/meridian-pledge</link>
      <guid isPermaLink="false">ex-1003</guid>
      <pubDate>Mon, 05 Oct 2026 11:00:00 +0530</pubDate>
    </item>
  </channel>`,
);

export const RSS_MIXED_QUALITY = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Mixed</title>
  <item><title>Orion Cables reports 18% rise in quarterly net profit</title><link>https://feed.example.in/orion</link></item>
  <item><title>शेयर बाजार में तेजी</title><link>https://feed.example.in/hindi-1</link></item>
  <item><title></title><link>https://feed.example.in/empty</link></item>
  <item><title>No link here</title></item>
  <item><title>Orion Cables reports 18% rise in quarterly net profit</title><link>https://feed.example.in/orion?utm_campaign=x</link></item>
</channel></rss>`;

export const ATOM_ONE_ENTRY = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Regulator Notices</title>
  <entry>
    <title type="text">Order in the matter of Halcyon Ventures Ltd</title>
    <link rel="alternate" href="https://regulator.example.in/orders/2026/101"/>
    <link rel="enclosure" href="https://regulator.example.in/orders/2026/101.pdf"/>
    <id>urn:example:order:101</id>
    <updated>2026-10-05T06:30:00Z</updated>
  </entry>
</feed>`;

export const MALFORMED = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Broken</title></channel></rss>`;
