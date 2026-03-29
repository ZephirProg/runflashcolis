export default async function handler(req, res) {
  if(req.method !== 'POST') return res.status(405).end();
  const { to, subject, html } = req.body;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.REACT_APP_RESEND_KEY}`
    },
    body: JSON.stringify({
      from: 'Run Flash Colis <onboarding@resend.dev>',
      to, subject, html
    })
  });
  const data = await r.json();
  res.status(r.status).json(data);
}