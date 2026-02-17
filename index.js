require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const OpenAI = require("openai");
const express = require("express");
const QRCode = require("qrcode");

// ================= CONFIG =================
const NUMERO_ASSISTENCIA = "5511971556192@c.us";
const NUMERO_IPTV = "5511941358474@c.us";
let MODO_TESTE = true; // só responde seu número

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const historico = {};

// ================= CLIENTE WHATSAPP =================
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '/app/session' }),
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu']
    }
});

let qrCodeAtual = null;
let whatsappPronto = false;

client.on('qr', qr => { qrCodeAtual = qr; console.log("QR GERADO") });
client.on('ready', () => { whatsappPronto = true; console.log("WHATSAPP CONECTADO ✅") });
client.on('authenticated', () => { console.log("AUTENTICADO COM SUCESSO") });
client.on('auth_failure', msg => { console.log("FALHA NA AUTENTICAÇÃO:", msg) });
client.on('disconnected', reason => { whatsappPronto = false; console.log("DESCONECTADO:", reason) });

// ================= FUNÇÃO PARA AGENTES =================
async function responderComIA(numero, texto) {
    if (!historico[numero]) {
        historico[numero] = [
            { role: "system", content: numero === NUMERO_ASSISTENCIA ?
`Você é ENI - Assistência técnica NTEC.
Fluxo: Cumprimentar, perguntar nome, aparelho, marca, modelo, defeito, enviar orçamento, conduzir passo a passo.` :
`Você é ENI - IPTV NTEC.
Fluxo: Cumprimentar, perguntar nome, TV, modelo, app, planos, testes, conduzir passo a passo.`}
        ];
    }

    historico[numero].push({ role: "user", content: texto });
    if (historico[numero].length > 15) historico[numero].splice(1,5);

    const resposta = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: historico[numero],
        temperature: 0.6
    });

    const mensagem = resposta.choices[0].message.content;
    historico[numero].push({ role: "assistant", content: mensagem });
    return mensagem;
}

// ================= RECEBIMENTO =================
client.on('message', async msg => {
    if (!whatsappPronto) return console.log("Mensagem recebida mas WhatsApp não pronto");

    const numero = msg.from;
    const texto = msg.body?.trim();
    if (!texto) return;

    if (MODO_TESTE && numero !== NUMERO_ASSISTENCIA) return;

    try {
        // Define qual agente usar
        const agente = texto.toLowerCase().includes("iptv") ? NUMERO_IPTV : NUMERO_ASSISTENCIA;
        const resposta = await responderComIA(agente, texto);
        await msg.reply(resposta);
        console.log(`Mensagem respondida para ${numero}`);
    } catch (erro) {
        console.log("ERRO IA:", erro);
        await msg.reply("⚠️ Sistema temporariamente instável. Tente novamente.");
    }
});

client.initialize();

// ================= EXPRESS =================
const app = express();

app.get("/", (req,res) => res.send("ENI-NTEC MULTIAGENTE ONLINE 24H"));
app.get("/qr", async (req,res) => {
    if (!qrCodeAtual) return res.send("QR não gerado ainda.");
    const qrImage = await QRCode.toDataURL(qrCodeAtual);
    res.send(`<img src="${qrImage}" />`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log("Servidor ativo na porta", PORT));
