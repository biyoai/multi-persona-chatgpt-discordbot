import { Redis } from 'ioredis';
import { createRedisKeysMap } from 'create-redis-key';
import { safeEnv } from './env';

const redisKeysConfig = {
  SCOPE_FIRST_PART: [],
  discordBot: {
    SCOPE_FIRST_PART: ['discord-bot'],
    openai: {
      SCOPE_FIRST_PART: ['openai'],
      totalTokenString: ['total-token-string'],
      assistant: {
        SCOPE_FIRST_PART: ['assistant'],
        triggerWordsHash: ['trigger-words-hash'],
        namesHash: ['names-hash'],
        lastMessagesHash: ['last-messages-hash'],
        systemMessagesHash: ['system-messages-hash'],
      },
      messageHistoryForAssistantsHash: ['message-history-for-assistants-hash'],
    },
  },
} as const;
export const RedisKeysMap = createRedisKeysMap(redisKeysConfig);

export function getRedisClient() {
  /**
   * ここでcatchすると無限にリトライしてしまうっぽい
   * @see https://github.com/luin/ioredis/issues/1146
   */
  return new Redis(safeEnv.REDIS_URL);
}
