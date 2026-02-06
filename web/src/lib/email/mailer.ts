import nodemailer from 'nodemailer'

let _transporter: nodemailer.Transporter | null = null

export function getMailer(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
    })
  }
  return _transporter
}

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
  replyTo?: string
}): Promise<void> {
  const mailer = getMailer()

  await mailer.sendMail({
    from: process.env.EMAIL_FROM || 'Cap Tracker <noreply@captracker.local>',
    to: options.to,
    subject: options.subject,
    html: options.html,
    replyTo: options.replyTo,
  })
}
