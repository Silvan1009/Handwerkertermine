import nodemailer from "nodemailer";

export type Send = (to: string, subject: string, text: string) => Promise<void>;
export type SendSms = (phone: string, text: string) => Promise<void>;
type Mail = { to: string; subject: string; text: string; at: Date };

const smtp = process.env.SMTP_URL && nodemailer.createTransport(process.env.SMTP_URL);

/** Ohne SMTP (Entwicklung): Mails landen im Test-Postfach unter /postfach und in der Konsole. */
export const devMailboxEnabled = !smtp && process.env.NODE_ENV !== "production";
const g = globalThis as { devMailbox?: Mail[] }; // globalThis: überlebt Hot Reload im Dev-Server
export const devMailbox = (g.devMailbox ??= []);

export const send: Send = async (to, subject, text) => {
  if (smtp) return void (await smtp.sendMail({ from: process.env.MAIL_FROM ?? "Handwerkertermine <noreply@localhost>", to, subject, text }));
  if (!devMailboxEnabled) throw new Error("SMTP_URL fehlt – Mailversand nicht konfiguriert");
  devMailbox.unshift({ to, subject, text, at: new Date() });
  devMailbox.splice(50);
  console.log(`\n📧 An: ${to}\n   ${subject}\n   ${text.replaceAll("\n", "\n   ")}\n`);
};

/** SMS: Ein echter Anbieter ist nicht angebunden – in der Entwicklung landet die SMS im Test-Postfach. */
export const sendSms: SendSms = async (phone, text) => {
  if (!devMailboxEnabled) throw new Error("SMS-Versand nicht konfiguriert");
  devMailbox.unshift({ to: phone, subject: "📱 SMS", text, at: new Date() });
  devMailbox.splice(50);
  console.log(`\n📱 SMS an ${phone}: ${text}\n`);
};
