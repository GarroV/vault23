import type { BotModule, BotEvent, SessionState } from './types.ts';

export class ModuleRegistry {
  private readonly modules: BotModule[] = [];

  register(module: BotModule): void {
    this.modules.push(module);
  }

  route(event: BotEvent, session: SessionState): BotModule | null {
    // 1. Exact command match
    if (event.command) {
      const byCommand = this.modules.find(m => m.commands.includes(event.command!));
      if (byCommand) return byCommand;
    }
    // 2. Context-based routing (active session, canHandle)
    return this.modules.find(m => m.canHandle(event, session)) ?? null;
  }
}
