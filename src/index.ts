import cron from 'node-cron';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { getRedisClient, RedisKeysMap } from '@/_utils/redis';
import { safeEnv } from '@/_utils/env';
import { replyChatGPTAnswer } from '@/_utils/openai';
import { CHAT_GPT_PARAMS } from '@/_utils/config';

const { Guilds, GuildMessages, MessageContent } = GatewayIntentBits;
const client = new Client({
  // 注意: MessageContentはBot管理画面で `MESSAGE CONTENT INTENT` 有効化の必要がある
  intents: [Guilds, GuildMessages, MessageContent],
});

// JST 0:00
cron.schedule(
  `0 0 * * *`,
  async () => {
    const totalTokenCountRedisKey =
      RedisKeysMap.discordBot.openai.totalTokenString;
    const redis = getRedisClient();
    if (redis) {
      await redis.set(totalTokenCountRedisKey, 0).then(async () => {
        console.log('Reset token limit');
      });
    }
  },
  {
    timezone: 'Asia/Tokyo',
  }
);

client.once(Events.ClientReady, async (c) => {
  const redis = getRedisClient();
  redis.on('error', async (e) => {
    // ここで失敗したら何か間違っているので終了する
    throw new Error(e);
  });
  console.info(`@${c.user.tag} : 起動しました`);
  console.info('ChatGPTに与えるパラーメーター: ', CHAT_GPT_PARAMS);
  console.info(`読むメッセージ履歴: ${safeEnv.OPENAI_CHAT_HISTORY_LIMIT}件`);
  console.info(
    `トークン制限: 1日あたり$${safeEnv.OPENAI_DOLLAR_LIMIT_PER_DAY} ($${safeEnv.OPENAI_CHAT_GPT_DOLLAR_PER_1K_TOKEN}/トークン1K のレートで計算)`
  );
  return await c.guilds
    .fetch()
    .then((guilds) => {
      console.info(
        '稼働中のサーバー: ',
        guilds.map((g) => g.name)
      );
    })
    .catch((e) => {
      console.error(e);
      console.info('稼働中のサーバーの取得に失敗しました。');
    });
});

client.on(Events.MessageCreate, async (message) => {
  // bot無視
  if (message.author.bot) {
    return;
  }
  if (client.user) {
    if (message.mentions.has(client.user)) {
      await replyChatGPTAnswer(client.user, message);
    }
  }
});

client.login(safeEnv.DISCORD_TOKEN);
