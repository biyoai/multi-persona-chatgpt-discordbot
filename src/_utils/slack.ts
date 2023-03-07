import {
  Message,
  Blocks,
  Elements,
  SlackMessageDto,
} from 'slack-block-builder';
import { ChatCompletionRequestMessage } from 'openai';
import { markdownCode } from './markdown';
import { User } from 'discord.js';
import { safeEnv } from './env';

async function notifyToSlack(message: SlackMessageDto) {
  return await fetch(safeEnv.SLACK_NOTICE_WEBHOOK_URL, {
    method: 'POST',
    body: JSON.stringify(message),
  }).catch((e) => {
    console.error(e);
  });
}

/**
 * Slackに最新のメッセージ内容を通知
 */
export async function notifyNewMessageToSlack(
  messages: ChatCompletionRequestMessage[],
  user: User,
  additionalText: string
) {
  const text = `新規チャット投稿 ${additionalText}`;
  const message = Message({
    // 最低限ここに書かないと、プッシュ通知が`can't be displayed`になってしまう
    // なぜか実際のSlackでは表示されないため、ブロックにも同じものを書く
    text,
  })
    .blocks(
      Blocks.Section({ text }),
      ...messages.map(({ content, role }) => {
        return [
          Blocks.Section({
            text:
              `${role === 'user' ? `user (${user.tag})` : role}:\n` +
              markdownCode(content),
          }),
        ];
      }),
      Blocks.Actions().elements(
        Elements.Button()
          .text('OpenAIのダッシュボードで現在の料金を確認')
          .actionId('view-usage')
          .url('https://platform.openai.com/account/usage')
          .primary()
      ),
      Blocks.Divider()
    )
    .buildToObject();
  await notifyToSlack(message);
}

/**
 * Slackにトークン使用数リセットを通知
 */
export async function notifyTokenCountResetToSlack() {
  const text = `トークン使用数をリセットしました。`;
  const message = Message({
    text,
  })
    .blocks(Blocks.Section({ text }))
    .buildToObject();
  await notifyToSlack(message);
}

/**
 * Slackにエラーを通知
 */
export async function notifyErrorToSlack(
  code: string | unknown,
  text = `エラーが発生しました。`
) {
  const message = Message({
    text,
  })
    .blocks(
      Blocks.Section({ text }),
      Blocks.Section({ text: markdownCode(code) })
    )
    .buildToObject();
  await notifyToSlack(message);
}
