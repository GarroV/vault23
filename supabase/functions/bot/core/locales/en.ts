export const en = {
  welcome_new: 'Hi! I\'ll help you manage your tasks.',
  language_current: 'Current language: English 🇬🇧',
  language_choose: 'Choose language:',
  language_changed: 'Language changed to English 🇬🇧',
  error_unexpected: 'Something went wrong. Please try again.',
  cmd_unknown: 'Unknown command. Type /help for the list.',
  stats_summary: '📊 Stats:\n• Open tasks: {tasks}\n• Notes: {notes}\n• Pending reminders: {reminders}',
  gate_suspended: '⛔ Your account is suspended due to a failed payment. Update your payment method via /subscription.',
  gate_cancelled: '⛔ Your subscription has been cancelled. Subscribe again via /subscription.',
  gate_plan_limit: '⚠️ This feature is not available on your current plan. Upgrade via /subscription.',
  gate_usage_limit: '⚠️ Monthly usage limit reached. It resets next billing period or on plan upgrade.',
  past_due_warning: '⚠️ Your payment failed. Please update your payment method via /subscription before your account is suspended.',
} as const;
