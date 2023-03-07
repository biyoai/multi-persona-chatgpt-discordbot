import { envsafe, num, str } from 'envsafe';
import dotenv from 'dotenv';
dotenv.config();

export const safeEnv = envsafe(
  {
    /** Railwayでは自動設定される */
    REDIS_URL: str(),
    DISCORD_TOKEN: str(),
    OPENAI_API_KEY: str(),
    /** 1Kトークンあたりの3.5-turboの料金(ドル) */
    OPENAI_CHAT_GPT_DOLLAR_PER_1K_TOKEN: num({
      allowEmpty: true,
      default: 0.002,
    }),
    /** 使える一日あたりのドル数 */
    OPENAI_DOLLAR_LIMIT_PER_DAY: num({ allowEmpty: true, default: 0.5 }),
    /** 読む過去メッセージの件数 */
    OPENAI_CHAT_HISTORY_LIMIT: num({
      allowEmpty: true,
      default: 10,
    }),
    /** 読む過去メッセージの最大文字数 (トークン数ではないので注意) */
    OPENAI_CHAT_STRING_LENGTH_LIMIT: num({
      allowEmpty: true,
      default: 1000,
    }),
    /** 生成トークン数 */
    OPENAI_CHAT_GPT_ANSWER_MAX_TOKEN: num({
      allowEmpty: true,
      default: 512,
    }),
  },
  {
    strict: true,
  }
);
