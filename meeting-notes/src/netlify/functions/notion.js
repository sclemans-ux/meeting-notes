exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const NOTION_TOKEN = process.env.REACT_APP_NOTION_TOKEN;
  if (!NOTION_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: "Notion token not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { endpoint, payload } = body;
  if (!endpoint || !payload) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing endpoint or payload" }) };
  }

  const response = await fetch(`https://api.notion.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  return {
    statusCode: response.status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
};
