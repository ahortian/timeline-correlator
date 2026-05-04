const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

app.post('/api/scrape', async (req, res) => {
  const { topic } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic is required' });

  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=false&explaintext=true&titles=${encodeURIComponent(topic)}&format=json&origin=*`;
    const wikiResp = await fetch(wikiUrl);
    const wikiData = await wikiResp.json();
    const page = Object.values(wikiData.query.pages)[0];

    if (!page || page.missing !== undefined) {
      return res.status(404).json({ error: 'Wikipedia article not found' });
    }

    const extract = page.extract.slice(0, 15000);
    const pageTitle = page.title;

    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: 'Extract historical events from the Wikipedia text. Return ONLY valid JSON with no markdown formatting: {"timelineName": "...", "events": [{"year": <integer>, "title": "<short title 6 words or fewer>", "description": "<1-2 sentences>"}]}. Include 8-15 of the most significant datable events. Use the year as an integer. Skip events without a clear year.',
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [{ role: 'user', content: `Wikipedia article about ${pageTitle}:\n\n${extract}` }]
    });

    const raw = message.content[0].text.trim();
    const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(json);
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.listen(3000, () => console.log('Timeline server running at http://localhost:3000'));
