import type { VercelRequest, VercelResponse } from '@vercel/node';

// A thin proxy in front of a Supabase Storage signed URL. LINE's Messaging API has no "file"
// message type -- a bot can only push text/image/video/audio/Flex, never an attachment the way
// email can -- so the monthly report's Excel file has to travel as a link instead. Proxying it
// through this app's own domain (rather than handing out the raw *.supabase.co signed URL
// directly) is what makes that link look like it belongs to the app the user already trusts,
// instead of an unfamiliar third-party domain, which is exactly what makes a LINE-delivered link
// feel safe enough to tap.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const u = typeof req.query.u === 'string' ? req.query.u : '';
  if (!u) {
    res.status(400).send('Missing file reference');
    return;
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(u);
  } catch {
    res.status(400).send('Invalid file reference');
    return;
  }
  // Only ever proxy to this project's own Supabase Storage host -- never let the `u` param turn
  // this into an open relay for arbitrary URLs.
  if (!upstreamUrl.hostname.endsWith('.supabase.co')) {
    res.status(400).send('Invalid file reference');
    return;
  }

  try {
    const upstream = await fetch(upstreamUrl.toString());
    if (!upstream.ok) {
      res.status(upstream.status === 404 ? 404 : 502).send('ลิงก์นี้หมดอายุหรือไม่พบไฟล์แล้วครับ ลองขอสรุปใหม่อีกครั้งในแอป');
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="cash-squirrel-monthly-report.xlsx"');
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.status(200).send(buf);
  } catch (err) {
    console.error('download-report: proxy fetch failed:', err);
    res.status(502).send('ดาวน์โหลดไฟล์ไม่สำเร็จครับ ลองใหม่อีกครั้ง');
  }
}
