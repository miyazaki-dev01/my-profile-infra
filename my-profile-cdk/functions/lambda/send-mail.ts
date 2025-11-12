import type {
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  APIGatewayProxyEvent,
} from "aws-lambda";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { z } from "zod";

// ============================================================
// 型定義 / 定数 / zod スキーマ
// ============================================================

// 入力ペイロード
type ContactPayload = {
  name: string;
  email: string;
  title: string;
  message: string;
};

// 既存の上限値を踏襲
const MAX = { NAME: 100, EMAIL: 100, TITLE: 300, MESSAGE: 5000 } as const;

// zod スキーマ
const BodySchema = z.object({
  name: z.string().min(1, "Invalid name").max(MAX.NAME),
  email: z.email("Invalid email").max(MAX.EMAIL),
  title: z.string().min(1, "Invalid title").max(MAX.TITLE),
  message: z.string().min(1, "Invalid message").max(MAX.MESSAGE),
});

// ============================================================
// ユーティリティ
// ============================================================

const getEnv = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
};

// 最小CORS：許可時のみヘッダを返す（許可しない場合は {} を返す）
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// 最小CORS：POST 応答にだけ Allow-Origin を付与
const allowOriginHeader = (
  event: APIGatewayProxyEvent
): Record<string, string> => {
  const reqOrigin = event.headers?.origin || event.headers?.Origin;
  if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) {
    return { "Access-Control-Allow-Origin": reqOrigin, Vary: "Origin" };
  }
  return {};
};

// JSON レスポンス
const json = (
  status: number,
  body: unknown,
  event: APIGatewayProxyEvent
): APIGatewayProxyResult => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    ...allowOriginHeader(event),
  },
  body: JSON.stringify(body),
});

const sanitizeHeader = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const nl2br = (s: string) => escapeHtml(s).replace(/\r?\n/g, "<br/>");
const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// ============================================================
// 入力の解析＆検証（zod）
// ============================================================

const parseAndValidate = (
  raw: string
): { ok: true; value: ContactPayload } | { ok: false; msg: string } => {
  let obj: unknown;
  try {
    obj = JSON.parse(raw || "{}");
  } catch {
    return { ok: false, msg: "Invalid JSON" };
  }
  const res = BodySchema.safeParse(obj);
  if (!res.success) {
    const msg = res.error.issues[0]?.message ?? "Bad Request";
    return { ok: false, msg };
  }
  const v = res.data;
  return {
    ok: true,
    value: {
      name: v.name.trim(),
      email: v.email.trim(),
      title: v.title.trim(),
      message: v.message.trim(),
    },
  };
};

// ============================================================
// メールテンプレート
// ============================================================

const buildOwnerMail = (p: ContactPayload, toOwner: string) => {
  const safeName = sanitizeHeader(p.name);
  const safeTitle = sanitizeHeader(p.title);
  const safeReply = sanitizeHeader(p.email);

  const subject = `【お問い合わせ】${safeTitle} - ${safeName} 様`;

  const text = `
送信者: ${p.name}
メール: ${p.email}

タイトル: ${p.title}

本文:
${p.message}
`;

  const html = `
<p><strong>【名前】</strong>: ${escapeHtml(p.name)}</p>
<p><strong>【メールアドレス】</strong>: ${escapeHtml(p.email)}</p>
<p><strong>【タイトル】</strong>: ${escapeHtml(p.title)}</p>
<p><strong>【内容】</strong></p>
<p>${nl2br(p.message)}</p>`;

  return { to: toOwner, replyTo: safeReply, subject, text, html };
};

const buildSenderMail = (p: ContactPayload, replyToForSender: string) => {
  const subject = "【Miyazaki's profile】お問い合わせありがとうございます";

  const text = `
${p.name} 様

この度はお問い合わせいただき、誠にありがとうございます。
内容を確認のうえ、折り返しご連絡いたします。
返信があるまで今しばらくお待ちいただけますと幸いです。

このメールに心当たりのない場合は、
お手数ですがメールを破棄してくださいますようお願いいたします。

――――――――――――――

【お問い合わせ内容】

${p.title}

${p.message}
`;

  const html = `
<p>${escapeHtml(p.name)} 様</p>
<p>
この度はお問い合わせいただき、誠にありがとうございます。<br/>
内容を確認のうえ、折り返しご連絡いたします。<br/>
返信があるまで今しばらくお待ちいただけますと幸いです。
</p>
<p>
このメールに心当たりのない場合は、<br/>
お手数ですがメールを破棄してくださいますようお願いいたします。
</p>

<hr />

<p>【お問い合わせ内容】</p>
<p>${escapeHtml(p.title)}</p>
<p>${nl2br(p.message)}</p>
`;

  return { to: p.email, replyTo: replyToForSender, subject, text, html };
};

// ============================================================
// 送信ユーティリティ
// ============================================================

const ses = new SESv2Client({});

type MailParts = {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
};

const sendSimpleMail = async (from: string, mail: MailParts) => {
  const cmd = new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [mail.to] },
    ReplyToAddresses: [sanitizeHeader(mail.replyTo)],
    Content: {
      Simple: {
        Subject: { Charset: "UTF-8", Data: sanitizeHeader(mail.subject) },
        Body: {
          Text: { Charset: "UTF-8", Data: mail.text },
          Html: { Charset: "UTF-8", Data: mail.html },
        },
      },
    },
  });
  await ses.send(cmd);
};

// ============================================================
// ハンドラ（最小CORS + zod + SES）
// ============================================================

export const handler: APIGatewayProxyHandler = async (event) => {
  const FROM_EMAIL = getEnv("FROM_EMAIL");
  const TO_EMAIL = getEnv("TO_EMAIL");

  // OPTIONS は即座に応答
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...allowOriginHeader(event) },
      body: "",
    };
  }

  // POST 以外は拒否
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, message: "Method Not Allowed" }, event);
  }

  try {
    if (!event.body) {
      return json(400, { ok: false, message: "Bad Request" }, event);
    }

    // zod で入力の解析＆検証
    const parsed = parseAndValidate(event.body);
    if (!parsed.ok) {
      return json(400, { ok: false, message: parsed.msg }, event);
    }
    const payload = parsed.value;

    // 1通目：運営者へ
    const ownerMail = buildOwnerMail(payload, TO_EMAIL);
    await sendSimpleMail(FROM_EMAIL, ownerMail);

    // 2通目：送信者へ（失敗は致命ではない）
    try {
      const senderMail = buildSenderMail(payload, TO_EMAIL);
      await sendSimpleMail(FROM_EMAIL, senderMail);
    } catch (e) {
      console.error("Auto-reply failed:", e);
    }

    return json(200, { ok: true }, event);
  } catch (e) {
    console.error("SendMail failed:", e);
    return json(500, { ok: false, message: "Mail send failed" }, event);
  }
};
