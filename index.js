require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { createWebApp } = require("./web");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once("ready", () => {
  console.log("Discord ready as", client.user.tag);
  const app = createWebApp(client);
  app.listen(3000, () => console.log("Web listening on http://localhost:3000"));
});

client.login(process.env.DISCORD_TOKEN);
