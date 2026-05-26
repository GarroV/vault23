INSERT INTO app_settings (key, value, updated_at)
VALUES ('TELEGRAM_BOT_USERNAME', 'vault23_assist_bot', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
