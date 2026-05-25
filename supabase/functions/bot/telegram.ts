export async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[telegram] sendMessage failed', {
        chatId,
        status: response.status,
        error: errorText,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[telegram] network error during sendMessage', { chatId, error: message });
  }
}
