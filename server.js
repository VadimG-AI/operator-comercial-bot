import express from "express"
import bodyParser from "body-parser"
import dotenv from "dotenv"
import fetch from "node-fetch"

dotenv.config()

const app = express()
app.use(bodyParser.json())

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

function log(...args) {
  console.log(new Date().toISOString(), "-", ...args)
}

// trimite mesaj în Telegram
async function sendTelegramMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  })
}

// apelează OpenAI ca să proceseze comanda
async function callOpenAIForOrder(userText) {
  const systemPrompt =
    "You are an assistant that takes orders for an online clothing and cosmetics store in Romania/Moldova. The user writes casually. Your job: 1) understand the order (products, sizes, quantities, city, name, phone, payment method), 2) if ceva lipsește, cere clar acea informație, 3) răspunde foarte scurt în limba română cu un mesaj de confirmare a comenzii (nu mai mult de 3 fraze). Nu folosi JSON, doar text natural."

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText }
      ],
      temperature: 0.2,
      max_tokens: 300
    })
  })

  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error("OpenAI error " + resp.status + ": " + txt)
  }

  const data = await resp.json()
  return data.choices?.[0]?.message?.content || "Nu pot procesa comanda acum."
}

// webhook Telegram
app.post("/api/webhook/comanda_noua", async (req, res) => {
  try {
    const update = req.body
    log("Telegram update:", JSON.stringify(update))

    if (!update.message) {
      return res.status(200).json({ ok: true })
    }

    const chatId = update.message.chat.id
    const text = update.message.text || ""

    if (text === "/start") {
      await sendTelegramMessage(
        chatId,
        "Salut, sunt Operatorul Comercial. Trimite comanda ta sau scrie /comanda ca să vezi cum o formatezi."
      )
    } else if (text === "/comanda") {
      await sendTelegramMessage(
        chatId,
        "Scrie comanda într-un singur mesaj, de exemplu:\nSet costum negru, mărime M, 1 buc\nOras: Chișinău\nNume: Ana Popa\nTelefon: 06...\nPlata: la livrare."
      )
    } else {
      try {
        const aiAnswer = await callOpenAIForOrder(text)
        await sendTelegramMessage(chatId, aiAnswer)
      } catch (e) {
        log("Eroare OpenAI:", e.message)
        await sendTelegramMessage(
          chatId,
          "Nu pot procesa comanda acum. Încearcă din nou peste câteva minute."
        )
      }
    }

    res.status(200).json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "server_error" })
  }
})

// test simplu
app.get("/", (req, res) => {
  res.send("Operator comercial bot este online")
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => log("Server pornit pe portul", PORT))
