const fs = require("fs");
const qrcode = require("qrcode-terminal");
const axios = require("axios");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const moment = require("moment-timezone");
require("dotenv").config(); // Mengimpor dan mengonfigurasi dotenv

// Constants
const SESSION_FILE_PATH = (clientId) => `./session-${clientId}.json`;

// Define clients outside the function
const clients = [];

function loadSession(clientId) {
  const sessionFile = SESSION_FILE_PATH(clientId);
  return fs.existsSync(sessionFile)
    ? JSON.parse(fs.readFileSync(sessionFile, "utf-8"))
    : null;
}

function saveSession(clientId, session) {
  if (session) {
    fs.writeFileSync(SESSION_FILE_PATH(clientId), JSON.stringify(session));
  }
}

async function sholatReminder(client, group, prayerTimes) {
  try {
    const timeZone = "Asia/Jakarta";
    const currentTimeIndonesia = moment().tz(timeZone);
    const formattedTime = currentTimeIndonesia.format("HH:mm");

    for (const key in prayerTimes) {
      // Skip data yang tidak ingin ditampilkan
      if (key === "date" || key === "terbit" || key === "dhuha") {
        continue;
      }

      const prayerTime = prayerTimes[key];
      const prayerName = key;
      const formattedPrayerTime = moment(prayerTime, "HH:mm")
        .tz("Asia/Jakarta")
        .format("HH:mm");

      const timeWith30MinutesSubtracted = moment(formattedTime, "HH:mm").add(
        1,
        "minutes"
      );
      const jamingat = timeWith30MinutesSubtracted.format("HH:mm");

      if (jamingat === formattedPrayerTime) {
        await group.sendMessage(
          `Waktunya sholat ${prayerName} di jam ${formattedPrayerTime} yang akan dilaksanakan sebentar lagi. Segera siapkan diri Anda.`
        );
      }
    }
  } catch (error) {
    console.error("Error in sholatReminder:", error);
  }
}

async function sholat(client) {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, "0");
    const day = today.getDate().toString().padStart(2, "0");

    const result = await axios.get(
      `${process.env.PRAYER_TIME_API}/${year}/${month}/${day}`
    );

    const prayerData = result.data;
    const prayerTimes = prayerData.data.jadwal;

    let replyMessage = `Imsak: ${prayerTimes.imsak}\n`;
    replyMessage += `Subuh: ${prayerTimes.subuh}\n`;
    replyMessage += `Terbit: ${prayerTimes.terbit}\n`;
    replyMessage += `Dhuha: ${prayerTimes.dhuha}\n`;
    replyMessage += `Dzuhur: ${prayerTimes.dzuhur}\n`;
    replyMessage += `Ashar: ${prayerTimes.ashar}\n`;
    replyMessage += `Maghrib: ${prayerTimes.maghrib}\n`;
    replyMessage += `Isya: ${prayerTimes.isya}`;

    const groups = await client.getChats();
    groups.forEach(async (group) => {
      await sholatReminder(client, group, prayerTimes);
    });
  } catch (error) {
    console.error("Error sending prayer reminders:", error);
  }
}

async function handleGroupMessage(chat, msg, contact) {
  if (msg.body === "!everyone") {
    const mentions = chat.participants.map(
      (participant) => `${participant.id.user}@c.us`
    );
    const text = chat.participants
      .map((participant) => `@${participant.id.user}`)
      .join(" ");
    chat.sendMessage(text, { mentions });
  } else if (msg.body === "halo") {
    if (contact) {
      chat.sendMessage(`Hello @${contact.id.user}`, { mentions: [contact] });
    } else {
      chat.sendMessage("Hello everyone!");
    }
  }
}

async function handlePrivateMessage(msg) {
  if (msg.body === "halo") {
    msg.reply("hello kak");
  }
}

async function umum(msg) {
  if (msg.body === "meme") {
    try {
      const meme = await axios
        .get("https://candaan-api.vercel.app/api/image/random")
        .then((res) => res.data);

      const imageUrl = meme.data.url;

      const media = await MessageMedia.fromUrl(imageUrl);
      msg.reply(media);
    } catch (error) {
      console.error("Error fetching meme:", error);
    }
  } else if (msg.body === "jokes") {
    try {
      const result = await axios
        .get("https://candaan-api.vercel.app/api/text/random")
        .then((res) => res.data);

      msg.reply(result.data);
    } catch (error) {
      console.error("Error fetching joke:", error);
    }
  }
}

function addClient(clientId) {
  const session = loadSession(clientId);
  const client = new Client({
    authStrategy: new LocalAuth({ clientId }),
    session,
  });

  client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => {
    console.log(`Connected Device: ${client.info.pushname}`);
  });

  client.on("message", async (msg) => {
    const chat = await msg.getChat();
    const contact = await msg.getContact();

    umum(msg);

    if (chat.isGroup) {
      handleGroupMessage(chat, msg, contact);
    } else {
      handlePrivateMessage(msg);
    }
  });

  client.initialize();

  client.on("authenticated", (session) => {
    saveSession(clientId, session);
  });

  clients.push(client);
  setInterval(() => sholat(client), 60000);
}

addClient("client-one");
