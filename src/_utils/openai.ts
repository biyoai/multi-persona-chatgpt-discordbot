import { ClientUser, Message as DiscordMessage } from 'discord.js';
import {
  Configuration,
  ChatCompletionRequestMessage as Message,
  CreateCompletionResponseUsage,
  OpenAIApi,
} from 'openai';
import { Redis } from 'ioredis';
import { safeEnv } from './env';
import {
  CHAT_GPT_PARAMS,
  DEFAULT_ASSISTANT_NAME,
  MAX_PROMPT_LENGTH,
} from './config';
import { RedisKeysMap, getRedisClient } from './redis';
import { notifyErrorToSlack, notifyNewMessageToSlack } from './slack';
import { markdownCode } from './markdown';

const openAiRedisKeys = RedisKeysMap.discordBot.openai;
const {
  totalTokenString: totalTokenCountRedisKey,
  messageHistoryForAssistantsHash: messageHistoryRedisKey,
} = openAiRedisKeys;
const {
  namesHash: assistantNamesRedisKey,
  triggerWordsHash: assistantTriggerWordsRedisKey,
  lastMessagesHash: assistantLastMessageRedisKey,
  systemMessagesHash: assistantSystemMessageRedisKey,
} = openAiRedisKeys.assistant;
const openAiConfig = new Configuration({
  apiKey: safeEnv.OPENAI_API_KEY,
});

function getCostInDollar(tokenCount: number | null) {
  return tokenCount && tokenCount > 0
    ? (tokenCount / 1000) * safeEnv.OPENAI_CHAT_GPT_DOLLAR_PER_1K_TOKEN
    : 0;
}

/**
 * 累計使用トークン数が上限以上ならfalse
 * まだ大丈夫なら現在の使用量を返す
 */
async function checkTotalTokenCount(redis: Redis): Promise<{
  limitDollar: number;
  currentDollar: number;
  exceeded: boolean;
}> {
  const current = Number(
    await redis.get(totalTokenCountRedisKey).catch((e) => {
      console.error(e);
      return null;
    })
  );
  const limitDollar = safeEnv.OPENAI_DOLLAR_LIMIT_PER_DAY;
  if (!current) {
    return await redis
      .set(totalTokenCountRedisKey, 0)
      .then(() => {
        return { limitDollar, currentDollar: 0, exceeded: false };
      })
      .catch((e) => {
        console.error(e);
        return { limitDollar, currentDollar: 0, exceeded: false };
      });
  }

  const currentDollar = getCostInDollar(current);
  return {
    limitDollar,
    currentDollar,
    exceeded: currentDollar >= safeEnv.OPENAI_DOLLAR_LIMIT_PER_DAY,
  };
}

/**
 * 累計使用トークン数を追加
 * これの返り値は実際には使わない
 */
async function incrementTotalTokenCount(
  redis: Redis,
  usage?: CreateCompletionResponseUsage
) {
  // 日本語なので2倍
  const maxTokenCount =
    safeEnv.OPENAI_CHAT_STRING_LENGTH_LIMIT * 2 +
    MAX_PROMPT_LENGTH +
    safeEnv.OPENAI_CHAT_GPT_ANSWER_MAX_TOKEN;
  // usage不明でも、予想される最大分増やす
  const tokenCountUsed = usage ? usage.total_tokens : maxTokenCount;
  await redis
    .incrby(totalTokenCountRedisKey, tokenCountUsed)
    .then(() => {
      if (process.env.NODE_ENV === 'development') {
        console.info(`ChatGPT使用トークンのカウント追加: ${tokenCountUsed}`);
      }
    })
    .catch((e) => {
      console.error(e);
      return 0;
    });
}
/**
 * ユーザーのメッセージ履歴を取得
 */
async function getUserMessageHistory(redis: Redis, assistantKey: string) {
  const key = messageHistoryRedisKey;
  const exists = await redis.hexists(key, assistantKey);
  if (exists) {
    const messages = await redis.hget(key, assistantKey);
    return messages ? (JSON.parse(messages) as Message[]) : [];
  } else {
    const blankArray: Message[] = [];
    await redis.hset(key, assistantKey, JSON.stringify(blankArray));
    return blankArray;
  }
}
/**
 * ユーザーのメッセージ履歴を更新して取得
 */
async function updateUserMessageHistory(
  redis: Redis,
  assistantKey: string,
  messages: Message[]
) {
  const key = messageHistoryRedisKey;
  return await redis
    .hset(
      key,
      assistantKey,
      JSON.stringify(messages.length > 0 ? messages : [])
    )
    .then(async () => {
      return await redis.hget(key, assistantKey);
    });
}

/**
 * メッセージ内容をもとに、人格を取得
 */
export async function getAssistantTypeOnRedis(
  redis: Redis,
  discordMessage: DiscordMessage
): Promise<{
  assistantKey: string;
  assistantName: string;
  systemMessage: Message;
  lastMessage: Message;
} | null> {
  /** アシスタントのキー: [トリガーワード, ...] */
  const triggerWordsMap = await redis.hgetall(assistantTriggerWordsRedisKey);
  let assistantKey = DEFAULT_ASSISTANT_NAME;
  if (Object.keys(triggerWordsMap).length > 0) {
    for (const key in triggerWordsMap) {
      const words = JSON.parse(triggerWordsMap[key]) as string[];
      if (
        words.length &&
        words.some((word) => discordMessage.cleanContent.includes(word))
      ) {
        assistantKey = key;
      }
    }
  }
  const assistantName = await redis.hget(assistantNamesRedisKey, assistantKey);
  const systemMessageContent = await redis.hget(
    assistantSystemMessageRedisKey,
    assistantKey
  );
  const lastMessageContent = await redis.hget(
    assistantLastMessageRedisKey,
    assistantKey
  );
  // 設定されていない場合は作る
  if (!assistantName) {
    await redis.hset(assistantNamesRedisKey, assistantKey, '');
  }
  if (!systemMessageContent) {
    await redis.hset(assistantSystemMessageRedisKey, assistantKey, '');
  }
  if (!lastMessageContent) {
    await redis.hset(assistantLastMessageRedisKey, assistantKey, '');
  }
  if (assistantName && systemMessageContent && lastMessageContent) {
    return {
      assistantKey,
      assistantName,
      systemMessage: {
        role: 'system',
        content: systemMessageContent,
      },
      lastMessage: {
        role: 'assistant',
        content: lastMessageContent,
      },
    };
  } else {
    if (assistantKey === DEFAULT_ASSISTANT_NAME) {
      await notifyErrorToSlack(
        `デフォルト人格について、人格形成用の項目が設定されていません`
      );
    } else {
      await notifyErrorToSlack(
        `${assistantKey}のトリガーワードは設定されていますが、その他の項目が設定されていません`
      );
    }
    return null;
  }
}

async function createChatCompletion(
  clientUser: ClientUser,
  messages: Message[]
) {
  const openai = new OpenAIApi(openAiConfig);
  return await openai
    .createChatCompletion({
      ...CHAT_GPT_PARAMS,
      messages,
      user: `discord bot ${clientUser.tag} <@${clientUser.id}>`,
    })
    .then((response) => {
      return response.data;
    })
    .catch(async (e) => {
      console.error(e.response ? e.response.data : e);
      await notifyErrorToSlack(
        e.response ? e.response.data : e,
        'OpenAI APIの問い合わせでエラーが発生しました。'
      );
      return null;
    });
}

/**
 * 使用料削減のため、本文の長さの合計を一定以内に抑える
 * プロンプトの最大長さと合計して `OPENAI_CHAT_STRING_LENGTH_LIMIT` になるようにする
 */
function limitMessagesTotalContentLength(
  /** これは別で扱うことで、最初に絶対残す */
  firstMessage: Message,
  messages: Message[],
  /** これは別で扱うことで、最後に絶対残す */
  lastMessage: Message,
  /** これは別で扱うことで、最後に絶対残す */
  promptMessage: Message
) {
  const filtered: Message[] = [];
  const maxLength =
    safeEnv.OPENAI_CHAT_STRING_LENGTH_LIMIT -
    firstMessage.content.length -
    lastMessage.content.length -
    MAX_PROMPT_LENGTH;
  if (process.env.NODE_ENV === 'development') {
    console.info(`Length remaining: ${maxLength}`);
  }
  let left = maxLength;
  // 最新のメッセージから読んでいく
  for (const message of messages.reverse()) {
    const sliced = {
      ...message,
      content: message.content.slice(0, left),
    };
    filtered.push(sliced);

    left -= sliced.content.length;
    if (left <= 0) break;
  }
  return [
    firstMessage,
    ...filtered.reverse(),
    // **重要** プロンプトの前は絶対にこれにしないとOpenAI人格になる
    lastMessage,
    {
      ...promptMessage,
      content: promptMessage.content.slice(0, MAX_PROMPT_LENGTH),
    },
  ];
}

/**
 * 前後の文脈を呼びながらChatGPTでメッセージを生成して返信する
 * @param message 送信されたメッセージ
 */
export async function replyChatGPTAnswer(
  clientUser: ClientUser,
  message: DiscordMessage
) {
  const perfStart = performance.now();
  try {
    const redis = getRedisClient();

    const { limitDollar, currentDollar, exceeded } = await checkTotalTokenCount(
      redis
    );

    /**
     * **注意** これは「回答をリクエストする前の状況」に基づいているため、
     * 「そのメッセージ自体によって消費したトークン」は考慮されない
     * 考慮するとRedisの通信待ちが増えるため、あえてこのままにしている
     */
    const costInfo = `AI使用料: 1日$${limitDollar}-本日$${currentDollar.toFixed(
      3
    )}消費=残$${(limitDollar - currentDollar).toFixed(3)}`;

    if (exceeded) {
      message.reply(
        `今日の使用料が既に限界を超えています。深夜0時のリセットまでお待ち下さい。${costInfo}`
      );
      return;
    }
    const assistant = await getAssistantTypeOnRedis(redis, message);

    if (assistant) {
      const { assistantKey, assistantName, systemMessage, lastMessage } =
        assistant;

      return await getUserMessageHistory(redis, assistantKey).then(
        async (previousMessages) => {
          if (systemMessage && lastMessage) {
            // メンションを除外
            const promptMessage: Message = {
              role: 'user',
              // cleanContentは、メンションをユーザー名で置換済み
              content: message.cleanContent
                // bot自体のメンションは人格で置き換えるが、回答に影響がないようにする
                .replace('@' + clientUser.username, `ねえ${assistantName}、`)
                .replace(/@/g, '')
                .slice(0, MAX_PROMPT_LENGTH),
            };

            /**
             * 回答の推論に使うメッセージの配列
             */
            const messagesForCompletion: Message[] =
              limitMessagesTotalContentLength(
                systemMessage,
                [...previousMessages.slice(-safeEnv.OPENAI_CHAT_HISTORY_LIMIT)],
                lastMessage,
                promptMessage
              );

            if (process.env.NODE_ENV === 'development') {
              const totalContentLength = messagesForCompletion.reduce(
                (prev, cur) => {
                  return prev + cur.content.length;
                },
                0
              );
              console.info(
                `${safeEnv.OPENAI_CHAT_HISTORY_LIMIT}件までメッセージを読み込み: `,
                messagesForCompletion,
                ` / 内容長さ: ',
        ${messagesForCompletion.map(
          ({ content }) => content.length
        )} / 内容長さ合計: ${totalContentLength}`
              );
            }
            const data = await createChatCompletion(
              clientUser,
              messagesForCompletion
            );

            if (data) {
              const usage = data.usage;
              const usageInfo = usage
                ? `読+書=${usage.prompt_tokens}+${usage.completion_tokens}=${usage.total_tokens}トークン消費`
                : '使用料不明';

              // 処理時間(小数点以下は不要なので除去)
              const perfEnd = performance.now();
              const additionalText =
                '\n' +
                markdownCode(
                  `${costInfo} ${usageInfo} (${Math.trunc(
                    perfEnd - perfStart
                  )}ms)`,
                  { inline: true }
                );
              // choicesは`n`指定なしだと1個が上限
              const firstChoice = data.choices[0];
              const answer = firstChoice.message?.content ?? '';

              /** 回答メッセージ */
              const answerMessage: Message = {
                role: 'assistant',
                content: answer,
              };
              // 高速化のためRedis保存前に回答してしまう
              message.react('✅');
              message.reply({
                content: `${
                  data.choices[0].message?.content ?? ''
                }${additionalText}`,
              });

              /**
               * Redisに保存するメッセージ(回答以外) 件数は環境変数で最後のn個に制限する
               * プロンプトメッセージだけ長さをsliceしていないが、どうせ次回読み込み時に長さが調整される
               */
              const previous =
                previousMessages.length > safeEnv.OPENAI_CHAT_HISTORY_LIMIT
                  ? previousMessages
                      .concat(promptMessage)
                      .slice(-safeEnv.OPENAI_CHAT_HISTORY_LIMIT)
                  : [...previousMessages, promptMessage];

              // 回答と一緒に保存する
              await updateUserMessageHistory(redis, assistantKey, [
                ...previous,
                answerMessage,
              ]);
              await incrementTotalTokenCount(redis, usage);

              await notifyNewMessageToSlack(
                [promptMessage, answerMessage],
                message.author,
                additionalText
              );
            } else {
              // レスポンスが正常でない場合
              message.reply('(エラー: 回答生成に失敗');
            }

            return;
          }
        }
      );
    } else {
      // 人格の設定がない場合
      message.reply('(エラー: 人格不明)');
    }
  } catch (e: unknown) {
    message.reply('(エラー: 処理失敗)');
    await notifyErrorToSlack(e);
    return;
  }
}
