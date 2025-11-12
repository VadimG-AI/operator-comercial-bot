import express from "express"
import bodyParser from "body-parser"
import dotenv from "dotenv"
import fetch from "node-fetch"

dotenv.config()

const app = express()
app.use(bodyParser.json())

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SERVER_TOKEN = process.env.SERVER_TOKEN
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

// ===== helper pentru loguri =====
function log(...args) {
  console.log(new Date().toISOString(), "-", ...args)
}

// ===== trimite mesaj în Telegram =====
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

// ===== endpoint-ul Telegram Webhook =====
app.post("/api/webhook/comanda_noua", async (req, res) => {
  try {
    const update = req.body
    log("Telegram update:", JSON.stringify(update))

    if (update.message) {
      const chatId = update.message.chat.id
      const text = update.message.text || ""

      // răspuns simplu
      if (text === "/start") {
        await sendTelegramMessage(chatId, "Salut! Botul operatorului comercial este activ.")
      } else {
        await sendTelegramMessage(chatId, `Ai trimis: ${text}`)
      }
    }

    res.status(200).json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "server_error" })
  }
})

app.get("/", (req, res) => {
  res.send("Operator comercial bot este online")
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => log("Server pornit pe portul", PORT))
