import type { ThemePreference } from './api.ts'
import { getHealth } from './api.ts'

export type ActionOutcome = {
  ok: boolean
  message: string
}

export type ActionContext = {
  setTheme: (theme: ThemePreference) => Promise<boolean>
  requestAbout: () => void
}

export type RegisteredUiAction = {
  id: string
  label: string
  description: string
  hint?: string
  invoke: (context: ActionContext) => Promise<ActionOutcome> | ActionOutcome
}

/**
 * One registry drives both the command palette and the visible shell controls,
 * so a palette command can never be a hidden second implementation.
 */
export class ActionRegistry {
  readonly #actions = new Map<string, RegisteredUiAction>()

  register(action: RegisteredUiAction): this {
    if (this.#actions.has(action.id)) {
      throw new Error(`Action ${action.id} is already registered`)
    }
    this.#actions.set(action.id, action)
    return this
  }

  list(): RegisteredUiAction[] {
    return [...this.#actions.values()]
  }

  get(id: string): RegisteredUiAction | undefined {
    return this.#actions.get(id)
  }

  async invoke(id: string, context: ActionContext): Promise<ActionOutcome> {
    const action = this.#actions.get(id)
    if (!action) {
      return { ok: false, message: `No action is registered for ${id}` }
    }
    try {
      return await action.invoke(context)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false, message: `${action.label} failed: ${detail}` }
    }
  }
}

export function createActionRegistry(): ActionRegistry {
  return new ActionRegistry()
    .register({
      id: 'friday.check-service',
      label: 'Check local service',
      description: 'Ask the loopback service for its health and version',
      hint: 'Read only',
      invoke: async () => {
        const health = await getHealth()
        return {
          ok: true,
          message: `Local service answered: ${health.status}, version ${health.version}`,
        }
      },
    })
    .register({
      id: 'friday.about',
      label: 'About Friday',
      description: 'Version, bundled licences, and what this build cannot do',
      hint: 'Applies nothing',
      invoke: (context) => {
        context.requestAbout()
        return { ok: true, message: 'About Friday is open' }
      },
    })
}
