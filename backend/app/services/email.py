"""
Email service — async SMTP via aiosmtplib.
Works with Gmail App Passwords, SendGrid SMTP, Mailgun, etc.
If SMTP_HOST is not configured, emails are logged to console instead (dev mode).
"""
import logging
from email.message import EmailMessage

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


async def send_email(to: str, subject: str, html_body: str) -> None:
    """Send an HTML email. Falls back to console log if SMTP is not configured."""
    if not settings.SMTP_HOST:
        logger.warning(
            "[EMAIL - no SMTP configured] To: %s | Subject: %s\n%s",
            to, subject, html_body
        )
        return

    import aiosmtplib

    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content("Please view this email in an HTML-capable client.")
    msg.add_alternative(html_body, subtype="html")

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
        logger.info("Email sent to %s: %s", to, subject)
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
        raise


async def send_password_reset_email(to: str, reset_url: str) -> None:
    html = f"""
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#0f172a;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;
              padding:40px;border:1px solid #2a3a5c;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:2rem;">🎯</div>
      <h1 style="color:#f1f5f9;font-size:1.4rem;margin:12px 0 4px;">
        Reset your password
      </h1>
      <p style="color:#94a3b8;font-size:0.875rem;margin:0;">
        JobMatch AI received a request to reset your password.
      </p>
    </div>

    <p style="color:#cbd5e1;font-size:0.9rem;line-height:1.6;">
      Click the button below to choose a new password. This link expires in
      <strong style="color:#f1f5f9;">1 hour</strong>.
    </p>

    <div style="text-align:center;margin:32px 0;">
      <a href="{reset_url}"
         style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#6366f1);
                color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;
                font-weight:600;font-size:0.95rem;">
        Reset password
      </a>
    </div>

    <p style="color:#64748b;font-size:0.8rem;text-align:center;margin-top:24px;">
      If you didn't request this, you can safely ignore this email.<br>
      Your password will not change.
    </p>

    <hr style="border:none;border-top:1px solid #2a3a5c;margin:24px 0;">
    <p style="color:#475569;font-size:0.75rem;text-align:center;margin:0;">
      Or copy this link into your browser:<br>
      <span style="color:#64748b;word-break:break-all;">{reset_url}</span>
    </p>
  </div>
</body>
</html>
"""
    await send_email(to, "Reset your JobMatch AI password", html)
