import express from "express"
import bodyParser from "body-parser"
import dotenv from "dotenv"
import fetch from "node-fetch"

dotenv.config()

const app = express()
app.use(bodyParser.json())

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SERVER_TOKEN = process.env.SERVER_TOKEN || "dev-token"

if (!OPENAI_API_KEY) {
  console.error("Lipseste OPENAI_API_KEY in environment variables")
}

// mic helper pentru log
function log(...args) {
  console.log(new Date().toISOString(), "-", ...args)
}

// apel la OpenAI Chat Completions
async function callOpenAIForOrder(orderPayload) {
  const systemPrompt =
    "You are the Order Operator bot. Receive a JSON payload with client info and items. Validate inputs, calculate line totals, subtotal, simple flat shipping, and total. Prefer strict JSON output. Also include a short Romanian confirmation_message field. If data is missing, set status to pending and explain in notes."

  const userPrompt =
    "Process this order payload and return JSON with fields: order_id, client{name,phone,address}, items[{sku,name,qty,unit_cost,unit_price,line_total}], totals{subtotal,shipping,total}, status, notes, confirmation_message. Order payload:\n\n" +
    JSON.stringify(orderPayload)

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 800,
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error("OpenAI error " + resp.status + ": " + text)
  }

  const data = await resp.json()
  const content = data.choices?.[0]?.message?.content || ""

  // incercam sa parsăm direct ca JSON (cerem modelului sa returneze JSON curat)
  let parsed = null
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    // daca nu e JSON curat, intoarcem raw pentru debugging
    log("Nu pot parsa JSON, trimit continutul brut")
    parsed = null
  }

  return { raw: content, json: parsed }
}

// middleware simplu de autorizare
function authMiddleware(req, res, next) {
  const authHeader = req.header("Authorization") || ""
  const parts = authHeader.split(" ")
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ error: "missing_or_invalid_auth_header" })
  }
  const token = parts[1]
  if (token !== SERVER_TOKEN) {
    return res.status(403).json({ error: "invalid_token" })
  }
  next()
}

// endpointul principal de webhook pentru comanda noua
app.post("/api/webhook/comanda_noua", authMiddleware, async (req, res) => {
  try {
    const payload = req.body
    log("Payload primit:", JSON.stringify(payload))

    if (!payload || !payload.order_id || !payload.client || !Array.isArray(payload.items)) {
      return res.status(400).json({ error: "invalid_payload" })
    }

    const aiResult = await callOpenAIForOrder(payload)

    // daca modelul nu a returnat JSON valid, marcam eroare
    if (!aiResult.json) {
      return res.status(200).json({
        ok: true,
        parsed: null,
        ai_raw: aiResult.raw,
        warning: "Modelul nu a returnat JSON valid. Verifica raw.",
      })
    }

    // aici, mai târziu, poți adăuga salvare în Google Sheets / DB
    // deocamdata doar intoarcem rezultatul

    return res.status(200).json({
      ok: true,
      parsed: aiResult.json,
    })
  } catch (err) {
    console.error("Eroare in webhook:", err)
    return res.status(500).json({ error: "server_error", detail: err.message })
  }
})

// endpoint simplu de test
app.get("/", (req, res) => {
  res.send("Operator comercial bot este online")
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  log("Server pornit pe portul", PORT)
})
