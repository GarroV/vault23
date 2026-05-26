export const en = {
  welcome_new: "Hi! I'm your personal task and notes assistant.\n\n🕐 You have a 14-day trial — all features included.\n\nUse the menu below or type /help.",
  welcome_back: 'Welcome back!',
  language_current: 'Current language: English 🇬🇧',
  language_choose: 'Choose language:',
  language_changed: 'Language changed to English 🇬🇧',
  error_unexpected: 'Something went wrong. Please try again.',
  cmd_unknown: 'Unknown command. Use the menu or type /help.',
  stats_summary: '📊 Stats:\n• Open tasks: {tasks}\n• Notes: {notes}\n• Pending reminders: {reminders}',
  gate_suspended: '⛔ Your account is suspended due to a failed payment. Update your payment method via /subscription.',
  gate_cancelled: '⛔ Your subscription has been cancelled. Subscribe again via /subscription.',
  gate_plan_limit: '⚠️ This feature is not available on your current plan. Upgrade via /subscription.',
  gate_usage_limit: '⚠️ Monthly usage limit reached. It resets next billing period.',
  past_due_warning: '⚠️ Your payment failed. Please update your payment method via /subscription.',
  delete_data_confirm: '⚠️ This will delete ALL your data: tasks, notes, contacts, knowledge base — everything. This cannot be undone.\n\nTo confirm, send: DELETE',
  delete_data_cancelled: 'Cancelled. No data was deleted.',
  delete_data_done: 'All your data has been deleted. Thank you for using the service.',
  delete_data_wrong: 'Wrong confirmation. Type DELETE to confirm.',
  consent_required: '📄 Please review our Terms of Service. Send /start to confirm your agreement.',

  // Help — main screen
  help_intro: 'Choose a section:',
  help_btn_tasks:       '📋 Tasks',
  help_btn_notes:       '📝 Notes',
  help_btn_voice:       '🎙 Voice',
  help_btn_reminders:   '⏰ Reminders',
  help_btn_contacts:    '👥 Contractors',
  help_btn_kb:          '🧠 Knowledge Base',
  help_btn_integrations:'🔗 Integrations',
  help_btn_account:     '⚙️ Account',

  // Help — sections
  help_tasks: `📋 Tasks

Create a task — /task
The bot will ask for a title, then offer to pick a topic and deadline. Deadline is optional — you can skip it.

Task list — /tasks
Shows open and in-progress tasks. Each has buttons:
• ▶️ In progress — changes status
• ✅ Done — closes the task
• ➕ Subtask — add a subtask

Filter — /filter
Shows only tasks for a selected topic (category).

Today's deadlines — /today
Only tasks due today.

Subtasks
Any task can be broken into subtasks via the ➕ button. They're linked to the parent task and visible in the list.

Soft delete
Completed tasks go to a trash bin and are kept for 90 days — you can restore them if needed.`,

  help_notes: `📝 Notes

Create a note — /note
After the command, just type the text. Or inline: /note Your note text

Note list — /notes
Recent notes with pagination. Search by content — /search query

Meeting mode — /meet
Enables a special mode: everything you type is saved as one long note with timestamps. Great for meeting minutes. Exit with /meetstop or /done.

Voice auto-save
Send a voice message → the bot transcribes it via Whisper and saves the text as a note (or asks if you want to create a task — see the Voice section).`,

  help_voice: `🎙 Voice messages

Just send a voice message — no commands needed.

What happens:
1. The bot downloads the audio from Telegram
2. Transcribes it via OpenAI Whisper
3. Analyzes: does the text look like a task?

If it looks like a task — shows the text with two options:
✅ Create a task
📝 Save as a note

If it's just information — saves it as a note immediately.

Limits
On trial: 50 voice messages per month. Resets on the 1st of each month.

Privacy
Note contents are not written to logs. The audio file is deleted after transcription.`,

  help_reminders: `⏰ Reminders

Set a reminder — /remind
The bot will ask for text and time. Time can be typed in natural language.

Examples:
• tomorrow at 10:00
• in 2 hours
• Friday 3:30pm

Reminder list — /reminders
Active reminders. Tap any to cancel it.

How it works
The bot checks reminders every minute and sends a notification to this chat. Time is stored in UTC — keep that in mind when entering times.`,

  help_contacts: `👥 Contractors & Pricelist

Add a contractor — /contractor
The bot will ask for a name and contact details (phone, email, etc.). A contractor is a company or sole trader.

Contractor list — /contractors
All contractors with their contact info.

Search — /find query
Searches by name and specialty.

Pricelist

Add an item — /addservice
Steps: name → price (e.g. "150/hr" or "500") → link to a contractor (optional).

My services — /services
Pricelist grouped by contractor. Items without a contractor appear in a separate block.

Print pricelist
Available in the cabinet — the /pricelist page generates a PDF-compatible document.`,

  help_kb: `🧠 Knowledge Base

A structured information store for your workspace — instructions, templates, answers to common questions.

Add an entry — /addkb
The bot will ask for a title and content. Afterwards — mandatory moderation: you'll see a preview with ✅ Approve / ❌ Reject buttons. The entry is not saved without approval.

Approved entries are indexed (vector embedding) and become searchable.

Ask a question — /ask question
The bot finds relevant entries and answers using AI. If no relevant entries exist — it will say so.

Examples:
/ask what's the deadline for project X
/ask how to prepare a completion certificate`,

  help_integrations: `🔗 Integrations

Google Calendar

Connect account — /connect
Opens a link for OAuth authorization via Google.

Sync — /sync
Tasks with deadlines are created as events in Google Calendar (primary calendar). Changes in Google Calendar update the task in the bot.

Email

Send an email — /email
The bot asks: recipient address → subject → body. Sends on your behalf via the configured address (EMAIL_FROM_ADDRESS in config).

Trial limits: 20 emails per month.`,

  help_account: `⚙️ Account

Subscription & plans — /subscription
Shows your current plan, status, usage limits, and a link to manage billing.

Plans:
• Trial — 14 days, all features
• Free — basic features, no voice or email
• Solo — 50 voice messages + 20 emails per month
• Team — 200 voice messages + 100 emails per month

Change language — /language
Switches the bot interface between Russian and English. Your data (tasks, notes) is not translated.

Settings — /settings
Language, subscription, data deletion.

Delete data — /deletedata
Complete and irreversible deletion of your workspace: tasks, notes, reminders, contractors, knowledge base — everything. Requires explicit confirmation.`,

  // Menu
  menu_title: 'Main menu',
  menu_settings_title: '⚙️ Settings',
  menu_admin_title: '🔧 Admin',
  btn_language: '🌐 Language',
  btn_subscription: '💳 Subscription',
  btn_delete_data: '🗑 Delete data',
  btn_admin_stats: '📊 Stats',
  btn_admin_cfg: '⚙️ Config',
  btn_admin_locales: '✏️ Bot texts',
  admin_stats_msg: '📊 Platform stats:\n\n• Workspaces: {workspaces}\n• Users: {users}\n• Tasks: {tasks}\n• Notes: {notes}',
  admin_locales_hint: '✏️ Bot texts can be edited in the cabinet under the Locales tab.',
} as const;
