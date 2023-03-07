# multi-persona-chatgpt-discordbot

複数の人格を使い分けるChat GPT bot。

## 事前準備

### Discord

`bot`スコープ、メッセージの送信、リアクションの権限が必要。

また、**管理画面で `MESSAGE CONTENT INTENT` を有効化する** こと。

### Railway

#### Redis

以下のキーのハッシュ値を作る。

- `discord-bot:openai:total-token-string`
- `discord-bot:openai:assistant-trigger-words-hash`
  - `人格キー: ["トリガーワード", ...]` (必須)
- `discord-bot:openai:assistant-names-hash`
  - `default: デフォルト人格名` (必須)
  - `人格キー: 人格名` (各人格ごとに作る)
- `discord-bot:openai:assistant-system-messages-hash`
  - `default: デフォルト教育内容` (必須)
  - `人格キー: 教育内容` (各人格ごとに作る)
- `discord-bot:openai:assistant-last-messages-hash`
  - `default: こんにちは〇〇です。なにか御用ですか?` (必須)
  - `人格キー: なにか御用ですか？的なメッセージ` (各人格ごとに作る)
- `discord-bot:openai:message-history-for-assistants-hash`
  - 内容の設定は不要

#### Bot本体

Redisデプロイ後、このリポジトリを選択してデプロイする。設定は`railway.toml`に書いてある。

## 環境変数

Botインスタンスしか無いため全部Shared Variableで問題ない。

### 必須の環境変数

- `SLACK_NOTICE_WEBHOOK_URL` : Webhook
- `DISCORD_TOKEN` : Discord Botトークン
- `OPENAI_API_KEY` : OpenAI APIトークン

`REDIS_TOKEN` は環境にRedisがあれば自動で設定される。

### 任意の環境変数

- `OPENAI_CHAT_GPT_DOLLAR_PER_1K_TOKEN` : 1Kトークンあたりの料金
- `OPENAI_DOLLAR_LIMIT_PER_DAY` : 使える1日あたりのトークン数
- `OPENAI_CHAT_HISTORY_LIMIT` : 読む過去メッセージの件数
- `OPENAI_CHAT_STRING_LENGTH_LIMIT` : 読むプロンプトの合計長さ(トークンではない)
- `OPENAI_CHAT_GPT_ANSWER_MAX_TOKEN` : 回答に使う生成トークン数

## 開発

```sh
railway link
```

```sh
docker compose up -d
railway run yarn build
railway run yarn start
```

紛らわしいが、リンクしたRailway環境が`production`でも、ローカルではローカルの`.env`を使う。
