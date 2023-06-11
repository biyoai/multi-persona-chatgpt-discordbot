import type { CreateChatCompletionRequest } from 'openai'
import { safeEnv } from './env'

export const MAX_PROMPT_LENGTH = 200
export const DEFAULT_ASSISTANT_NAME = 'default'

export const CHAT_GPT_PARAMS: Omit<CreateChatCompletionRequest, 'messages'> = {
  model: 'gpt-3.5-turbo',
  max_tokens: safeEnv.OPENAI_CHAT_GPT_ANSWER_MAX_TOKEN,
  // 上げるとやばい返答が返ってくる
  temperature: 1.1,
  // 新しい話題を話しづらくなるらしい
  presence_penalty: -0.3,
}
